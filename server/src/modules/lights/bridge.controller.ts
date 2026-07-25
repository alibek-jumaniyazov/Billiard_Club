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
import { BridgeReportDto } from './dto/lights.dto';
import { FORCE_SYNC_MS, LightsService } from './lights.service';

/** Uzun-polling: holat o'zgarmasa javob shuncha vaqt ushlab turiladi */
const LONG_POLL_MS = 25_000;

/** Uzun-polling ichida kerakli holat qayta hisoblanish oralig'i */
const POLL_STEP_MS = 1000;

/**
 * Bitta klub uchun bir vaqtda USHLAB turiladigan uzun-polling soni.
 * Normal agent bitta ulanish ochadi; ikkitasi — eski va yangi agent almashayotgan
 * paytdagi ustma-ustlik uchun zaxira. Undan ortig'i darhol (kutmasdan) javob oladi,
 * shunda bitta token bilan yuzlab ulanish ochib DB ni yuklab bo'lmaydi.
 */
const MAX_HELD_POLLS_PER_CLUB = 2;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
   * Joriy version so'rovdagi `v` ga teng bo'lsa javob 25 soniyagacha ushlanadi
   * (har 1000 ms da qayta hisoblanadi); o'zgarsa darhol qaytadi.
   * Klub rejimi 'bridge' bo'lmasa ro'yxat BO'SH qaytadi — ya'ni chiroq boshqaruvi
   * o'chirilgan bo'lsa agent hech qanday relega tegmaydi.
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

    let devices = await this.lightsService.bridgeDesiredState(clubId);
    let version = this.lightsService.stateVersion(devices);

    // Chegaradan oshgan ulanishlar javobni ushlab turmaydi — darhol qaytadi
    const held = (this.heldPolls.get(clubId) ?? 0) < MAX_HELD_POLLS_PER_CLUB;
    if (held) this.heldPolls.set(clubId, (this.heldPolls.get(clubId) ?? 0) + 1);
    try {
      while (held && clientVersion && version === clientVersion && Date.now() < deadline) {
        await sleep(POLL_STEP_MS);
        devices = await this.lightsService.bridgeDesiredState(clubId);
        version = this.lightsService.stateVersion(devices);
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
        version,
        serverNow: new Date().toISOString(),
        forceSyncMs: FORCE_SYNC_MS,
        devices,
      },
    };
  }

  /** Agent hisoboti: qo'llangan holatlar va xatolar stol yozuvlariga yoziladi */
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
        error: item.error ?? null,
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
