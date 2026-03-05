import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';

describe('FeedController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authToken: string;
  let userId: string;

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
    await prisma.feedItem.deleteMany();
    await prisma.view.deleteMany();
    await prisma.like.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.video.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.profile.deleteMany();
    await prisma.userQuota.deleteMany();
    await prisma.user.deleteMany();

    // Create test user and get auth token
    const registerResponse = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({
        email: 'feedtest@example.com',
        password: 'Test123!@#',
        displayName: 'Feed Test User',
      });

    authToken = registerResponse.body.accessToken;
    userId = registerResponse.body.user.id;

    // Verify user email for testing
    await prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true, status: 'ACTIVE' },
    });

    // Create test videos and feed items
    await createTestVideos();
  });

  afterAll(async () => {
    await prisma.feedItem.deleteMany();
    await prisma.view.deleteMany();
    await prisma.like.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.video.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.profile.deleteMany();
    await prisma.userQuota.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
  });

  async function createTestVideos() {
    // Create test videos
    const videos = [
      {
        title: 'Video 1 - Work Sample',
        description: 'Test video 1',
        type: 'WORK_SAMPLE',
        rawUrl: 'https://example.com/video1.mp4',
        status: 'READY',
        visibility: 'PUBLIC',
      },
      {
        title: 'Video 2 - Portfolio',
        description: 'Test video 2',
        type: 'PORTFOLIO',
        rawUrl: 'https://example.com/video2.mp4',
        status: 'READY',
        visibility: 'PUBLIC',
      },
      {
        title: 'Video 3 - Tip',
        description: 'Test video 3',
        type: 'TIP',
        rawUrl: 'https://example.com/video3.mp4',
        status: 'READY',
        visibility: 'PUBLIC',
      },
    ];

    for (const videoData of videos) {
      const video = await prisma.video.create({
        data: {
          ...videoData,
          userId,
        },
      });

      // Create feed items with different scores
      await prisma.feedItem.create({
        data: {
          videoId: video.id,
          score: Math.random() * 100,
          factors: {
            recency: Math.random(),
            engagement: Math.random(),
            aiRelevance: Math.random(),
            profileScore: Math.random(),
          },
        },
      });
    }
  }

  describe('GET /v1/feed', () => {
    it('should get feed with default pagination', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/feed')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('items');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(response.body.items.length).toBeGreaterThan(0);
      expect(response.body.pagination).toHaveProperty('page', 1);
      expect(response.body.pagination).toHaveProperty('limit');
      expect(response.body.pagination).toHaveProperty('total');
      expect(response.body.pagination).toHaveProperty('hasMore');
    });

    it('should get feed with custom pagination', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/feed?page=1&limit=2')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.items.length).toBeLessThanOrEqual(2);
      expect(response.body.pagination.limit).toBe(2);
    });

    it('should return feed items sorted by score', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/feed')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const items = response.body.items;
      if (items.length > 1) {
        // Check if items are sorted by score (descending)
        for (let i = 0; i < items.length - 1; i++) {
          expect(items[i].score).toBeGreaterThanOrEqual(items[i + 1].score);
        }
      }
    });

    it('should fail without authentication', async () => {
      await request(app.getHttpServer())
        .get('/v1/feed')
        .expect(401);
    });

    it('should fail with invalid token', async () => {
      await request(app.getHttpServer())
        .get('/v1/feed')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should include video data in feed items', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/feed')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const firstItem = response.body.items[0];
      expect(firstItem).toHaveProperty('video');
      expect(firstItem.video).toHaveProperty('id');
      expect(firstItem.video).toHaveProperty('title');
      expect(firstItem.video).toHaveProperty('description');
      expect(firstItem.video).toHaveProperty('thumbnailUrl');
    });

    it('should include author profile in feed items', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/feed')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const firstItem = response.body.items[0];
      expect(firstItem).toHaveProperty('author');
      expect(firstItem.author).toHaveProperty('displayName');
      expect(firstItem.author).toHaveProperty('slug');
    });
  });

  describe('GET /v1/feed/recommended', () => {
    it('should get recommended videos', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/feed/recommended')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('items');
      expect(Array.isArray(response.body.items)).toBe(true);
    });

    it('should get recommendations based on video ID', async () => {
      const videos = await prisma.video.findMany({ take: 1 });
      if (videos.length > 0) {
        const response = await request(app.getHttpServer())
          .get(`/v1/feed/recommended?videoId=${videos[0].id}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body).toHaveProperty('items');
      }
    });
  });

  describe('GET /v1/feed/trending', () => {
    it('should get trending videos', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/feed/trending')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('items');
      expect(Array.isArray(response.body.items)).toBe(true);
    });

    it('should get trending videos with time range', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/feed/trending?period=week')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('items');
    });
  });

  describe('GET /v1/feed/following', () => {
    it('should get feed from followed users', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/feed/following')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('items');
      expect(Array.isArray(response.body.items)).toBe(true);
    });
  });
});
