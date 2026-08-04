import { Body, Controller, Get, HttpCode, Post, Put, Query } from '@nestjs/common';
import { Lang, Language } from '../../common/decorators/lang.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipSubscription } from '../../common/decorators/skip-subscription.decorator';
import { t } from '../../common/i18n/messages';
import { UserRole } from '../../entities/enums';
import { PlatformConfigService } from '../../common/platform-config/platform-config.service';
import { TelegramService } from '../../telegram/telegram.service';
import {
  AuditLogsQueryDto,
  UpdatePlatformConfigDto,
  UpdateTelegramSettingsDto,
} from './dto/platform.dto';
import { PlatformService } from './platform.service';

/** Platforma boshqaruvi — faqat superadmin */
@Roles(UserRole.SUPERADMIN)
@SkipSubscription()
@Controller('admin/platform')
export class PlatformController {
  constructor(
    private readonly platformService: PlatformService,
    private readonly telegram: TelegramService,
    private readonly platformConfig: PlatformConfigService,
  ) {}

  /** Klublar holati, o'sish, konversiya, oylik daromad, sessiyalar */
  @Get('stats')
  async stats() {
    const data = await this.platformService.stats();
    return { success: true, data };
  }

  @Get('audit-logs')
  async auditLogs(@Query() query: AuditLogsQueryDto) {
    const { data, pagination } = await this.platformService.auditLogs(query);
    return { success: true, data, pagination };
  }

  @Get('telegram-settings')
  async telegramSettings() {
    const data = await this.platformService.getTelegramSettings();
    return { success: true, data };
  }

  @Put('telegram-settings')
  async updateTelegramSettings(
    @Body() dto: UpdateTelegramSettingsDto,
    @Lang() lang: Language,
  ) {
    const data = await this.platformService.updateTelegramSettings(dto);
    return { success: true, message: t(lang, 'platform.telegramSettingsUpdated'), data };
  }

  /**
   * Telegram ulanishini SINAB ko'rish — guruhga haqiqiy xabar yuboriladi.
   *
   * Nega alohida endpoint: sozlash to'g'ri yoki noto'g'ri ekanini bilishning
   * yagona ishonchli yo'li — haqiqatan yuborib ko'rish. Ilgari buni faqat
   * server logini ochib bilish mumkin edi (xabarlar fire-and-forget ketadi),
   * ya'ni Telegram oylab ishlamay turishi va buni hech kim sezmasligi mumkin edi.
   *
   * Xato YUTILMAYDI — sababi javobda qaytadi.
   */
  @Post('telegram-test')
  @HttpCode(200)
  async telegramTest() {
    return { success: true, data: await this.telegram.selfTest() };
  }

  /**
   * Platforma sozlamalari — bepul sinov muddati va eslatma chegaralari.
   *
   * Bu qiymatlar ilgari KODDA qat'iy yozilgan edi (uch xil joyda). Endi
   * ular bitta manbadan boshqariladi va o'zgartirilgani zahoti hamma
   * joyda — ro'yxatdan o'tish, klub yaratish, landing matnlari va
   * eslatma cron'ida — kuchga kiradi.
   */
  @Get('config')
  async config() {
    return { success: true, data: await this.platformConfig.get() };
  }

  @Put('config')
  async updateConfig(@Body() dto: UpdatePlatformConfigDto, @Lang() lang: Language) {
    const data = await this.platformConfig.update(dto);
    return { success: true, message: t(lang, 'platform.configUpdated'), data };
  }

  /** DB ping, uptime, versiya, xotira */
  @Get('health')
  async health() {
    const data = await this.platformService.health();
    return { success: true, data };
  }
}
