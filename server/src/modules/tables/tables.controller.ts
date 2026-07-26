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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang, Language } from '../../common/decorators/lang.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { t } from '../../common/i18n/messages';
import { UserRole } from '../../entities/enums';
import { User } from '../../entities/user.entity';
import { CreateTableDto, UpdateTableDto } from './dto/tables.dto';
import { TablesService } from './tables.service';

@Controller('tables')
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Get()
  async findAll(@ClubId() clubId: number) {
    const data = await this.tablesService.findAll(clubId);
    // serverNow — mijoz soat siljishini (clock offset) hisoblab, driftsiz tiker yuritishi uchun
    return { success: true, data, serverNow: new Date().toISOString() };
  }

  @Get(':id')
  async findOne(@ClubId() clubId: number, @Param('id', ParseIntPipe) id: number) {
    const data = await this.tablesService.findOne(clubId, id);
    return { success: true, data, serverNow: new Date().toISOString() };
  }

  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  @Post()
  async create(@ClubId() clubId: number, @Body() dto: CreateTableDto, @Lang() lang: Language) {
    const data = await this.tablesService.create(clubId, dto);
    return { success: true, message: t(lang, 'tables.created'), data };
  }

  /**
   * Stol sozlamalari (nom/raqam/NARX) — faqat egaga/superadminga, POST va DELETE
   * bilan bir xil. Kassirga ochiq turgani pul teshigi edi: narxni 1000 ga
   * tushirib, sessiya boshlab (narx sessiyaga MUHRLANADI), keyin narxni
   * tiklab qo'yish mumkin edi. Kassirning qonuniy amali — chiroqni qo'lda
   * yoqish/o'chirish — lights.controller da va o'z rollarini saqlab qoladi.
   */
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  @Put(':id')
  async update(
    @ClubId() clubId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTableDto,
    @Lang() lang: Language,
    @CurrentUser() user: User,
  ) {
    const data = await this.tablesService.update(clubId, id, dto, user);
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
