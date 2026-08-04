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
  Query,
} from '@nestjs/common';
import { ClubId } from '../../common/decorators/club-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang, Language } from '../../common/decorators/lang.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { t } from '../../common/i18n/messages';
import { UserRole } from '../../entities/enums';
import { User } from '../../entities/user.entity';
import {
  IssueBridgeTokenDto,
  LightDiscoverDto,
  LightEventsQueryDto,
  LightMasterDto,
  LightOverrideDto,
  LightTestDto,
  UpdateLightSettingsDto,
  UpdateTableLightDto,
} from './dto/lights.dto';
import { LightsService, LightTableConfig } from './lights.service';

/**
 * Klub paneli uchun chiroq boshqaruvi (opt-in imkoniyat).
 *
 * Rollar:
 *  - sozlash (settings / stol sozlamalari / sinov / qidiruv / token) — faqat
 *    egaga (ADMIN) va SUPERADMIN ga;
 *  - ko'rish (`GET /`), qo'lda boshqaruv (`override`, `all`) va diagnostika
 *    jurnali — kassir va operatorga ham ochiq: zal boshqaruvi ularning ishi.
 *
 * MAXFIYLIK: kassir/operatorga stolning `host`, `onUrl`/`offUrl`, `config` va
 * `hasAuth` maydonlari qaytarilmaydi (null/false) — klubning lokal tarmoq
 * tafsilotlari faqat sozlash huquqi borlarga ko'rinadi. Javobdagi `canEdit`
 * bayrog'i klientga qaysi bo'limlarni ko'rsatishni aytadi.
 * Bridge tokeni javobda FAQAT bir marta (chiqarilgan paytda) ko'rinadi.
 */
@Controller('lights')
export class LightsController {
  constructor(private readonly lightsService: LightsService) {}

