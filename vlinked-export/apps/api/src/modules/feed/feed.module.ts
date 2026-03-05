import { Module } from '@nestjs/common';
import { FeedService } from './feed.service';
import { FeedController } from './feed.controller';
import { FeedIndexerService } from './feed-indexer.service';
import { SearchService } from './search/search.service';
import { SearchController } from './search/search.controller';
import { DiscoveryService } from './discovery/discovery.service';
import { DiscoveryController } from './discovery/discovery.controller';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { RedisModule } from '../../infrastructure/redis/redis.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
  ],
  controllers: [
    FeedController,
    SearchController,
    DiscoveryController,
  ],
  providers: [
    FeedService,
    FeedIndexerService,
    SearchService,
    DiscoveryService,
  ],
  exports: [
    FeedService,
    FeedIndexerService,
    SearchService,
    DiscoveryService,
  ],
})
export class FeedModule {}
