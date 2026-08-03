import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang, Language } from '../../common/decorators/lang.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipSubscription } from '../../common/decorators/skip-subscription.decorator';
import {
  USER_THROTTLER,
  UserThrottlerGuard,
} from '../../common/guards/user-throttler.guard';
import { t } from '../../common/i18n/messages';
import { UserRole } from '../../entities/enums';
import { User } from '../../entities/user.entity';
import {
  AdminHistoryQueryDto,
  AudienceCountQueryDto,
  BatchRecipientsQueryDto,
  RecallBatchQueryDto,
  SendNotificationDto,
} from './dto/notifications.dto';
import { NotificationsService } from './notifications.service';

/**
 * Superadmin — klublarga xabarnoma yuborish, e'lonlar tarixi va tahlili.
 *
 * MARSHRUT TARTIBI: harfli segmentlar (`stats`, `audience-count`, `batches/…`)
 * `:id` dan oldin turadi.
 */
@Roles(UserRole.SUPERADMIN)
@SkipSubscription()
@Controller('admin/notifications')
export class NotificationsAdminController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * clubId / clubIds / audience orqali yuborish.
   * Foydalanuvchiga bog'langan limit: bitta e'tiborsiz sessiya butun
   * platformaga o'nlab fan-out yuborib yubormasin (global limit IP bo'yicha).
   */
  @Throttle({ [USER_THROTTLER]: { limit: 20, ttl: 60 * 60 * 1000 } })
  @UseGuards(UserThrottlerGuard)
  @Post()
  async send(
    @CurrentUser() admin: User,
    @Body() dto: SendNotificationDto,
    @Lang() lang: Language,
  ) {
    const { count, batchId, data } = await this.notificationsService.adminSend(admin, dto);
    const message = dto.clubId
      ? t(lang, 'notifications.sent')
      : t(lang, 'notifications.sentToClubs', { count });
    return { success: true, message, count, batchId, data };
  }

  @Get('stats')
  async stats() {
    const data = await this.notificationsService.adminStats();
    return { success: true, data };
  }

  /** Yuborishdan oldingi "nechta klubga boradi" hisobi */
  @Get('audience-count')
  async audienceCount(@Query() query: AudienceCountQueryDto) {
    const count = await this.notificationsService.audienceCount(
      query.audience,
      query.includeBlocked === 'true',
    );
    return { success: true, data: null, count };
  }

  @Get('batches/:batchId')
  async batchDetail(@Param('batchId', ParseUUIDPipe) batchId: string) {
    const data = await this.notificationsService.adminBatchDetail(batchId);
    return { success: true, data };
  }

  @Get('batches/:batchId/recipients')
  async batchRecipients(
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Query() query: BatchRecipientsQueryDto,
  ) {
    const { data, pagination } = await this.notificationsService.adminBatchRecipients(
      batchId,
      query,
    );
    return { success: true, data, pagination };
  }

  /** Yuborilganlar tarixi — E'LON (batch) bo'yicha guruhlangan */
  @Get()
  async history(@Query() query: AdminHistoryQueryDto) {
    const { data, pagination } = await this.notificationsService.adminHistory(query);
    return { success: true, data, pagination };
  }

  /** Qaytarib olish — standart holatda faqat o'qilmagan nusxalar o'chiriladi */
  @Delete('batches/:batchId')
  async recallBatch(
    @CurrentUser() admin: User,
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Query() query: RecallBatchQueryDto,
    @Lang() lang: Language,
  ) {
    const { count, keptCount } = await this.notificationsService.adminRecallBatch(
      admin,
      batchId,
      query.onlyUnread !== 'false',
    );
    return {
      success: true,
      message: t(lang, 'notifications.recalled', { count }),
      data: null,
      count,
      keptCount,
    };
  }

  @Delete(':id')
  async removeRow(
    @CurrentUser() admin: User,
    @Param('id', ParseIntPipe) id: number,
    @Lang() lang: Language,
  ) {
    await this.notificationsService.adminRemoveRow(admin, id);
    return { success: true, message: t(lang, 'notifications.rowDeleted'), data: null };
  }
}
