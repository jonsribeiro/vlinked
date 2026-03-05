import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }));
    
    await app.init();
    prisma = app.get(PrismaService);

    // Clean up test data
    await prisma.refreshToken.deleteMany();
    await prisma.profile.deleteMany();
    await prisma.userQuota.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany();
    await prisma.profile.deleteMany();
    await prisma.userQuota.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
  });

  describe('POST /v1/auth/register', () => {
    const registerDto = {
      email: 'test@example.com',
      password: 'Test123!@#',
      displayName: 'Test User',
    };

    it('should register a new user successfully', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send(registerDto)
        .expect(201);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('tokenType', 'Bearer');
      expect(response.body).toHaveProperty('expiresIn');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user).toHaveProperty('email', registerDto.email);
      expect(response.body.user).toHaveProperty('role', 'USER');
      expect(response.body.user).toHaveProperty('emailVerified', false);
    });

    it('should fail when email already exists', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send(registerDto)
        .expect(409);
    });

    it('should fail with invalid email format', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          ...registerDto,
          email: 'invalid-email',
        })
        .expect(400);
    });

    it('should fail with weak password', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          ...registerDto,
          email: 'another@example.com',
          password: '123',
        })
        .expect(400);
    });

    it('should fail without required fields', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({})
        .expect(400);
    });
  });

  describe('POST /v1/auth/login', () => {
    const loginDto = {
      email: 'test@example.com',
      password: 'Test123!@#',
    };

    it('should login with valid credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send(loginDto)
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('tokenType', 'Bearer');
      expect(response.body.user).toHaveProperty('email', loginDto.email);
    });

    it('should fail with invalid email', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: loginDto.password,
        })
        .expect(401);
    });

    it('should fail with invalid password', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          email: loginDto.email,
          password: 'wrongpassword',
        })
        .expect(401);
    });

    it('should fail without credentials', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({})
        .expect(400);
    });
  });

  describe('POST /v1/auth/refresh', () => {
    let refreshToken: string;

    beforeAll(async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'Test123!@#',
        });
      
      refreshToken = loginResponse.body.refreshToken;
    });

    it('should refresh tokens with valid refresh token', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.refreshToken).not.toBe(refreshToken); // Token rotation
    });

    it('should fail with invalid refresh token', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);
    });

    it('should fail without refresh token', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({})
        .expect(400);
    });

    it('should fail when using revoked refresh token', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });
  });

  describe('POST /v1/auth/logout', () => {
    it('should logout successfully', async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'Test123!@#',
        });

      await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .send({ refreshToken: loginResponse.body.refreshToken })
        .expect(200);

      // Verify token is revoked
      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: loginResponse.body.refreshToken })
        .expect(401);
    });
  });

  describe('GET /v1/auth/verify-email', () => {
    it('should verify email with valid token', async () => {
      // Create a new user to get a verification token
      const registerResponse = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          email: 'verify@example.com',
          password: 'Test123!@#',
          displayName: 'Verify User',
        });

      // Get the verification token from database
      const user = await prisma.user.findUnique({
        where: { email: 'verify@example.com' },
      });

      const response = await request(app.getHttpServer())
        .get('/v1/auth/verify-email')
        .query({ token: user?.verificationToken })
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Email verificado com sucesso!');

      // Verify user is now verified
      const verifiedUser = await prisma.user.findUnique({
        where: { email: 'verify@example.com' },
      });
      expect(verifiedUser?.emailVerified).toBe(true);
      expect(verifiedUser?.status).toBe('ACTIVE');
    });

    it('should fail with invalid token', async () => {
      await request(app.getHttpServer())
        .get('/v1/auth/verify-email')
        .query({ token: 'invalid-token' })
        .expect(404);
    });

    it('should fail without token', async () => {
      await request(app.getHttpServer())
        .get('/v1/auth/verify-email')
        .expect(400);
    });
  });

  describe('POST /v1/auth/resend-verification', () => {
    it('should resend verification email', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/resend-verification')
        .send({ email: 'test@example.com' })
        .expect(200);

      expect(response.body).toHaveProperty('message');
    });

    it('should not reveal if email does not exist', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/resend-verification')
        .send({ email: 'nonexistent@example.com' })
        .expect(200);

      expect(response.body).toHaveProperty('message');
    });
  });
});
