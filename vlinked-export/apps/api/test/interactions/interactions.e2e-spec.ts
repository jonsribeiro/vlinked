import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';

describe('InteractionsController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authToken: string;
  let userId: string;
  let videoId: string;
  let commentId: string;

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
        email: 'interactiontest@example.com',
        password: 'Test123!@#',
        displayName: 'Interaction Test User',
      });

    authToken = registerResponse.body.accessToken;
    userId = registerResponse.body.user.id;

    // Verify user email for testing
    await prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true, status: 'ACTIVE' },
    });

    // Create test video
    const video = await prisma.video.create({
      data: {
        title: 'Test Video for Interactions',
        description: 'Video for testing interactions',
        type: 'WORK_SAMPLE',
        rawUrl: 'https://example.com/test-video.mp4',
        status: 'READY',
        visibility: 'PUBLIC',
        userId,
      },
    });
    videoId = video.id;
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

  describe('POST /v1/videos/:id/like', () => {
    it('should like a video', async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/videos/${videoId}/like`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('liked', true);
      expect(response.body).toHaveProperty('likesCount');

      // Verify like was created in database
      const like = await prisma.like.findFirst({
        where: { userId, videoId },
      });
      expect(like).toBeTruthy();
    });

    it('should unlike a video when liking again (toggle)', async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/videos/${videoId}/like`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      expect(response.body).toHaveProperty('liked');
    });

    it('should fail without authentication', async () => {
      await request(app.getHttpServer())
        .post(`/v1/videos/${videoId}/like`)
        .expect(401);
    });

    it('should fail with invalid video ID', async () => {
      await request(app.getHttpServer())
        .post('/v1/videos/invalid-id/like')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should fail with non-existent video ID', async () => {
      await request(app.getHttpServer())
        .post('/v1/videos/00000000-0000-0000-0000-000000000000/like')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('GET /v1/videos/:id/likes', () => {
    beforeAll(async () => {
      // Ensure video has at least one like
      await request(app.getHttpServer())
        .post(`/v1/videos/${videoId}/like`)
        .set('Authorization', `Bearer ${authToken}`);
    });

    it('should get likes count for a video', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/videos/${videoId}/likes`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('count');
      expect(response.body).toHaveProperty('userHasLiked');
      expect(typeof response.body.count).toBe('number');
      expect(typeof response.body.userHasLiked).toBe('boolean');
    });

    it('should get likes without authentication', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/videos/${videoId}/likes`)
        .expect(200);

      expect(response.body).toHaveProperty('count');
    });
  });

  describe('POST /v1/videos/:id/comments', () => {
    it('should create a comment', async () => {
      const commentData = {
        content: 'This is a test comment!',
      };

      const response = await request(app.getHttpServer())
        .post(`/v1/videos/${videoId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(commentData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('content', commentData.content);
      expect(response.body).toHaveProperty('userId', userId);
      expect(response.body).toHaveProperty('videoId', videoId);
      expect(response.body).toHaveProperty('createdAt');

      commentId = response.body.id;

      // Verify comment was created in database
      const comment = await prisma.comment.findUnique({
        where: { id: commentId },
      });
      expect(comment).toBeTruthy();
      expect(comment?.content).toBe(commentData.content);
    });

    it('should fail without content', async () => {
      await request(app.getHttpServer())
        .post(`/v1/videos/${videoId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);
    });

    it('should fail with empty content', async () => {
      await request(app.getHttpServer())
        .post(`/v1/videos/${videoId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: '' })
        .expect(400);
    });

    it('should fail without authentication', async () => {
      await request(app.getHttpServer())
        .post(`/v1/videos/${videoId}/comments`)
        .send({ content: 'Test comment' })
        .expect(401);
    });

    it('should fail with invalid video ID', async () => {
      await request(app.getHttpServer())
        .post('/v1/videos/invalid-id/comments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'Test comment' })
        .expect(404);
    });
  });

  describe('GET /v1/videos/:id/comments', () => {
    it('should get comments for a video', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/videos/${videoId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('items');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(response.body.items.length).toBeGreaterThan(0);
    });

    it('should get comments with pagination', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/videos/${videoId}/comments?page=1&limit=10`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.pagination).toHaveProperty('page', 1);
      expect(response.body.pagination).toHaveProperty('limit', 10);
    });

    it('should include user info in comments', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/videos/${videoId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const firstComment = response.body.items[0];
      expect(firstComment).toHaveProperty('user');
      expect(firstComment.user).toHaveProperty('displayName');
    });
  });

  describe('DELETE /v1/comments/:id', () => {
    it('should delete own comment', async () => {
      // Create a new comment to delete
      const createResponse = await request(app.getHttpServer())
        .post(`/v1/videos/${videoId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'Comment to delete' });

      const commentToDelete = createResponse.body.id;

      await request(app.getHttpServer())
        .delete(`/v1/comments/${commentToDelete}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify comment was soft deleted
      const comment = await prisma.comment.findUnique({
        where: { id: commentToDelete },
      });
      expect(comment?.deletedAt).toBeTruthy();
    });

    it('should fail to delete non-existent comment', async () => {
      await request(app.getHttpServer())
        .delete('/v1/comments/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should fail without authentication', async () => {
      await request(app.getHttpServer())
        .delete(`/v1/comments/${commentId}`)
        .expect(401);
    });
  });

  describe('POST /v1/videos/:id/view', () => {
    it('should register a view', async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/videos/${videoId}/view`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      expect(response.body).toHaveProperty('message');

      // Verify view was created
      const view = await prisma.view.findFirst({
        where: { userId, videoId },
      });
      expect(view).toBeTruthy();
    });

    it('should allow multiple views (one per day)', async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/videos/${videoId}/view`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      expect(response.body).toHaveProperty('message');
    });

    it('should fail with invalid video ID', async () => {
      await request(app.getHttpServer())
        .post('/v1/videos/invalid-id/view')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('POST /v1/videos/:id/share', () => {
    it('should register a share', async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/videos/${videoId}/share`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ platform: 'COPY_LINK' })
        .expect(201);

      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('shortUrl');
    });

    it('should fail without platform', async () => {
      await request(app.getHttpServer())
        .post(`/v1/videos/${videoId}/share`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);
    });

    it('should fail with invalid platform', async () => {
      await request(app.getHttpServer())
        .post(`/v1/videos/${videoId}/share`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ platform: 'INVALID_PLATFORM' })
        .expect(400);
    });
  });
});