  /** Klub rejimi + agent holati + barcha stollarning chiroq sozlamalari/holati */
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.KASSIR, UserRole.OPERATOR)
  @Get()
  async overview(@ClubId() clubId: number, @CurrentUser() user: User) {
    const data = await this.lightsService.overview(clubId);
    const canEdit = this.canEdit(user);
    return {
      success: true,
      data: {
        ...data,
        canEdit,
        tables: canEdit ? data.tables : data.tables.map((table) => this.maskTable(table)),
      },
    };
  }

  /** Chiroq rejimi va vaqt qoidalari (grace, bron oldidan yoqish, sinxronizatsiya) */
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

  /** Stolning rele sozlamalari (manzil va drayverga xos maydonlar servisda tekshiriladi) */
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
    @CurrentUser() user: User,
    @Lang() lang: Language,
  ) {
    const result = await this.lightsService.testDevice(clubId, id, dto.on, user?.id ?? null);

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
    @CurrentUser() user: User,
    @Lang() lang: Language,
  ) {
    const on = dto.on ?? null;
    const table = await this.lightsService.setOverride(
      clubId,
      id,
      on,
      dto.minutes ?? 30,
      user?.id ?? null,
    );
    const config = this.lightsService.toConfig(table);
    return {
      success: true,
      message: t(lang, on === null ? 'lights.overrideCleared' : 'lights.overrideSet'),
      data: this.canEdit(user) ? config : this.maskTable(config),
    };
  }

  /**
   * Master boshqaruv: klubning barcha chiroqlarini birdaniga yoqish/o'chirish
   * yoki avtomatikaga qaytarish (on yuborilmasa yoki null bo'lsa).
   * Zalni ochish/yopish paytida bitta tugma bilan boshqarish uchun.
   */
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.KASSIR, UserRole.OPERATOR)
  @HttpCode(200)
  @Post('all')
  async overrideAll(
    @ClubId() clubId: number,
    @Body() dto: LightMasterDto,
    @CurrentUser() user: User,
    @Lang() lang: Language,
  ) {
    const affected = await this.lightsService.setOverrideAll(
      clubId,
      dto.on ?? null,
      dto.minutes ?? 60,
      user?.id ?? null,
    );
    return { success: true, message: t(lang, 'lights.allApplied'), data: { affected } };
  }

  /**
   * Diagnostika jurnali: "nega bu stolda chiroq yonmadi?"
   * Xato MATNI faqat sozlash huquqi borlarga ko'rsatiladi — unda texnik
   * tafsilotlar (qurilma javobi, manzil formati va h.k.) bo'lishi mumkin.
   * Kassir/operator uchun `ok=false` bayrog'ining o'zi yetarli.
   */
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.KASSIR, UserRole.OPERATOR)
  @Get('events')
  async events(
    @ClubId() clubId: number,
    @Query() query: LightEventsQueryDto,
    @CurrentUser() user: User,
  ) {
    const data = await this.lightsService.events(clubId, query.limit ?? 50, query.tableId);
    if (this.canEdit(user)) return { success: true, data };
    return { success: true, data: data.map((event) => ({ ...event, error: null })) };
  }

  /**
   * LAN da qurilmalarni qidirishni boshlash. Skanni faqat klubdagi agent
   * bajara oladi (bulut server lokal tarmoqni ko'rmaydi), shuning uchun agent
   * umuman o'rnatilmagan bo'lsa `queued: false` qaytadi.
   */
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  @HttpCode(200)
  @Post('discover')
  async startDiscover(
    @ClubId() clubId: number,
    @Body() dto: LightDiscoverDto,
    @Lang() lang: Language,
  ) {
    const data = await this.lightsService.queueDiscover(clubId, dto.subnet);
    if (!data.queued) {
      return { success: true, message: t(lang, 'lights.discoverUnavailable'), data };
    }
    return {
      success: true,
      message: t(lang, data.bridgeOnline ? 'lights.discoverQueued' : 'lights.bridgeOffline'),
      data,
    };
  }

  /**
   * Oxirgi qidiruv natijasi. Natija `club_bridges` da saqlanadi — ko'p
   * instansiyali deployda ham panel qaysi instansiyaga tushishidan qat'i nazar
   * bir xil javob oladi. Javobda skanerlangan `subnet` ham bor.
   */
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  @Get('discover')
  async discovered(@ClubId() clubId: number) {
    return { success: true, data: await this.lightsService.discoverResult(clubId) };
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
    @CurrentUser() user: User,
    @Lang() lang: Language,
  ) {
    // Aktyor audit jurnaliga yozilishi uchun uzatiladi (token bilan barcha
    // relelarning parolini o'qish mumkin — kim olgani ma'lum bo'lsin)
    const { token, bridge } = await this.lightsService.issueToken(clubId, dto.name, user);
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

  /** Chiroq sozlamalarini o'zgartira oladigan rollar */
  private canEdit(user: User | undefined): boolean {
    return user?.role === UserRole.SUPERADMIN || user?.role === UserRole.ADMIN;
  }

  /**
   * Kassir/operator uchun ulanish tafsilotlarini yashirish.
   * `host`, shablon URL lar va `config` — klubning lokal tarmoq ma'lumoti;
   * `hasAuth` esa parol qo'yilgan-qo'yilmaganini oshkor qiladi. Holat
   * (yoniq/o'chiq/xato) va qo'lda boshqaruv maydonlari o'z joyida qoladi.
   *
   * Generik: bir xil funksiya ham panel qatoriga (`LightTableView`), ham bitta
   * stol javobiga (`LightTableConfig`) qo'llanadi — spread qolgan maydonlarni
   * saqlaydi, shuning uchun natija asl tur bilan bir xil shaklda qoladi.
   */
  private maskTable<T extends LightTableConfig>(table: T): T {
    const masked: LightTableConfig = {
      ...table,
      host: null,
      onUrl: null,
      offUrl: null,
      config: null,
      hasAuth: false,
    };
    return masked as T;
  }
}
