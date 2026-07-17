import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Response } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { DataSource, IsNull, MoreThan, Not, Repository } from 'typeorm';
import { AuditService } from '../../common/audit/audit.service';
import { Club } from '../../entities/club.entity';
import { RefreshSession } from '../../entities/refresh-session.entity';
import { User } from '../../entities/user.entity';
import { TelegramService } from '../../telegram/telegram.service';
import { JwtPayload } from './jwt.strategy';
import { ChangePasswordDto } from './dto/auth.dto';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/** Refresh token payload — jti orqali DB dagi sessiya yozuviga bog'lanadi */
interface RefreshPayload {
  sub: number;
  tv: number;
  jti: string;
  exp?: number;
}

/** So'rov konteksti — audit va refresh sessiya yozuvlari uchun */
export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
}

/** httpOnly refresh cookie nomi */
export const REFRESH_COOKIE = 'refresh_token';
/** Cookie faqat /api/auth/* yo'llariga yuboriladi (refresh, logout, sessions) */
export const REFRESH_COOKIE_PATH = '/api/auth';

/** Shu miqdordagi ketma-ket xato urinishdan keyin (username + IP) vaqtincha bloklanadi */
const MAX_FAILED_ATTEMPTS = 5;
/** Vaqtinchalik blok davomiyligi (daqiqa) */
const LOCK_MINUTES = 15;

/**
 * Parallel refresh (ko'p tab poygasi) uchun grace oynasi: shu oyna ichida
 * endigina rotatsiya qilingan token qayta kelsa — bu o'g'irlik emas,
 * bir brauzerning ikki tabi bir cookie bilan bir vaqtda yangilagani.
 */
const ROTATION_GRACE_MS = 10_000;

/** Xotiradagi login-blok yozuvi — (username + IP) kaliti bo'yicha */
interface LoginLockEntry {
  count: number;
  until: Date | null;
  lastAttempt: Date;
}

/**
 * Vaqt kanali (timing side-channel) himoyasi: username topilmasa ham
 * bcrypt.compare bajariladi — javob vaqti username mavjudligini oshkor qilmaydi.
 */
