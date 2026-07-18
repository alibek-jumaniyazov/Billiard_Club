import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ClubId } from '../../common/decorators/club-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang, Language } from '../../common/decorators/lang.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { t } from '../../common/i18n/messages';
import { UserRole } from '../../entities/enums';
import { User } from '../../entities/user.entity';
import { DebtsService } from './debts.service';
import { ListDebtsQueryDto, PayDebtDto } from './dto/debts.dto';

// Qarzlar mijoz PII si va summalarini o'z ichiga oladi — OPERATOR ko'rmaydi.
// O'zgartiruvchi endpointlar (pay/remove) o'z @Roles i bilan bu class-darajani
// override qiladi; o'qish endpointlari (findAll/payments) shu ro'yxatga tayanadi.
@Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.KASSIR)
@Controller('debts')
export class DebtsController {
  constructor(private readonly debtsService: DebtsService) {}

  @Get()
  async findAll(@ClubId() clubId: number, @Query() query: ListDebtsQueryDto) {
    const { data, totals, pagination } = await this.debtsService.findAll(clubId, query);
    return { success: true, data, totals, pagination };
  }

  @Get(':id/payments')
  async payments(@ClubId() clubId: number, @Param('id', ParseIntPipe) id: number) {
    const data = await this.debtsService.payments(clubId, id);
    return { success: true, data };
  }

  /** To'lov qabul qilish — kassir va admin (avval hech qanday rol tekshiruvi yo'q edi) */
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.KASSIR)
  @HttpCode(200)
  @Post(':id/pay')
  async pay(
    @ClubId() clubId: number,
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PayDebtDto,
    @Lang() lang: Language,
  ) {
    const data = await this.debtsService.pay(clubId, user, id, dto);
    return { success: true, message: t(lang, 'debts.paymentAccepted'), data };
  }

  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  @Delete(':id')
  async remove(
    @ClubId() clubId: number,
    @Param('id', ParseIntPipe) id: number,
    @Lang() lang: Language,
  ) {
    await this.debtsService.remove(clubId, id);
    return { success: true, message: t(lang, 'debts.deleted') };
  }
}
