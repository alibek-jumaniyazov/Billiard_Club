import { Controller, Get, Param, ParseIntPipe, Put, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang, Language } from '../../common/decorators/lang.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipSubscription } from '../../common/decorators/skip-subscription.decorator';
import { t } from '../../common/i18n/messages';
import { UserRole } from '../../entities/enums';
import { User } from '../../entities/user.entity';
import { ListNotificationsQueryDto } from './dto/notifications.dto';
import { NotificationsService } from './notifications.service';

/**
 * Klub egasi xabarnomalari.
 * @SkipSubscription: obunasi tugagan/bloklangan klub egasi ham platforma
 * xabarlarini (masalan, "obunangiz tugadi") o'qiy olishi kerak.
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

  @Put('read-all')
  async readAll(@CurrentUser() user: User, @Lang() lang: Language) {
    await this.notificationsService.markAllRead(user);
    return { success: true, message: t(lang, 'notifications.allMarkedRead') };
  }

  @Put(':id/read')
  async read(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Lang() lang: Language,
  ) {
    const data = await this.notificationsService.markRead(user, id);
    return { success: true, message: t(lang, 'notifications.markedRead'), data };
  }
}
