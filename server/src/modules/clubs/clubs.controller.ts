import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import { Lang, Language } from '../../common/decorators/lang.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipSubscription } from '../../common/decorators/skip-subscription.decorator';
import { t } from '../../common/i18n/messages';
import { UserRole } from '../../entities/enums';
import { ClubsService } from './clubs.service';
import {
  CreateClubDto,
  CreateContractDto,
  ExtendSubscriptionDto,
  ResetClubPasswordDto,
  UpdateClubDto,
} from './dto/clubs.dto';

/**
 * Superadmin paneli — klublarni (obunachilarni) boshqarish.
 * Faqat platforma egasi (superadmin) uchun.
 */
@Roles(UserRole.SUPERADMIN)
@SkipSubscription()
@Controller('admin/clubs')
export class ClubsController {
  constructor(private readonly clubsService: ClubsService) {}

  @Get()
  async findAll() {
    const data = await this.clubsService.findAll();
    return { success: true, data };
  }

  /** Platforma analitikasi: daromad, klublar holati, tugayotgan obunalar */
  @Get('overview')
  async overview() {
    const data = await this.clubsService.overview();
    return { success: true, data };
  }

  @Post()
  async create(@Body() dto: CreateClubDto, @Lang() lang: Language) {
    const data = await this.clubsService.create(dto);
    return { success: true, message: t(lang, 'clubs.created'), data };
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const data = await this.clubsService.findOne(id);
    return { success: true, data };
  }

  @Get(':id/stats')
  async stats(@Param('id', ParseIntPipe) id: number) {
    const data = await this.clubsService.stats(id);
    return { success: true, data };
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateClubDto,
    @Lang() lang: Language,
  ) {
    const data = await this.clubsService.update(id, dto);
    return { success: true, message: t(lang, 'clubs.updated'), data };
  }

  @HttpCode(200)
  @Post(':id/extend')
  async extend(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ExtendSubscriptionDto,
    @Lang() lang: Language,
  ) {
    const data = await this.clubsService.extend(id, dto);
    const until = data.effectiveEndsAt
      ? new Date(data.effectiveEndsAt).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'uz-UZ')
      : '';
    return { success: true, message: t(lang, 'clubs.extended', { until }), data };
  }

  @HttpCode(200)
  @Post(':id/block')
  async block(@Param('id', ParseIntPipe) id: number, @Lang() lang: Language) {
    const data = await this.clubsService.setBlocked(id, true);
    return { success: true, message: t(lang, 'clubs.blocked'), data };
  }

  @HttpCode(200)
  @Post(':id/unblock')
  async unblock(@Param('id', ParseIntPipe) id: number, @Lang() lang: Language) {
    const data = await this.clubsService.setBlocked(id, false);
    return { success: true, message: t(lang, 'clubs.unblocked'), data };
  }

  @HttpCode(200)
  @Post(':id/reset-password')
  async resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetClubPasswordDto,
    @Lang() lang: Language,
  ) {
    const data = await this.clubsService.resetAdminPassword(id, dto.password);
    return { success: true, message: t(lang, 'clubs.passwordReset'), data };
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @Lang() lang: Language) {
    await this.clubsService.remove(id);
    return { success: true, message: t(lang, 'clubs.deleted') };
  }

  // ==================== Shartnomalar ====================

  @Get(':id/contracts')
  async contracts(@Param('id', ParseIntPipe) id: number) {
    const data = await this.clubsService.contracts(id);
    return { success: true, data };
  }

  @Post(':id/contracts')
  async addContract(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateContractDto,
    @Lang() lang: Language,
  ) {
    const data = await this.clubsService.addContract(id, dto);
    return { success: true, message: t(lang, 'contracts.created'), data };
  }

  @Delete(':id/contracts/:contractId')
  async removeContract(
    @Param('id', ParseIntPipe) id: number,
    @Param('contractId', ParseIntPipe) contractId: number,
    @Lang() lang: Language,
  ) {
    await this.clubsService.removeContract(id, contractId);
    return { success: true, message: t(lang, 'contracts.deleted') };
  }
}
