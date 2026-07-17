import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ClubId } from '../../common/decorators/club-id.decorator';
import { Lang, Language } from '../../common/decorators/lang.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { t } from '../../common/i18n/messages';
import { UserRole } from '../../entities/enums';
import { CreateTableDto, UpdateTableDto } from './dto/tables.dto';
import { TablesService } from './tables.service';

@Controller('tables')
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Get()
  async findAll(@ClubId() clubId: number) {
    const data = await this.tablesService.findAll(clubId);
    return { success: true, data };
  }

  @Get(':id')
  async findOne(@ClubId() clubId: number, @Param('id', ParseIntPipe) id: number) {
    const data = await this.tablesService.findOne(clubId, id);
    return { success: true, data };
  }

  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  @Post()
  async create(@ClubId() clubId: number, @Body() dto: CreateTableDto, @Lang() lang: Language) {
    const data = await this.tablesService.create(clubId, dto);
    return { success: true, message: t(lang, 'tables.created'), data };
  }

  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.KASSIR)
  @Put(':id')
  async update(
    @ClubId() clubId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTableDto,
    @Lang() lang: Language,
  ) {
    const data = await this.tablesService.update(clubId, id, dto);
    return { success: true, message: t(lang, 'tables.updated'), data };
  }

  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  @Delete(':id')
  async remove(
    @ClubId() clubId: number,
    @Param('id', ParseIntPipe) id: number,
    @Lang() lang: Language,
  ) {
    await this.tablesService.remove(clubId, id);
    return { success: true, message: t(lang, 'tables.deleted') };
  }
}
