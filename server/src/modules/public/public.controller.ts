import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { Lang, Language } from '../../common/decorators/lang.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { t } from '../../common/i18n/messages';
import { AuthService } from '../auth/auth.service';
import { RegisterDto } from './dto/register.dto';
import { PublicService } from './public.service';

@Controller('public')
export class PublicController {
  constructor(
    private readonly publicService: PublicService,
    private readonly authService: AuthService,
  ) {}

  /** Landing dan ro'yxatdan o'tish — spam himoyasi: soatiga 5 ta urinish */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  @HttpCode(201)
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Lang() lang: Language,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { refreshToken, ...data } = await this.publicService.register(dto, {
      ip: req.ip ?? null,
      userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
    });
    // Avto-login login bilan bir xil: refresh FAQAT httpOnly cookie orqali
    this.authService.setRefreshCookie(res, refreshToken);
    return { success: true, message: t(lang, 'clubs.created'), data };
  }
}
