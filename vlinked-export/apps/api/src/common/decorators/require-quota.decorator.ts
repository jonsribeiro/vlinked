import { SetMetadata } from '@nestjs/common';
import { QuotaResource } from '../../modules/quota/quota.service';

export const REQUIRE_QUOTA_KEY = 'requireQuota';

export interface RequireQuotaOptions {
  resource: QuotaResource;
  amount?: number; // Para storage
}

export const RequireQuota = (resource: QuotaResource, amount?: number) =>
  SetMetadata(REQUIRE_QUOTA_KEY, { resource, amount });
