import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ClubId } from '../../common/decorators/club-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang, Language } from '../../common/decorators/lang.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { t } from '../../common/i18n/messages';
import { UserRole } from '../../entities/enums';
import { User } from '../../entities/user.entity';
import { CloseShiftDto, ListShiftsQueryDto, OpenShiftDto } from './dto/shifts.dto';
import { ShiftsService } from './shifts.service';

/**
 * Kassa smenalari — pul bilan ishlaydigan rollar (admin, kassir).
 * Operator kassani ko'rmaydi: hisobotda klubning tushumi bor.
 */
@Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.KASSIR)
@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  @Get('current')
  async current(@ClubId() clubId: number) {
    const data = await this.shifts.current(clubId);
    return { success: true, data };
  }

  @Get()
  async list(@ClubId() clubId: number, @Query() query: ListShiftsQueryDto) {
    const { data, pagination } = await this.shifts.list(clubId, query);
    return { success: true, data, pagination };
  }

  @Get(':id')
  async findOne(@ClubId() clubId: number, @Param('id', ParseIntPipe) id: number) {
    const data = await this.shifts.findOne(clubId, id);
    return { success: true, data };
  }

  @HttpCode(201)
  @Post('open')
  async open(
    @ClubId() clubId: number,
    @CurrentUser() user: User,
    @Body() dto: OpenShiftDto,
    @Lang() lang: Language,
  ) {
    const data = await this.shifts.open(clubId, user, dto);
    return { success: true, message: t(lang, 'shifts.opened'), data };
  }

  @HttpCode(200)
  @Post(':id/close')
  async close(
    @ClubId() clubId: number,
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CloseShiftDto,
    @Lang() lang: Language,
  ) {
    const data = await this.shifts.close(clubId, user, id, dto);
    return { success: true, message: t(lang, 'shifts.closed'), data };
  }
}
