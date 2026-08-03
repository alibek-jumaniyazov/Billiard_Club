import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Ip,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { SkipSubscription } from '../../common/decorators/skip-subscription.decorator';
import { ClubBridge } from '../../entities/club-bridge.entity';
import { BridgeDiscoveredDto, BridgeReportDto } from './dto/lights.dto';
import { LightsService } from './lights.service';

/** Uzun-polling: holat o'zgarmasa javob shuncha vaqt ushlab turiladi */
const LONG_POLL_MS = 25_000;

/**
 * Uzun-polling ichida kerakli holat qayta hisoblanish oralig'i — klubda
 * VAQTGA bog'liq o'tish kutilayotgan paytda (grace oynasi ochiq yoki bron
 * oldidan yoqish oynasida bron bor).
 * Bu ATAYLAB saqlanadi (uyg'otish bo'lmasa ham): grace va "bron oldidan yoqish"
 * VAQT o'tishi bilan o'zgaradi, ya'ni DB da hech narsa o'zgarmasa ham kerakli
 * holat boshqa bo'lib qolishi mumkin. Uyg'otish (`waitForChange`) esa shu
 * oraliqni kutmasdan darhol javob berish imkonini beradi (~50 ms).
 */
const POLL_STEP_MS = 1000;

/**
 * Vaqtga bog'liq o'tish kutilmayotganda qadam (24/7 DB yukini kamaytiradi):
 * bunday paytda holat FAQAT DB o'zgarishidan o'zgaradi, u esa `pokeClub` bilan
 * pollingni DARHOL uyg'otadi — javob tezligi yomonlashmaydi.
 */
const POLL_IDLE_STEP_MS = 3000;

/**
 * Bitta klub uchun bir vaqtda USHLAB turiladigan uzun-polling soni.
 * Normal agent bitta ulanish ochadi; ikkitasi — eski va yangi agent almashayotgan
 * paytdagi ustma-ustlik uchun zaxira. Undan ortig'i darhol (kutmasdan) javob oladi,
 * shunda bitta token bilan yuzlab ulanish ochib DB ni yuklab bo'lmaydi.
 */
const MAX_HELD_POLLS_PER_CLUB = 2;

/**
 * Klubdagi lokal agent (bridge) bilan protokol.
 *
 * Agent serverga O'ZI chiqadi (outbound HTTPS) — router sozlash, port forwarding
 * yoki statik IP kerak emas. Autentifikatsiya: X-Bridge-Token headeri; server
 * uning sha256 xeshini club_bridges."tokenHash" bilan solishtiradi.
 *
 * @Public() — bu endpointlar JWT bilan emas, bridge tokeni bilan himoyalangan.
 * @SkipSubscription() — chiroq XAVFSIZLIK masalasi: klub bloklangan yoki obunasi
 *   tugagan bo'lsa ham zaldagi chiroqlar boshqarilaverishi kerak (odamlar
 *   qorong'ida qolmasin). Bu ATAYLAB qilingan yon chetlab o'tish.
 *
 * Suiiste'moldan himoya (endpointlar autentifikatsiyasiz ochiq bo'lgani uchun):
 *   - @Throttle() — IP bo'yicha limit. Normal agent daqiqasiga ~2.5 marta
 *     /state ga va o'zgarish bo'lganda /report ga murojaat qiladi, shuning uchun
 *     limitlar unga bemalol yetadi, lekin cheksiz so'rov yuborib bo'lmaydi.
 *   - MAX_HELD_POLLS_PER_CLUB — bir klub uchun bir vaqtda ushlanadigan
 *     uzun-polling soni cheklangan (DB ni yuklab yuborishning oldini oladi).
 */
@Public()
@SkipSubscription()
@Controller('bridge')
export class BridgeController {
  /** clubId -> hozir USHLAB turilgan uzun-pollinglar soni */
  private readonly heldPolls = new Map<number, number>();

  constructor(private readonly lightsService: LightsService) {}

