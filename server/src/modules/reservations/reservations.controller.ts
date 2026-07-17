import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ClubId } from '../../common/decorators/club-id.decorator';
import { Lang, Language } from '../../common/decorators/lang.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { t } from '../../common/i18n/messages';
import { UserRole } from '../../entities/enums';
import {
  CreateReservationDto,
  ListReservationsQueryDto,
  UpdateReservationDto,
} from './dto/reservations.dto';
import { ReservationsService } from './reservations.service';

const STAFF_ROLES = [
  UserRole.SUPERADMIN,
  UserRole.ADMIN,
  UserRole.KASSIR,
  UserRole.OPERATOR,
] as const;

@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Get()
  async findAll(@ClubId() clubId: number, @Query() query: ListReservationsQueryDto) {
    const { data, pagination } = await this.reservationsService.findAll(clubId, query);
    return { success: true, data, pagination };
  }

  @Get(':id')
  async findOne(@ClubId() clubId: number, @Param('id', ParseIntPipe) id: number) {
    const data = await this.reservationsService.findOne(clubId, id);
    return { success: true, data };
  }

  /** To'qnashuv topilsa javobda 'warning' maydoni bo'ladi (qat'iy blok emas) */
  @Roles(...STAFF_ROLES)
  @Post()
  async create(
    @ClubId() clubId: number,
    @Body() dto: CreateReservationDto,
    @Lang() lang: Language,
  ) {
    const { reservation, overlaps } = await this.reservationsService.create(clubId, dto);
    return {
      success: true,
      message: t(lang, 'reservations.created'),
      data: reservation,
      ...(overlaps.length
        ? { warning: t(lang, 'reservations.overlapWarning'), overlaps }
        : {}),
    };
  }

  @Roles(...STAFF_ROLES)
  @Put(':id')
  async update(
    @ClubId() clubId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateReservationDto,
    @Lang() lang: Language,
  ) {
    const { reservation, overlaps } = await this.reservationsService.update(clubId, id, dto);
    return {
      success: true,
      message: t(lang, 'reservations.updated'),
      data: reservation,
      ...(overlaps.length
        ? { warning: t(lang, 'reservations.overlapWarning'), overlaps }
        : {}),
    };
  }

  @Roles(...STAFF_ROLES)
  @HttpCode(200)
  @Post(':id/cancel')
  async cancel(
    @ClubId() clubId: number,
    @Param('id', ParseIntPipe) id: number,
    @Lang() lang: Language,
  ) {
    const data = await this.reservationsService.cancel(clubId, id);
    return { success: true, message: t(lang, 'reservations.cancelled'), data };
  }
}
