import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { Lang, Language } from '../../common/decorators/lang.decorator';
import { LicenseService } from '../../common/license/license.service';
import { PlatformConfigService } from '../../common/platform-config/platform-config.service';
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
    private readonly license: LicenseService,
    private readonly platformConfig: PlatformConfigService,
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

  /** Landing uchun faol tariflar — autentifikatsiyasiz ochiq ro'yxat */
  @Public()
  @Get('plans')
  async plans() {
    return { success: true, data: await this.publicService.plans() };
  }

  /**
   * Oflayn ruxsatnomani tekshirish uchun OCHIQ kalit.
   *
   * Ochiq kalit — sir emas: u bilan faqat TEKSHIRISH mumkin, imzolash emas.
   * Klient uni bir marta oladi va saqlaydi; internetsiz ishga tushganda
   * saqlangan ruxsatnomani shu kalit bilan tekshiradi.
   */
  @Public()
  @Get('license-key')
  licenseKey() {
    return { success: true, data: this.license.publicKey() };
  }

  /**
   * Landing uchun ommaviy sozlamalar.
   *
   * Hozircha faqat sinov muddati — lekin u MUHIM: landing matnlari
   * ("7 kun bepul") ilgari qat'iy yozilgan edi va superadmin muddatni
   * o'zgartirsa sayt YOLG'ON va'da berib qolardi. Endi matn shu qiymatdan
   * yig'iladi, ya'ni sayt va tizim hech qachon bir-biriga zid bo'lmaydi.
   *
   * Eslatma chegaralari bu yerda ATAYLAB yo'q — ular ichki jarayon
   * sozlamasi va tashqi dunyoga hech qanday aloqasi yo'q.
   */
  @Public()
  @Get('config')
  async config() {
    const { trialDays } = await this.platformConfig.get();
    return { success: true, data: { trialDays } };
  }
}
