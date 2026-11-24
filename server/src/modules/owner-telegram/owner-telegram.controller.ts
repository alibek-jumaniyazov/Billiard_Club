import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { ClubId } from '../../common/decorators/club-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang, Language } from '../../common/decorators/lang.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { USER_THROTTLER, UserThrottlerGuard } from '../../common/guards/user-throttler.guard';
import { t } from '../../common/i18n/messages';
import { UserRole } from '../../entities/enums';
import { User } from '../../entities/user.entity';
import { OwnerReportPreviewDto, SendOwnerReportDto, UpdateOwnerChatDto } from './dto/owner-telegram.dto';
import { OwnerTelegramService } from './owner-telegram.service';

/**
 * «Telegram bot» sahifasi — FAQAT klub egasi (admin): moliyaviy hisobotlar boradigan
 * chatlarni u o'zi ulaydi va boshqaradi. Kassir/operator bu yerga kira olmaydi.
 */
@Controller('owner-telegram')
export class OwnerTelegramController {
  constructor(private readonly service: OwnerTelegramService) {}

  @Roles(UserRole.ADMIN)
  @Get()
  async status(@ClubId() clubId: number) {
    return { success: true, data: await this.service.status(clubId) };
  }

  /** Bir martalik havola (15 daqiqa) — QR yoki «Telegram'da ochish» */
  @Roles(UserRole.ADMIN)
  @Throttle({ [USER_THROTTLER]: { limit: 20, ttl: 60 * 60 * 1000 } })
  @UseGuards(UserThrottlerGuard)
  @Post('link')
  async link(@ClubId() clubId: number, @CurrentUser() user: User, @Lang() lang: Language) {
    return { success: true, data: await this.service.createLink(clubId, user.id, lang) };
  }

  @Roles(UserRole.ADMIN)
  @Patch('chats/:id')
  async update(
    @ClubId() clubId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOwnerChatDto,
    @Lang() lang: Language,
  ) {
    const data = await this.service.updateChat(clubId, id, dto);
    return { success: true, message: t(lang, 'ownerTelegram.updated'), data };
  }

  @Roles(UserRole.ADMIN)
  @Delete('chats/:id')
  async remove(@ClubId() clubId: number, @Param('id', ParseIntPipe) id: number, @Lang() lang: Language) {
    await this.service.removeChat(clubId, id);
    return { success: true, message: t(lang, 'ownerTelegram.removed'), data: null };
  }

  @Roles(UserRole.ADMIN)
  @Throttle({ [USER_THROTTLER]: { limit: 30, ttl: 60 * 60 * 1000 } })
  @UseGuards(UserThrottlerGuard)
  @HttpCode(200)
  @Post('chats/:id/test')
  async test(@ClubId() clubId: number, @Param('id', ParseIntPipe) id: number, @Lang() lang: Language) {
    const result = await this.service.testChat(clubId, id);
    return {
      success: result.ok,
      message: result.ok ? t(lang, 'ownerTelegram.sent') : t(lang, 'ownerTelegram.sendFailed', { error: result.error ?? '' }),
      data: result,
    };
  }

  /** «Hozir yuborish» — kechagi hisobot, bugun, hafta yoki hozirgi holat */
  @Roles(UserRole.ADMIN)
  @Throttle({ [USER_THROTTLER]: { limit: 30, ttl: 60 * 60 * 1000 } })
  @UseGuards(UserThrottlerGuard)
  @HttpCode(200)
  @Post('chats/:id/report')
  async report(
    @ClubId() clubId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendOwnerReportDto,
    @Lang() lang: Language,
  ) {
    const result = await this.service.sendReportNow(clubId, id, dto.kind);
    return {
      success: result.ok,
      message: result.ok ? t(lang, 'ownerTelegram.sent') : t(lang, 'ownerTelegram.sendFailed', { error: result.error ?? '' }),
      data: result,
    };
  }

  /** Namuna: Telegram'ga yubormasdan hisobot matni (ilovada ko'rsatiladi) */
  @Roles(UserRole.ADMIN)
  @Get('preview')
  async preview(@ClubId() clubId: number, @Query() query: OwnerReportPreviewDto, @Lang() lang: Language) {
    const text = await this.service.preview(clubId, query.kind ?? 'yesterday', query.lang ?? lang);
    return { success: true, data: { text } };
  }
}

/**
 * Telegram webhook — ommaviy marshrut, maxfiy sarlavha (X-Telegram-Bot-Api-Secret-Token)
 * bilan tekshiriladi. Telegram IP lari umumiy bo'lgani uchun rate-limit qo'llanmaydi.
 */
@Controller('public/owner-telegram')
export class OwnerTelegramWebhookController {
  constructor(private readonly service: OwnerTelegramService) {}

  @Public()
  @SkipThrottle()
  @HttpCode(200)
  @Post('webhook')
  async webhook(@Headers('x-telegram-bot-api-secret-token') secret: string | undefined, @Body() update: unknown) {
    return this.service.handleWebhook(secret, update);
  }
}
