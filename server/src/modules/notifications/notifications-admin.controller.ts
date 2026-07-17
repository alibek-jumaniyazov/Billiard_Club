import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang, Language } from '../../common/decorators/lang.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipSubscription } from '../../common/decorators/skip-subscription.decorator';
import { t } from '../../common/i18n/messages';
import { UserRole } from '../../entities/enums';
import { User } from '../../entities/user.entity';
import { ListNotificationsQueryDto, SendNotificationDto } from './dto/notifications.dto';
import { NotificationsService } from './notifications.service';

/** Superadmin — klublarga xabarnoma yuborish va tarixni ko'rish */
@Roles(UserRole.SUPERADMIN)
@SkipSubscription()
@Controller('admin/notifications')
export class NotificationsAdminController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /** Bitta klubga (clubId bilan) yoki barcha bloklanmagan klublarga */
  @Post()
  async send(
    @CurrentUser() admin: User,
    @Body() dto: SendNotificationDto,
    @Lang() lang: Language,
  ) {
    const { count, data } = await this.notificationsService.adminSend(admin, dto);
    const message = dto.clubId
      ? t(lang, 'notifications.sent')
      : t(lang, 'notifications.sentToAll', { count });
    return { success: true, message, count, data };
  }

  @Get()
  async history(@Query() query: ListNotificationsQueryDto) {
    const { data, pagination } = await this.notificationsService.adminHistory(query);
    return { success: true, data, pagination };
  }
}
