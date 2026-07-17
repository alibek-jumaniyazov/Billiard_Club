import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Club } from '../../entities/club.entity';
import { ClubStatus, UserRole } from '../../entities/enums';
import { User } from '../../entities/user.entity';
import { AuditService } from '../audit/audit.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SKIP_SUBSCRIPTION_KEY } from '../decorators/skip-subscription.decorator';

/** O'qish so'rovlari uchun impersonatsiya audit yozuvi chastotasi (klub+admin boshiga) */
const IMPERSONATION_LOG_TTL_MS = 60_000;

/**
 * Obuna nazorati (SaaS yadrosi):
 *  - Klub bloklangan bo'lsa — 403 CLUB_BLOCKED
 *  - Sinov/obuna muddati tugagan bo'lsa — status 'expired' ga o'tadi va 403 SUBSCRIPTION_EXPIRED
 *  - Aks holda req.clubId va req.club o'rnatiladi (tenant konteksti)
 *
 * Superadmin uchun: X-Club-Id header orqali istalgan klub kontekstida
 * ishlashi mumkin — klub mavjudligi tekshiriladi (404 aks holda) va
 * har bir impersonatsiya audit jurnaliga yoziladi (o'zgartiruvchi
 * so'rovlar har doim, o'qish so'rovlari daqiqada bir marta).
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  /** Oxirgi audit yozuvi vaqtlari: "userId:clubId" -> timestamp */
  private readonly impersonationLogTimes = new Map<string, number>();

  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
    @InjectRepository(Club) private readonly clubRepo: Repository<Club>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_SUBSCRIPTION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip || isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) return true; // JwtAuthGuard allaqachon rad etgan bo'lardi

    if (user.role === UserRole.SUPERADMIN) {
      const headerClubId = parseInt(String(request.headers['x-club-id'] || ''), 10);
      if (Number.isFinite(headerClubId) && headerClubId > 0) {
        // Klub mavjudligi tekshiriladi — noto'g'ri header 404 qaytaradi
        const club = await this.clubRepo.findOne({ where: { id: headerClubId } });
        if (!club) {
          throw new NotFoundException({ key: 'clubs.notFound' });
        }
        request.clubId = club.id;
        request.club = club; // oddiy tenant yo'li bilan bir xillik
        this.auditImpersonation(user as User, club.id, request);
      }
      return true;
    }

    if (!user.clubId) {
      throw new ForbiddenException({ key: 'subscription.clubNotFound' });
    }

    const club = await this.clubRepo.findOne({ where: { id: user.clubId } });
    if (!club) {
      throw new ForbiddenException({ key: 'subscription.clubNotFound' });
    }

    if (club.status === ClubStatus.BLOCKED) {
      throw new ForbiddenException({ key: 'subscription.clubBlocked', code: 'CLUB_BLOCKED' });
    }

    if (club.isExpired) {
      if (club.status !== ClubStatus.EXPIRED) {
        await this.clubRepo.update(club.id, { status: ClubStatus.EXPIRED });
      }
      throw new ForbiddenException({
        key: 'subscription.expired',
        code: 'SUBSCRIPTION_EXPIRED',
      });
    }

    request.clubId = club.id;
    request.club = club;
    return true;
  }

  /**
   * Superadminning tenant ichidagi harakatlari audit jurnaliga yoziladi:
   * o'zgartiruvchi metodlar (POST/PUT/PATCH/DELETE) har doim,
   * o'qish metodlari — admin+klub juftligi boshiga daqiqada bir marta.
   */
  private auditImpersonation(
    user: User,
    clubId: number,
    request: {
      method?: string;
      originalUrl?: string;
      url?: string;
      ip?: string;
      headers: Record<string, unknown>;
    },
  ) {
    const method = String(request.method || '').toUpperCase();
    const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(method);
    const key = `${user.id}:${clubId}`;
    const now = Date.now();

    if (!mutating) {
      const last = this.impersonationLogTimes.get(key) ?? 0;
      if (now - last < IMPERSONATION_LOG_TTL_MS) return;
    }
    this.impersonationLogTimes.set(key, now);

    // Xarita cheksiz o'smasin — eskirgan yozuvlar tozalanadi
    if (this.impersonationLogTimes.size > 1000) {
      for (const [k, ts] of this.impersonationLogTimes) {
        if (now - ts > IMPERSONATION_LOG_TTL_MS) this.impersonationLogTimes.delete(k);
      }
    }

    this.audit.log({
      action: 'admin.impersonate',
      clubId,
      userId: user.id,
      actorRole: user.role,
      method,
      path: request.originalUrl ?? request.url ?? null,
      ip: request.ip ?? null,
      userAgent: (request.headers['user-agent'] as string | undefined) ?? null,
    });
  }
}
