import { Module } from '@nestjs/common';
import { ServiceDiscoveryController } from './service-discovery.controller';
import { ServiceDiscoveryService } from './service-discovery.service';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { RedisModule } from '../../infrastructure/redis/redis.module';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [ServiceDiscoveryController],
  providers: [ServiceDiscoveryService],
  exports: [ServiceDiscoveryService],
})
export class ServiceDiscoveryModule {}