  /**
   * Kerakli holat (desired state) — uzun-polling.
   * Joriy version so'rovdagi `v` ga teng bo'lsa javob 25 soniyagacha ushlanadi;
   * o'zgarsa darhol qaytadi. Kutish `waitForChange` orqali: klubda sessiya
   * boshlansa yoki qo'lda boshqaruv qo'llansa polling DARHOL uyg'onadi, aks
   * holda har POLL_STEP_MS da kerakli holat qayta hisoblanadi (grace/bron
   * vaqtga bog'liq).
   *
   * Klub rejimi 'bridge' bo'lmasa qurilmalar ro'yxati BO'SH qaytadi — ya'ni
   * chiroq boshqaruvi o'chirilgan bo'lsa agent hech qanday relega tegmaydi.
   * `tasks` esa rejimdan qat'i nazar beriladi: qurilma qidirish (discover)
   * sozlashdan OLDIN, ya'ni rejim hali 'off' bo'lganda ham kerak bo'ladi.
   */
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('state')
  async state(
    @Headers('x-bridge-token') token: string | undefined,
    @Query('v') clientVersion: string | undefined,
    @Ip() ip: string,
  ) {
    const bridge = await this.requireBridge(token);
    // "Tirik" belgisi — xatosi hech qachon javobni buzmaydi (servis o'zi yutadi)
    await this.lightsService.touchBridge(bridge, null, ip);

    const clubId = bridge.clubId;
    const deadline = Date.now() + LONG_POLL_MS;

    // Bitta surat: sozlamalar + qurilmalar + version + vaqtga bog'liqlik
    let state = await this.lightsService.bridgeState(clubId);

    // Chegaradan oshgan ulanishlar javobni ushlab turmaydi — darhol qaytadi
    const held = (this.heldPolls.get(clubId) ?? 0) < MAX_HELD_POLLS_PER_CLUB;
    if (held) this.heldPolls.set(clubId, (this.heldPolls.get(clubId) ?? 0) + 1);
    try {
      while (
        held &&
        clientVersion &&
        state.version === clientVersion &&
        Date.now() < deadline &&
        // Navbatda vazifa bo'lsa javob DARHOL qaytadi (holat o'zgarmagan bo'lsa ham)
        !(await this.lightsService.hasPendingTasks(clubId))
      ) {
        // Qadam ADAPTIV: vaqtga bog'liq o'tish kutilmasa og'ir so'rov kamroq
        // bajariladi (uyg'otish baribir darhol ishlaydi)
        await this.lightsService.waitForChange(
          clubId,
          state.timeSensitive ? POLL_STEP_MS : POLL_IDLE_STEP_MS,
        );
        state = await this.lightsService.bridgeState(clubId);
      }
    } finally {
      if (held) {
        const left = (this.heldPolls.get(clubId) ?? 1) - 1;
        if (left > 0) this.heldPolls.set(clubId, left);
        else this.heldPolls.delete(clubId);
      }
    }

    return {
      success: true,
      data: {
        version: state.version,
        serverNow: new Date().toISOString(),
        // Majburiy qayta qo'llash oralig'i va holatni tekshirish — klub sozlamasidan
        forceSyncMs: state.settings.forceSyncSec * 1000,
        verify: state.settings.verify,
        devices: state.devices,
        // Vazifa BERILADI, lekin navbatdan O'CHIRILMAYDI: natija kelmaguncha
        // (yoki muddati o'tmaguncha) saqlanadi — javob yo'qolsa qayta beriladi
        tasks: await this.lightsService.takeTasks(clubId),
      },
    };
  }

  /**
   * Agent hisoboti: qo'llangan holatlar va xatolar stol yozuvlariga yoziladi.
   * `actual` — qurilmadan O'QILGAN haqiqiy holat (verify), `attempts`/`latencyMs`
   * — diagnostika ko'rsatkichlari.
   */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post('report')
  async report(
    @Headers('x-bridge-token') token: string | undefined,
    @Body() dto: BridgeReportDto,
    @Ip() ip: string,
  ) {
    const bridge = await this.requireBridge(token);
    await this.lightsService.touchBridge(bridge, dto.agentVersion ?? null, ip);

    const accepted = await this.lightsService.applyReport(
      bridge.clubId,
      (dto.results ?? []).map((item) => ({
        tableId: item.tableId,
        ok: item.ok,
        on: item.on ?? null,
        actual: item.actual ?? null,
        attempts: item.attempts ?? null,
        latencyMs: item.latencyMs ?? null,
        error: item.error ?? null,
      })),
    );
    return { success: true, data: { accepted } };
  }

  /**
   * Agent LAN skanerining natijasi. Natija `club_bridges."lastDiscover"` ga
   * yoziladi va `GET /lights/discover` orqali panelga beriladi. Shu javob
   * kelishi bilan vazifa navbatdan chiqadi (tasdiqlash).
   * `subnet` — agent HAQIQATDA skanerlagan tarmoq (vazifada berilmagan bo'lsa
   * agent uni o'z IPv4 idan oladi) — panel qaysi tarmoq tekshirilganini ko'rsatadi.
   */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('discovered')
  async discovered(
    @Headers('x-bridge-token') token: string | undefined,
    @Body() dto: BridgeDiscoveredDto,
    @Ip() ip: string,
  ) {
    const bridge = await this.requireBridge(token);
    await this.lightsService.touchBridge(bridge, null, ip);

    const accepted = await this.lightsService.saveDiscovered(
      bridge.clubId,
      dto.taskId,
      dto.subnet?.trim() || null,
      (dto.devices ?? []).map((device) => ({
        host: device.host,
        ...(device.mac ? { mac: device.mac } : {}),
        ...(device.model ? { model: device.model } : {}),
        ...(device.name ? { name: device.name } : {}),
        ...(device.driver ? { driver: device.driver } : {}),
        ...(device.channels ? { channels: device.channels } : {}),
      })),
    );
    return { success: true, data: { accepted } };
  }

  /**
   * Token bo'yicha bridge ni topish. Xabar ataylab i18n siz — bu endpointlarga
   * odam emas, agent murojaat qiladi (X-Lang headeri bo'lmaydi).
   */
  private async requireBridge(token: string | undefined): Promise<ClubBridge> {
    const bridge = await this.lightsService.findByToken(token ?? '');
    if (!bridge) throw new UnauthorizedException("Bridge tokeni noto'g'ri yoki o'chirilgan");
    return bridge;
  }
}
