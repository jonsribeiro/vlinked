import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cria um perfil para o usuário
   */
  async create(userId: string, createProfileDto: CreateProfileDto) {
    const { displayName, slug, bio, profession, city, state, country } = createProfileDto;

    // Verificar se slug já existe
    const existingSlug = await this.prisma.profile.findUnique({
      where: { slug },
    });

    if (existingSlug) {
      throw new ConflictException('Slug já está em uso');
    }

    // Verificar se usuário já tem perfil
    const existingProfile = await this.prisma.profile.findUnique({
      where: { userId },
    });

    if (existingProfile) {
      throw new ConflictException('Usuário já possui um perfil');
    }

    const profile = await this.prisma.profile.create({
      data: {
        userId,
        displayName,
        slug,
        bio,
        profession,
        city,
        state,
        country,
      },
    });

    this.logger.log(`Perfil criado: ${slug}`);

    return profile;
  }

  /**
   * Busca perfil por ID
   */
  async findById(id: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('Perfil não encontrado');
    }

    return profile;
  }

  /**
   * Busca perfil por slug
   */
  async findBySlug(slug: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { slug },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('Perfil não encontrado');
    }

    return profile;
  }

  /**
   * Busca perfil por userId
   */
  async findByUserId(userId: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('Perfil não encontrado');
    }

    return profile;
  }

  /**
   * Atualiza perfil
   */
  async update(userId: string, updateProfileDto: UpdateProfileDto) {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Perfil não encontrado');
    }

    const updatedProfile = await this.prisma.profile.update({
      where: { userId },
      data: updateProfileDto,
    });

    this.logger.log(`Perfil atualizado: ${profile.slug}`);

    return updatedProfile;
  }

  /**
   * Incrementa contador de vídeos
   */
  async incrementVideosCount(userId: string): Promise<void> {
    await this.prisma.profile.update({
      where: { userId },
      data: { videosCount: { increment: 1 } },
    });
  }

  /**
   * Decrementa contador de vídeos
   */
  async decrementVideosCount(userId: string): Promise<void> {
    await this.prisma.profile.update({
      where: { userId },
      data: { videosCount: { decrement: 1 } },
    });
  }

  /**
   * Incrementa contador de seguidores
   */
  async incrementFollowers(userId: string): Promise<void> {
    await this.prisma.profile.update({
      where: { userId },
      data: { followersCount: { increment: 1 } },
    });
  }

  /**
   * Decrementa contador de seguidores
   */
  async decrementFollowers(userId: string): Promise<void> {
    await this.prisma.profile.update({
      where: { userId },
      data: { followersCount: { decrement: 1 } },
    });
  }

  /**
   * Incrementa contador de seguindo
   */
  async incrementFollowing(userId: string): Promise<void> {
    await this.prisma.profile.update({
      where: { userId },
      data: { followingCount: { increment: 1 } },
    });
  }

  /**
   * Decrementa contador de seguindo
   */
  async decrementFollowing(userId: string): Promise<void> {
    await this.prisma.profile.update({
      where: { userId },
      data: { followingCount: { decrement: 1 } },
    });
  }
}
