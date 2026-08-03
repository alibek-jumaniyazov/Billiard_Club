import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang, Language } from '../../common/decorators/lang.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipSubscription } from '../../common/decorators/skip-subscription.decorator';
import { t } from '../../common/i18n/messages';
import { UserRole } from '../../entities/enums';
import { User } from '../../entities/user.entity';
import {
  BulkIdsDto,
  BulkReadDto,
  ListNotificationsQueryDto,
} from './dto/notifications.dto';
import { NotificationsService } from './notifications.service';

/**
 * Klub egasi xabarnomalari.
 * @SkipSubscription: obunasi tugagan/bloklangan klub egasi ham platforma
 * xabarlarini (masalan, "obunangiz tugadi") o'qiy olishi kerak.
 *
 * MARSHRUT TARTIBI MUHIM: harfli segmentlar (`unread-count`, `read-all`,
 * `bulk-read`) `:id` dan OLDIN e'lon qilinadi, aks holda ParseIntPipe
 * ularni ID deb o'qib 400 qaytaradi.
 */
@Roles(UserRole.ADMIN)
@SkipSubscription()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async findAll(@CurrentUser() user: User, @Query() query: ListNotificationsQueryDto) {
    const { data, unreadCount, pagination } = await this.notificationsService.listForClub(
      user,
      query,
    );
    return { success: true, data, unreadCount, pagination };
  }

  /** Qo'ng'iroq uchun arzon so'rov */
  @Get('unread-count')
  async unreadCount(@CurrentUser() user: User) {
    const unreadCount = await this.notificationsService.unreadCountForClub(user);
    return { success: true, data: null, unreadCount };
  }

  @Get(':id')
  async findOne(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    const data = await this.notificationsService.findOneForClub(user, id);
    return { success: true, data };
  }

  @Put('read-all')
  async readAll(@CurrentUser() user: User, @Lang() lang: Language) {
    const { count, unreadCount } = await this.notificationsService.markAllRead(user);
    return {
      success: true,
      message: t(lang, 'notifications.allMarkedRead'),
      count,
      unreadCount,
    };
  }

  @Put('bulk-read')
  async bulkRead(
    @CurrentUser() user: User,
    @Body() dto: BulkReadDto,
    @Lang() lang: Language,
  ) {
    const { count, unreadCount } = await this.notificationsService.bulkSetRead(
      user,
      dto.ids,
      dto.read,
    );
    return {
      success: true,
      message: t(lang, 'notifications.bulkUpdated', { count }),
      count,
      unreadCount,
    };
  }

  @Put(':id/read')
  async read(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Lang() lang: Language,
  ) {
    const { data, unreadCount } = await this.notificationsService.setRead(user, id, true);
    return { success: true, message: t(lang, 'notifications.markedRead'), data, unreadCount };
  }

  @Put(':id/unread')
  async unread(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Lang() lang: Language,
  ) {
    const { data, unreadCount } = await this.notificationsService.setRead(user, id, false);
    return { success: true, message: t(lang, 'notifications.markedUnread'), data, unreadCount };
  }

  @Delete()
  async bulkRemove(
    @CurrentUser() user: User,
    @Body() dto: BulkIdsDto,
    @Lang() lang: Language,
  ) {
    const { count, unreadCount } = await this.notificationsService.bulkRemoveForClub(
      user,
      dto.ids,
    );
    return {
      success: true,
      message: t(lang, 'notifications.bulkDeleted', { count }),
      count,
      unreadCount,
    };
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Lang() lang: Language,
  ) {
    const { unreadCount } = await this.notificationsService.removeForClub(user, id);
    return { success: true, message: t(lang, 'notifications.deleted'), data: null, unreadCount };
  }
}
