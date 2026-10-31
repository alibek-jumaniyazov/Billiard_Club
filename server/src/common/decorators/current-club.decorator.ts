import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Club } from '../../entities/club.entity';

/**
 * SubscriptionGuard yuklagan joriy klub (tenant). Superadmin klubni ko'rish
 * rejimida bo'lmasa — undefined.
 */
export const CurrentClub = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Club | undefined => ctx.switchToHttp().getRequest().club,
);
