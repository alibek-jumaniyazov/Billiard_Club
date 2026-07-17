import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Club } from '../../entities/club.entity';
import { ClubStatus, UserRole } from '../../entities/enums';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SKIP_SUBSCRIPTION_KEY } from '../decorators/skip-subscription.decorator';

/**
 * Obuna nazorati (SaaS yadrosi):
 *  - Klub bloklangan bo'lsa — 403 CLUB_BLOCKED
 *  - Sinov/obuna muddati tugagan bo'lsa — status 'expired' ga o'tadi va 403 SUBSCRIPTION_EXPIRED
 *  - Aks holda req.clubId va req.club o'rnatiladi (tenant konteksti)
 *
 * Superadmin uchun: X-Club-Id header orqali istalgan klub kontekstida
 * ishlashi mumkin (klub ma'lumotlarini ko'rish rejimi) — obuna tekshiruvisiz.
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
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
        request.clubId = headerClubId;
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
}
