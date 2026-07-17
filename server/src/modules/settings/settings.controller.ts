import { Body, Controller, Get, Put } from '@nestjs/common';
import { ClubId } from '../../common/decorators/club-id.decorator';
import { Lang, Language } from '../../common/decorators/lang.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { t } from '../../common/i18n/messages';
import { UserRole } from '../../entities/enums';
import { UpdateSettingsDto } from './dto/settings.dto';
import { SettingsService } from './settings.service';
import { SUPPORTED_TIMEZONES } from './timezones';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  async get(@ClubId() clubId: number) {
    const data = await this.settingsService.get(clubId);
    return { success: true, data };
  }

  /** Qo'llab-quvvatlanadigan vaqt mintaqalari ro'yxati (UI select uchun) */
  @Get('timezones')
  timezones() {
    return { success: true, data: SUPPORTED_TIMEZONES };
  }

  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  @Put()
  async update(@ClubId() clubId: number, @Body() dto: UpdateSettingsDto, @Lang() lang: Language) {
    const data = await this.settingsService.update(clubId, dto);
    return { success: true, message: t(lang, 'settings.updated'), data };
  }
}
