import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ClubId } from '../../common/decorators/club-id.decorator';
import { Lang, Language } from '../../common/decorators/lang.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { t } from '../../common/i18n/messages';
import { UserRole } from '../../entities/enums';
import {
  IssueBridgeTokenDto,
  LightOverrideDto,
  LightTestDto,
  UpdateLightSettingsDto,
  UpdateTableLightDto,
} from './dto/lights.dto';
import { LightsService } from './lights.service';

/**
 * Klub paneli uchun chiroq boshqaruvi (opt-in imkoniyat).
 * Sozlash amallari faqat egaga/superadminga; qo'lda yoqish-o'chirish (override)
 * kassir va operator uchun ham ochiq — ular zal bilan ishlaydi.
 * Bridge tokeni javobda FAQAT bir marta (chiqarilgan paytda) ko'rinadi.
 */
@Controller('lights')
export class LightsController {
  constructor(private readonly lightsService: LightsService) {}

  /** Klub rejimi + agent holati + barcha stollarning chiroq sozlamalari/holati */
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  @Get()
  async overview(@ClubId() clubId: number) {
    const data = await this.lightsService.overview(clubId);
    return { success: true, data };
  }

  /** Chiroq rejimi: off / bridge / direct (+ pauzada o'chirish sozlamasi) */
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  @Put('settings')
  async updateSettings(
    @ClubId() clubId: number,
    @Body() dto: UpdateLightSettingsDto,
    @Lang() lang: Language,
  ) {
    const data = await this.lightsService.updateSettings(clubId, dto);
    return { success: true, message: t(lang, 'lights.settingsUpdated'), data };
  }

  /** Stolning rele sozlamalari (manzil formati servisda tekshiriladi) */
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  @Put('tables/:id')
  async updateTable(
    @ClubId() clubId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTableLightDto,
    @Lang() lang: Language,
  ) {
    const data = await this.lightsService.updateTableDevice(clubId, id, dto);
    return { success: true, message: t(lang, 'lights.updated'), data };
  }

  /**
   * Qurilmani sinash.
   * DIRECT rejimda natija darhol ma'lum; BRIDGE rejimida buyruq navbatga
   * qo'yiladi (agent uzun-pollingdan uyg'onib qo'llaydi) — shuning uchun
   * javobda `queued: true` va agent onlayn/oflayn ekani bildiriladi.
   */
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  @HttpCode(200)
  @Post('tables/:id/test')
  async test(
    @ClubId() clubId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: LightTestDto,
    @Lang() lang: Language,
  ) {
    const result = await this.lightsService.testDevice(clubId, id, dto.on);

    // Stolda chiroq sozlanmagan yoki klub rejimi 'off' — sinash mumkin emas
    if (result.reason === 'not_configured' || result.reason === 'mode_off') {
      throw new BadRequestException({ key: 'lights.notConfigured' });
    }

    if (result.reason === 'queued') {
      const bridge = await this.lightsService.bridgeStatus(clubId);
      return {
        success: true,
        message: t(lang, bridge.online ? 'lights.tested' : 'lights.bridgeOffline'),
        data: { ok: true, queued: true, error: result.error, bridgeOnline: bridge.online },
      };
    }

    return {
      success: true,
      message: t(lang, result.ok ? 'lights.tested' : 'lights.deviceUnreachable'),
      data: { ok: result.ok, queued: false, error: result.error, bridgeOnline: null },
    };
  }

  /** Qo'lda yoqish/o'chirish; on=null (yoki yuborilmasa) — override bekor qilinadi */
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.KASSIR, UserRole.OPERATOR)
  @HttpCode(200)
  @Post('tables/:id/override')
  async override(
    @ClubId() clubId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: LightOverrideDto,
    @Lang() lang: Language,
  ) {
    const on = dto.on ?? null;
    const table = await this.lightsService.setOverride(clubId, id, on, dto.minutes ?? 30);
    return {
      success: true,
      message: t(lang, on === null ? 'lights.overrideCleared' : 'lights.overrideSet'),
      data: this.lightsService.toConfig(table),
    };
  }

  /**
   * Yangi bridge tokeni. XOM token FAQAT shu javobda qaytadi va boshqa hech
   * qayerdan olib bo'lmaydi (DB da faqat sha256 xeshi saqlanadi).
   * Eski token darhol kuchini yo'qotadi.
   */
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  @HttpCode(200)
  @Post('bridge/token')
  async issueToken(
    @ClubId() clubId: number,
    @Body() dto: IssueBridgeTokenDto,
    @Lang() lang: Language,
  ) {
    const { token, bridge } = await this.lightsService.issueToken(clubId, dto.name);
    return {
      success: true,
      message: t(lang, 'lights.tokenIssued'),
      data: {
        token,
        bridge: {
          id: bridge.id,
          name: bridge.name,
          isActive: bridge.isActive,
          lastSeenAt: bridge.lastSeenAt,
          agentVersion: bridge.agentVersion,
          createdAt: bridge.createdAt,
        },
      },
    };
  }
}
