import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { Lang, Language } from '../../common/decorators/lang.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipSubscription } from '../../common/decorators/skip-subscription.decorator';
import { t } from '../../common/i18n/messages';
import { UserRole } from '../../entities/enums';
import { AuditLogsQueryDto, UpdateTelegramSettingsDto } from './dto/platform.dto';
import { PlatformService } from './platform.service';

/** Platforma boshqaruvi — faqat superadmin */
@Roles(UserRole.SUPERADMIN)
@SkipSubscription()
@Controller('admin/platform')
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

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

  /** DB ping, uptime, versiya, xotira */
  @Get('health')
  async health() {
    const data = await this.platformService.health();
    return { success: true, data };
  }
}
