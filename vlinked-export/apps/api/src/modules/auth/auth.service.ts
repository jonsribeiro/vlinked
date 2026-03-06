import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { EmailService } from '../email/email.service';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  AuthResponseDto,
  VerifyEmailDto,
  ResendVerificationDto,
} from './dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Registra um novo usuário e envia email de verificação
   */
  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    const { email, password, displayName } = registerDto;

    // Verificar se email já existe
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('Email já cadastrado');
    }

    // Hash da senha
    const passwordHash = await this.hashPassword(password);

    // Gerar token de verificação
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas

    // Criar usuário com transação (usuário + perfil)
    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email,
          passwordHash,
          role: 'USER',
          status: 'PENDING_VERIFICATION',
          verificationToken,
          verificationExpires,
        },
      });

      // Criar perfil
      await tx.profile.create({
        data: {
          userId: newUser.id,
          displayName: displayName || email.split('@')[0],
          slug: await this.generateUniqueSlug(displayName || email.split('@')[0]),
        },
      });

      // Criar quota padrão
      await tx.userQuota.create({
        data: {
          userId: newUser.id,
          tier: 'FREE',
        },
      });

      return newUser;
    });

    // Enviar email de verificação (não bloqueante)
    this.emailService.sendVerificationEmail(
      email,
      verificationToken,
      displayName || email.split('@')[0],
    ).catch((err) => {
      this.logger.error(`Erro ao enviar email de verificação: ${err.message}`);
    });

    this.logger.log(`Novo usuário registrado: ${user.email}`);

    // Gerar tokens
    return this.generateTokens({
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
    });
  }

  /**
   * Verifica o email do usuário
   */
  async verifyEmail(verifyEmailDto: VerifyEmailDto): Promise<void> {
    const { token } = verifyEmailDto;

    const user = await this.prisma.user.findUnique({
      where: { verificationToken: token },
    });

    if (!user) {
      throw new NotFoundException('Token de verificação inválido');
    }

    if (user.emailVerified) {
      throw new BadRequestException('Email já verificado');
    }

    if (user.verificationExpires && user.verificationExpires < new Date()) {
      throw new BadRequestException('Token de verificação expirado');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        status: 'ACTIVE',
        verificationToken: null,
        verificationExpires: null,
      },
    });

    this.logger.log(`Email verificado: ${user.email}`);
  }

  /**
   * Reenvia email de verificação
   */
  async resendVerification(resendDto: ResendVerificationDto): Promise<void> {
    const { email } = resendDto;

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Não revelar se email existe ou não
      this.logger.log(`Tentativa de reenvio para email não existente: ${email}`);
      return;
    }

    if (user.emailVerified) {
      throw new BadRequestException('Email já verificado');
    }

    // Gerar novo token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        verificationToken,
        verificationExpires,
      },
    });

    const profile = await this.prisma.profile.findUnique({
      where: { userId: user.id },
    });

    await this.emailService.sendVerificationEmail(
      email,
      verificationToken,
      profile?.displayName || email.split('@')[0],
    );

    this.logger.log(`Email de verificação reenviado: ${email}`);
  }

  /**
   * Login de usuário
   */
  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const { email, password } = loginDto;

    // Buscar usuário
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Email ou senha incorretos');
    }

    // Verificar status
    if (user.status === 'SUSPENDED') {
      throw new UnauthorizedException('Conta suspensa. Entre em contato com o suporte.');
    }

    if (user.status === 'BANNED') {
      throw new UnauthorizedException('Conta banida permanentemente.');
    }

    // Verificar senha
    const isPasswordValid = await this.comparePassword(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Email ou senha incorretos');
    }

    // Atualizar último login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    this.logger.log(`Usuário logado: ${user.email}`);

    // Gerar tokens
    return this.generateTokens({
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
    });
  }

  /**
   * Refresh token - implementa token rotation
   */
  async refreshToken(refreshTokenDto: RefreshTokenDto): Promise<AuthResponseDto> {
    const { refreshToken } = refreshTokenDto;

    // Buscar todos os tokens ativos do usuário
    const activeTokens = await this.prisma.refreshToken.findMany({
      where: {
        revoked: false,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    // Encontrar token correspondente comparando hashes
    const storedToken = await this.findTokenByHash(refreshToken, activeTokens);

    if (!storedToken) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    if (storedToken.revoked) {
      throw new UnauthorizedException('Refresh token revogado');
    }

    if (storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expirado');
    }

    // Verificar status do usuário
    if (storedToken.user.status === 'BANNED') {
      throw new UnauthorizedException('Conta banida permanentemente.');
    }

    if (storedToken.user.status === 'SUSPENDED') {
      throw new UnauthorizedException('Conta suspensa. Entre em contato com o suporte.');
    }

    // Revogar token antigo (token rotation)
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revoked: true },
    });

    this.logger.log(`Refresh token rotacionado: ${storedToken.user.email}`);

    // Gerar novos tokens
    return this.generateTokens({
      id: storedToken.user.id,
      email: storedToken.user.email,
      role: storedToken.user.role,
      emailVerified: storedToken.user.emailVerified,
    });
  }

  /**
   * Logout - revoga refresh token
   */
  async logout(refreshToken: string): Promise<void> {
    const activeTokens = await this.prisma.refreshToken.findMany({
      where: { revoked: false },
    });

    const storedToken = await this.findTokenByHash(refreshToken, activeTokens);

    if (storedToken) {
      await this.prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { revoked: true },
      });
    }

    this.logger.log('Logout realizado');
  }

  /**
   * Logout de todos os dispositivos
   */
  async logoutAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId },
      data: { revoked: true },
    });

    this.logger.log(`Logout de todos os dispositivos: ${userId}`);
  }

  /**
   * Gera um slug único para o perfil
   */
  private async generateUniqueSlug(baseName: string): Promise<string> {
    const sanitized = baseName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    let slug = sanitized;
    let counter = 1;

    while (await this.prisma.profile.findUnique({ where: { slug } })) {
      slug = `${sanitized}-${counter}`;
      counter++;
    }

    return slug;
  }

  /**
   * Hash de senha com bcrypt
   */
  async hashPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return bcrypt.hash(password, saltRounds);
  }

  /**
   * Comparar senha com hash
   */
  async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Hash de refresh token com SHA-256
   */
  private hashRefreshToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Encontra um token no banco comparando hashes
   */
  private async findTokenByHash(
    plainToken: string,
    tokens: Array<{ id: string; tokenHash: string; [key: string]: any }>,
  ): Promise<any | null> {
    const inputHash = this.hashRefreshToken(plainToken);
    return tokens.find((t) => t.tokenHash === inputHash) || null;
  }

  /**
   * Gerar access token JWT
   */
  private generateAccessToken(payload: {
    sub: string;
    email: string;
    role: string;
    emailVerified: boolean;
  }): string {
    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>('jwt.secret'),
      expiresIn: this.configService.get<string>('jwt.accessExpiration'),
    });
  }

  /**
   * Gerar refresh token e salvar hash no banco
   */
  private async generateRefreshToken(userId: string): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresIn = this.configService.get<string>('jwt.refreshExpiration');
    const tokenHash = this.hashRefreshToken(token);
    const expiresAt = this.parseExpiration(expiresIn);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });

    return token;
  }

  /**
   * Gerar ambos os tokens (access + refresh)
   */
  private async generateTokens(user: {
    id: string;
    email: string;
    role: string;
    emailVerified: boolean;
  }): Promise<AuthResponseDto> {
    const accessToken = this.generateAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
    });

    const refreshToken = await this.generateRefreshToken(user.id);

    const expiresIn = this.parseExpirationToSeconds(
      this.configService.get<string>('jwt.accessExpiration'),
    );

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
      },
    };
  }

  /**
   * Parse expiration string para Date
   */
  private parseExpiration(expiration: string): Date {
    const match = expiration.match(/^(\d+)([dhm])$/);
    if (!match) {
      throw new BadRequestException('Formato de expiração inválido');
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];
    const now = new Date();

    switch (unit) {
      case 'd':
        return new Date(now.getTime() + value * 24 * 60 * 60 * 1000);
      case 'h':
        return new Date(now.getTime() + value * 60 * 60 * 1000);
      case 'm':
        return new Date(now.getTime() + value * 60 * 1000);
      default:
        throw new BadRequestException('Unidade de expiração inválida');
    }
  }

  /**
   * Parse expiration string para segundos
   */
  private parseExpirationToSeconds(expiration: string): number {
    const match = expiration.match(/^(\d+)([dhm])$/);
    if (!match) {
      return 900; // Default 15 minutos
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 'd':
        return value * 24 * 60 * 60;
      case 'h':
        return value * 60 * 60;
      case 'm':
        return value * 60;
      default:
        return 900;
    }
  }
}
