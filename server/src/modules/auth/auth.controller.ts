import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang, Language } from '../../common/decorators/lang.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { SkipSubscription } from '../../common/decorators/skip-subscription.decorator';
import { t } from '../../common/i18n/messages';
import { User } from '../../entities/user.entity';
import { AuthService, REFRESH_COOKIE, RequestContext } from './auth.service';
import { ChangePasswordDto, LoginDto, RefreshDto } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** Brute-force himoyasi: 1 daqiqada 10 ta urinish (+ per-username lockout servisda) */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Lang() lang: Language,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { refreshToken, ...data } = await this.authService.login(
      dto.username,
      dto.password,
      this.ctx(req),
    );
    // Refresh token FAQAT httpOnly cookie orqali — javob tanasida qaytarilmaydi
    this.authService.setRefreshCookie(res, refreshToken);
    return { success: true, message: t(lang, 'auth.loginSuccess'), data };
  }

  /** Rotatsiya: avval cookie, keyin tana (eski klientlar bilan moslik) */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post('refresh')
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = this.cookieToken(req) ?? dto.refreshToken;
    if (!token) {
      throw new UnauthorizedException({ key: 'auth.refreshRequired' });
    }
    const { refreshToken, ...data } = await this.authService.refresh(token, this.ctx(req));
    // Grace oynasida (parallel refresh) yangi refresh chiqmaydi — cookie joyida
    // qoladi; javob tanasida refresh token hech qachon qaytarilmaydi
    if (refreshToken) this.authService.setRefreshCookie(res, refreshToken);
    return { success: true, data };
  }

  /** Obuna tugagan bo'lsa ham ishlaydi — blok ekrani klub holatini shu yerdan oladi */
  @SkipSubscription()
  @Get('me')
  async me(@CurrentUser() user: User) {
    const data = await this.authService.me(user);
    return { success: true, data };
  }

  /** Taqdim etilgan refresh sessiya bekor qilinadi va cookie tozalanadi */
  @SkipSubscription()
  @HttpCode(200)
  @Post('logout')
  async logout(
    @CurrentUser() user: User,
    @Body() dto: RefreshDto,
    @Lang() lang: Language,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = this.cookieToken(req) ?? dto.refreshToken ?? null;
    await this.authService.logout(user, token, this.ctx(req));
    this.authService.clearRefreshCookie(res);
    return { success: true, message: t(lang, 'auth.logoutSuccess') };
  }

  /** Faol refresh sessiyalar (qurilmalar) ro'yxati — akkaunt darajasida */
  @SkipSubscription()
  @Get('sessions')
  async sessions(@CurrentUser() user: User, @Req() req: Request) {
    const data = await this.authService.listSessions(user, this.currentJti(req));
    return { success: true, data };
  }

  /** Joriy sessiyadan tashqari barchasini bekor qilish */
  @SkipSubscription()
  @Delete('sessions')
  async revokeOtherSessions(
    @CurrentUser() user: User,
    @Lang() lang: Language,
    @Req() req: Request,
  ) {
    const revoked = await this.authService.revokeOtherSessions(
      user,
      this.currentJti(req),
      this.ctx(req),
    );
    return { success: true, message: t(lang, 'auth.sessionsRevoked'), data: { revoked } };
  }

  /** Bitta sessiyani (qurilmani) bekor qilish */
  @SkipSubscription()
  @Delete('sessions/:jti')
  async revokeSession(
    @CurrentUser() user: User,
    @Param('jti', new ParseUUIDPipe()) jti: string,
    @Lang() lang: Language,
    @Req() req: Request,
  ) {
    await this.authService.revokeSession(user, jti, this.ctx(req));
    return { success: true, message: t(lang, 'auth.sessionRevoked') };
  }

  /** O'z parolini almashtirish — har qanday rol uchun */
  @SkipSubscription()
  @Put('password')
  async changePassword(
    @CurrentUser() user: User,
    @Body() dto: ChangePasswordDto,
    @Lang() lang: Language,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.changePassword(user, dto, this.ctx(req));
    // Yangi refresh — faqat cookie'da; tanada faqat access token qaytadi
    this.authService.setRefreshCookie(res, tokens.refreshToken);
    return {
      success: true,
      message: t(lang, 'auth.passwordChanged'),
      data: { accessToken: tokens.accessToken },
    };
  }

  // ==================== Yordamchilar ====================

  private ctx(req: Request): RequestContext {
    return {
      ip: req.ip ?? null,
      userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
    };
  }

  private cookieToken(req: Request): string | null {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    return cookies?.[REFRESH_COOKIE] ?? null;
  }

  /** Cookie'dagi tokenning jti si — 'joriy sessiya' belgisi uchun */
  private currentJti(req: Request): string | null {
    const token = this.cookieToken(req);
    return token ? this.authService.extractJti(token) : null;
  }
}