const DUMMY_HASH = bcrypt.hashSync('prime-billiard-timing-equalizer', 12);

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  /**
   * Login blokirovkasi (username + IP) juftligi bo'yicha XOTIRADA yuritiladi:
   * faqat username bo'yicha bloklash begona hujumchiga istalgan ma'lum
   * akkauntni qasddan qulflab qo'yish (DoS) imkonini berardi.
   * DB dagi failedLoginAttempts hisoblagichi faqat kuzatuv uchun qoladi.
   * CHEKLOV: Map bitta instansiya doirasida ishlaydi — ko'p instansiyali
   * (cluster/replica) deploy'da har bir instansiya o'z hisobini yuritadi;
   * bunday holatda Redis kabi umumiy do'konga ko'chirish kerak.
   */
  private readonly loginLocks = new Map<string, LoginLockEntry>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly telegram: TelegramService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Club) private readonly clubRepo: Repository<Club>,
    @InjectRepository(RefreshSession)
    private readonly refreshRepo: Repository<RefreshSession>,
  ) {}

  // ==================== Token yaratish ====================

  private signAccessToken(user: User): string {
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      clubId: user.clubId,
      tv: user.tokenVersion,
    };
    return this.jwtService.sign(payload, {
      secret: this.config.get<string>('JWT_SECRET'),
      expiresIn: (this.config.get<string>('JWT_EXPIRES_IN') ??
        '15m') as JwtSignOptions['expiresIn'],
    });
  }

  private signRefreshToken(user: User): { token: string; jti: string; expiresAt: Date } {
    const jti = randomUUID();
    const token = this.jwtService.sign(
      { sub: user.id, tv: user.tokenVersion, jti },
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: (this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ??
          '7d') as JwtSignOptions['expiresIn'],
      },
    );
    const decoded = this.jwtService.decode<RefreshPayload | null>(token);
    const expiresAt = decoded?.exp
      ? new Date(decoded.exp * 1000)
      : new Date(Date.now() + this.refreshTtlMs());
    return { token, jti, expiresAt };
  }

  /** Refresh tokenning sha256 xeshi — token o'zi hech qachon saqlanmaydi */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Cookie muddati uchun JWT_REFRESH_EXPIRES_IN ('7d','12h','30m') ni ms ga o'girish */
  refreshTtlMs(): number {
    const raw = this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';
    const match = /^(\d+)\s*(ms|s|m|h|d)?$/i.exec(raw.trim());
    if (!match) return 7 * 24 * 3600 * 1000;
    const multipliers: Record<string, number> = {
      ms: 1,
      s: 1000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };
    return parseInt(match[1], 10) * (multipliers[(match[2] ?? 'ms').toLowerCase()] ?? 1);
  }

  /** Cookie'dagi tokenning jti sini olish (faqat o'z sessiyalarini belgilash uchun) */
  extractJti(token: string): string | null {
    const decoded = this.jwtService.decode<RefreshPayload | null>(token);
    return decoded?.jti ?? null;
  }

  // ==================== Refresh cookie ====================

  /**
   * httpOnly refresh cookie — YAGONA refresh transport (javob tanasida
   * qaytarilmaydi). Login, refresh, parol almashtirish va public register
   * (avto-login) shu yerdan foydalanadi.
   */
  setRefreshCookie(res: Response, token: string) {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
      maxAge: this.refreshTtlMs(),
    });
  }

  /** Refresh cookie'ni tozalash (logout) */
  clearRefreshCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
    });
  }

  // ==================== Login blokirovkasi (xotirada) ====================

  private lockKey(username: string, ip: string | null): string {
    return `${username}|${ip ?? 'unknown'}`;
  }

  /** Muddati o'tgan/eskirgan blok yozuvlarini tozalash (TTL) */
  private pruneLoginLocks(now: Date) {
    const staleMs = LOCK_MINUTES * 60_000;
    for (const [key, entry] of this.loginLocks) {
      const expired = entry.until
        ? entry.until <= now
        : now.getTime() - entry.lastAttempt.getTime() > staleMs;
      if (expired) this.loginLocks.delete(key);
    }
  }

  /**
   * Token juftligini chiqarish + refresh sessiyani DB ga yozish.
   * familyId berilmasa yangi rotatsiya oilasi ochiladi (yangi qurilma/kirish).
   */
  async issueTokens(user: User, ctx: RequestContext, familyId?: string): Promise<AuthTokens> {
    const accessToken = this.signAccessToken(user);
    const refresh = this.signRefreshToken(user);
    await this.refreshRepo.insert({
      userId: user.id,
      jti: refresh.jti,
      familyId: familyId ?? randomUUID(),
      tokenHash: this.hashToken(refresh.token),
      userAgent: ctx.userAgent ? ctx.userAgent.slice(0, 255) : null,
      ip: ctx.ip ? ctx.ip.slice(0, 45) : null,
      expiresAt: refresh.expiresAt,
    });
    return { accessToken, refreshToken: refresh.token };
  }

  /**
   * Orqaga moslik (public register avto-login): sinxron token juftligi.
   * Refresh sessiya yozuvi fire-and-forget saqlanadi — DB xatosi
   * ro'yxatdan o'tish oqimini to'xtatmaydi.
   */
  generateTokens(user: User): AuthTokens {
    const accessToken = this.signAccessToken(user);
    const refresh = this.signRefreshToken(user);
    void this.refreshRepo
      .insert({
        userId: user.id,
        jti: refresh.jti,
        familyId: randomUUID(),
        tokenHash: this.hashToken(refresh.token),
        userAgent: null,
        ip: null,
        expiresAt: refresh.expiresAt,
      })
      .catch((err: Error) => this.logger.error(`Refresh sessiya saqlanmadi: ${err.message}`));
    return { accessToken, refreshToken: refresh.token };
  }

  // ==================== Login / Refresh / Logout ====================

  async login(username: string, password: string, ctx: RequestContext) {
    // password select:false — login uchun alohida so'raladi
    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.username = :username', { username })
      .andWhere('user.isActive = true')
      .getOne();

    if (!user) {
      // Vaqtni tenglashtirish: mavjud bo'lmagan username ham bcrypt narxini to'laydi
      await bcrypt.compare(password, DUMMY_HASH);
      this.audit.log({
        action: 'auth.login_failed',
        meta: { username, reason: 'not_found' },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      throw new UnauthorizedException({ key: 'auth.invalidCredentials' });
    }

    const now = new Date();
    this.pruneLoginLocks(now);
    const lockKey = this.lockKey(username, ctx.ip);
    const lock = this.loginLocks.get(lockKey);

    // Vaqtinchalik blok: (username + IP) bo'yicha, muddati tugamagan bo'lsa
    if (lock?.until && lock.until > now) {
      // Vaqtni tenglashtirish: blok holati ham bcrypt narxini to'laydi —
      // javob vaqti orqali blok mavjudligi oshkor bo'lmaydi
      await bcrypt.compare(password, DUMMY_HASH);
      const minutes = Math.max(1, Math.ceil((lock.until.getTime() - now.getTime()) / 60_000));
      this.audit.log({
        action: 'auth.login_locked',
        userId: user.id,
        clubId: user.clubId,
        actorRole: user.role,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      throw new UnauthorizedException({ key: 'auth.lockedOut', args: { minutes } });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      const attempts = (lock?.count ?? 0) + 1;
      const locked = attempts >= MAX_FAILED_ATTEMPTS;
      // Blok qarori xotiradagi Map da (username + IP); limitga yetganda
      // hisob nollanadi va blok muddati qo'yiladi
      this.loginLocks.set(lockKey, {
        count: locked ? 0 : attempts,
        until: locked ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : null,
        lastAttempt: now,
      });
      // DB hisoblagichi faqat kuzatuv (observability) uchun yuritiladi
      await this.userRepo.update(user.id, {
        failedLoginAttempts: user.failedLoginAttempts + 1,
      });
      this.audit.log({
        action: 'auth.login_failed',
        userId: user.id,
        clubId: user.clubId,
        actorRole: user.role,
        meta: { attempts, ...(locked ? { locked: true } : {}) },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      if (locked) {
        throw new UnauthorizedException({
          key: 'auth.lockedOut',
          args: { minutes: LOCK_MINUTES },
        });
      }
      throw new UnauthorizedException({ key: 'auth.invalidCredentials' });
    }

    // Muvaffaqiyat: hisoblagichlar tozalanadi
    this.loginLocks.delete(lockKey);
    await this.userRepo.update(user.id, {
      lastLogin: now,
      failedLoginAttempts: 0,
      lockedUntil: null,
    });

    const club = user.clubId
      ? await this.clubRepo.findOne({ where: { id: user.clubId } })
      : null;

    const tokens = await this.issueTokens(user, ctx);

    this.audit.log({
      action: 'auth.login',
      userId: user.id,
      clubId: user.clubId,
      actorRole: user.role,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return { user: this.sanitize(user), club: this.clubInfo(club), ...tokens };
  }

  /**
   * Refresh token rotatsiyasi:
   *  - jti bo'yicha DB yozuvi topiladi (pessimistik qulf — parallel refresh poygasi yo'q);
   *  - ROTATION_GRACE_MS ichida endigina rotatsiya qilingan token qayta kelsa
   *    (ko'p tab poygasi) va vorisi hali yaroqli bo'lsa — o'g'irlik emas:
   *    vorisga bog'langan yangi access token qaytadi, refresh cookie o'zgarmaydi;
   *  - grace oynasidan tashqarida rotatsiya qilingan/bekor qilingan token — REUSE:
   *    butun oila (familyId) bekor qilinadi va 401 qaytadi;
   *  - aks holda eski yozuv yangi jti ga ko'rsatib qo'yiladi va yangi juftlik chiqadi.
   */
  async refresh(refreshToken: string, ctx: RequestContext) {
    let payload: RefreshPayload;
    try {
      payload = this.jwtService.verify<RefreshPayload>(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException({ key: 'auth.invalidToken' });
    }
    // Eski (jti siz, rotatsiyagacha chiqarilgan) tokenlar qabul qilinmaydi
    if (!payload.jti) {
      throw new UnauthorizedException({ key: 'auth.invalidToken' });
    }

    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException({ key: 'auth.invalidToken' });
    }
    // Parol almashtirilgan bo'lsa eski refresh token ham bekor
    if ((payload.tv ?? -1) !== user.tokenVersion) {
      throw new UnauthorizedException({ key: 'auth.invalidToken' });
    }

    const tokenHash = this.hashToken(refreshToken);
    const now = new Date();

    const result = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(RefreshSession);
      const row = await repo.findOne({
        where: { jti: payload.jti },
        lock: { mode: 'pessimistic_write' },
      });

      if (!row || row.userId !== user.id) {
        return { outcome: 'invalid' as const };
      }

      // Grace oynasi: xuddi shu token ROTATION_GRACE_MS ichida rotatsiya
      // qilingan bo'lsa (parallel refresh — ko'p tab), vorisi hali yaroqli
      // ekan, oila bekor qilinmaydi — vorisga bog'langan access token qaytadi
      if (
        row.rotatedToJti &&
        row.tokenHash === tokenHash &&
        row.revokedAt &&
        now.getTime() - row.revokedAt.getTime() <= ROTATION_GRACE_MS
      ) {
        const successor = await repo.findOne({ where: { jti: row.rotatedToJti } });
        if (successor && !successor.revokedAt && successor.expiresAt > now) {
          return { outcome: 'grace' as const, accessToken: this.signAccessToken(user) };
        }
      }

      // REUSE: bekor qilingan/rotatsiya qilingan yoki xeshi mos kelmagan token
      // qayta ishlatildi — o'g'irlik belgisi, butun oila bekor qilinadi
      if (row.revokedAt || row.rotatedToJti || row.tokenHash !== tokenHash) {
        await repo.update({ familyId: row.familyId, revokedAt: IsNull() }, { revokedAt: now });
        return { outcome: 'reuse' as const, familyId: row.familyId };
      }

      if (row.expiresAt <= now) {
        await repo.update({ id: row.id }, { revokedAt: now });
        return { outcome: 'expired' as const };
      }

      // Rotatsiya: yangi juftlik shu oila ichida, eski yozuv yangi jti ga ishora qiladi
      const accessToken = this.signAccessToken(user);
      const refreshNew = this.signRefreshToken(user);
      await repo.insert({
        userId: user.id,
        jti: refreshNew.jti,
        familyId: row.familyId,
        tokenHash: this.hashToken(refreshNew.token),
        userAgent: ctx.userAgent ? ctx.userAgent.slice(0, 255) : null,
        ip: ctx.ip ? ctx.ip.slice(0, 45) : null,
        expiresAt: refreshNew.expiresAt,
      });
      await repo.update({ id: row.id }, { rotatedToJti: refreshNew.jti, revokedAt: now });

      return {
        outcome: 'ok' as const,
        tokens: { accessToken, refreshToken: refreshNew.token } as AuthTokens,
      };
    });

    if (result.outcome === 'reuse') {
      this.audit.log({
        action: 'auth.refresh_reuse',
        userId: user.id,
        clubId: user.clubId,
        actorRole: user.role,
        meta: { familyId: result.familyId },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      throw new UnauthorizedException({ key: 'auth.invalidToken' });
    }
    if (result.outcome !== 'ok' && result.outcome !== 'grace') {
      throw new UnauthorizedException({ key: 'auth.invalidToken' });
    }

    const club = user.clubId
      ? await this.clubRepo.findOne({ where: { id: user.clubId } })
      : null;

    // Grace: yangi refresh chiqarilmaydi (refreshToken: null) — cookie'dagi
    // voris token joyida qoladi, faqat yangi access token beriladi
    if (result.outcome === 'grace') {
      this.audit.log({
        action: 'auth.refresh_grace',
        userId: user.id,
        clubId: user.clubId,
        actorRole: user.role,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return {
        user: this.sanitize(user),
        club: this.clubInfo(club),
        accessToken: result.accessToken,
        refreshToken: null as string | null,
      };
    }

    return {
      user: this.sanitize(user),
      club: this.clubInfo(club),
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken as string | null,
    };
  }

  /**
   * Logout: taqdim etilgan refresh sessiya bekor qilinadi.
   * Access token stateless qoladi — qisqa TTL (15m) o'zi yetarli himoya.
   */
  async logout(user: User, refreshToken: string | null, ctx: RequestContext) {
    if (refreshToken) {
      try {
        const payload = this.jwtService.verify<RefreshPayload>(refreshToken, {
          secret: this.config.get<string>('JWT_REFRESH_SECRET'),
          ignoreExpiration: true,
        });
        if (payload.jti) {
          await this.refreshRepo.update(
            { jti: payload.jti, userId: user.id, revokedAt: IsNull() },
            { revokedAt: new Date() },
          );
        }
      } catch {
        // Yaroqsiz token — logout baribir muvaffaqiyatli hisoblanadi
      }
    }
    this.audit.log({
      action: 'auth.logout',
      userId: user.id,
      clubId: user.clubId,
      actorRole: user.role,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  }

  // ==================== Sessiyalarni boshqarish ====================

  /** Foydalanuvchining faol refresh sessiyalari (qurilmalar ro'yxati) */
  async listSessions(user: User, currentJti: string | null) {
    const rows = await this.refreshRepo.find({
      where: {
        userId: user.id,
        revokedAt: IsNull(),
        rotatedToJti: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => ({
      jti: row.jti,
      ip: row.ip,
      userAgent: row.userAgent,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      current: currentJti !== null && row.jti === currentJti,
    }));
  }

  /** Bitta sessiyani (qurilmani) bekor qilish */
  async revokeSession(user: User, jti: string, ctx: RequestContext) {
    const row = await this.refreshRepo.findOne({
      where: { jti, userId: user.id, revokedAt: IsNull() },
    });
    if (!row) {
      throw new NotFoundException({ key: 'auth.sessionNotFound' });
    }
    await this.refreshRepo.update({ id: row.id }, { revokedAt: new Date() });
    this.audit.log({
      action: 'auth.session_revoke',
      userId: user.id,
      clubId: user.clubId,
      actorRole: user.role,
      entity: 'refresh_session',
      entityId: row.id,
      meta: { jti },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  }

  /** Joriy sessiyadan tashqari barcha sessiyalarni bekor qilish */
  async revokeOtherSessions(user: User, currentJti: string | null, ctx: RequestContext) {
    const result = await this.refreshRepo.update(
      {
        userId: user.id,
        revokedAt: IsNull(),
        ...(currentJti ? { jti: Not(currentJti) } : {}),
      },
      { revokedAt: new Date() },
    );
    const revoked = result.affected ?? 0;
    this.audit.log({
      action: 'auth.sessions_revoke_others',
      userId: user.id,
      clubId: user.clubId,
      actorRole: user.role,
      meta: { revoked },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return revoked;
  }

  // ==================== Parol almashtirish ====================

  /**
   * O'z parolini almashtirish (har qanday rol):
   *  - joriy parol tekshiriladi;
   *  - tokenVersion +1 — barcha eski access/refresh tokenlar darhol bekor;
   *  - barcha refresh sessiyalar bekor qilinadi, joriy qurilma uchun esa
   *    yangi tokenVersion bilan yangi juftlik chiqariladi (tizimda qolib ketadi).
   */
  async changePassword(user: User, dto: ChangePasswordDto, ctx: RequestContext) {
    const withPassword = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.id = :id', { id: user.id })
      .getOne();
    if (!withPassword) {
      throw new UnauthorizedException({ key: 'auth.userNotFoundOrBlocked' });
    }

    const isMatch = await bcrypt.compare(dto.currentPassword, withPassword.password);
    if (!isMatch) {
      this.audit.log({
        action: 'auth.password_change_failed',
        userId: user.id,
        clubId: user.clubId,
        actorRole: user.role,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      throw new BadRequestException({ key: 'auth.wrongCurrentPassword' });
    }

    const newHash = await bcrypt.hash(dto.newPassword, 12);
    const newTokenVersion = user.tokenVersion + 1;
    await this.userRepo.update(user.id, {
      password: newHash,
      tokenVersion: newTokenVersion,
    });

    // Barcha faol sessiyalar bekor — o'g'irlangan refresh token ham o'ladi
    await this.refreshRepo.update(
      { userId: user.id, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );

    // Joriy qurilma yangi tokenVersion bilan tizimda qoladi
    const updatedUser = Object.assign(Object.create(Object.getPrototypeOf(user)) as User, user, {
      tokenVersion: newTokenVersion,
    });
    const tokens = await this.issueTokens(updatedUser, ctx);

    this.audit.log({
      action: 'auth.password_change',
      userId: user.id,
      clubId: user.clubId,
      actorRole: user.role,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return tokens;
  }

  // ==================== Profil ====================

  async me(user: User) {
    const club = user.clubId
      ? await this.clubRepo.findOne({ where: { id: user.clubId } })
      : null;
    return { user: this.sanitize(user), club: this.clubInfo(club) };
  }

  /** Klientga kerakli klub obuna ma'lumotlari (blok ekrani uchun ham) */
  private clubInfo(club: Club | null) {
    if (!club) return null;
    return {
      id: club.id,
      name: club.name,
      status: club.status,
      trialEndsAt: club.trialEndsAt,
      subscriptionEndsAt: club.subscriptionEndsAt,
      effectiveEndsAt: club.effectiveEndsAt,
      isExpired: club.isExpired,
    };
  }

  private sanitize(user: User) {
    const { password: _password, ...safe } = user as User & { password?: string };
    return safe;
  }
}
