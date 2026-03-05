import { Module } from '@nestjs/common';
import { InteractionsController } from './interactions.controller';
import { LikeService } from './like.service';
import { CommentService } from './comment.service';
import { FollowService } from './follow.service';
import { ShareService } from './share.service';
import { ViewService } from './view.service';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { RedisModule } from '../../infrastructure/redis/redis.module';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [InteractionsController],
  providers: [
    LikeService,
    CommentService,
    FollowService,
    ShareService,
    ViewService,
  ],
  exports: [
    LikeService,
    CommentService,
    FollowService,
    ShareService,
    ViewService,
  ],
})
export class InteractionsModule {}
