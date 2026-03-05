import { Controller, Get, Version } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { QuotaService } from './quota.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@ApiTags('Quotas')
@Controller('quota')
export class QuotaController {
  constructor(private readonly quotaService: QuotaService) {}

  @Get()
  @Version('1')
  @ApiOperation({ summary: 'Buscar minha quota' })
  @ApiResponse({ status: 200, description: 'Quota encontrada' })
  async getMyQuota(@CurrentUser() user: AuthenticatedUser) {
    return this.quotaService.getQuota(user.userId);
  }

  @Get('check/upload')
  @Version('1')
  @ApiOperation({ summary: 'Verificar quota de upload' })
  @ApiResponse({ status: 200, description: 'Status da quota' })
  async checkUploadQuota(@CurrentUser() user: AuthenticatedUser) {
    return this.quotaService.checkUploadQuota(user.userId);
  }

  @Get('check/ai')
  @Version('1')
  @ApiOperation({ summary: 'Verificar quota de análise IA' })
  @ApiResponse({ status: 200, description: 'Status da quota' })
  async checkAIQuota(@CurrentUser() user: AuthenticatedUser) {
    return this.quotaService.checkAIQuota(user.userId);
  }
}
