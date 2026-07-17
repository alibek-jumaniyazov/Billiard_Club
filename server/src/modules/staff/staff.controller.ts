import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ClubId } from '../../common/decorators/club-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang, Language } from '../../common/decorators/lang.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { t } from '../../common/i18n/messages';
import { UserRole } from '../../entities/enums';
import { User } from '../../entities/user.entity';
import { CreateStaffDto, ListStaffQueryDto, UpdateStaffDto } from './dto/staff.dto';
import { StaffService } from './staff.service';

@Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  async findAll(@ClubId() clubId: number, @Query() query: ListStaffQueryDto) {
    const { data, pagination } = await this.staffService.findAll(clubId, query);
    return { success: true, data, pagination };
  }

  @Post()
  async create(@ClubId() clubId: number, @Body() dto: CreateStaffDto, @Lang() lang: Language) {
    const data = await this.staffService.create(clubId, dto);
    return { success: true, message: t(lang, 'staff.created'), data };
  }

  @Put(':id')
  async update(
    @ClubId() clubId: number,
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStaffDto,
    @Lang() lang: Language,
  ) {
    const data = await this.staffService.update(clubId, user.id, id, dto);
    return { success: true, message: t(lang, 'staff.updated'), data };
  }

  @Delete(':id')
  async remove(
    @ClubId() clubId: number,
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Lang() lang: Language,
  ) {
    await this.staffService.remove(clubId, user.id, id);
    return { success: true, message: t(lang, 'staff.deleted') };
  }
}
