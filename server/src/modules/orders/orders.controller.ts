import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ClubId } from '../../common/decorators/club-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang, Language } from '../../common/decorators/lang.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { t } from '../../common/i18n/messages';
import { UserRole } from '../../entities/enums';
import { User } from '../../entities/user.entity';
import { CreateOrderDto, ListOrdersQueryDto } from './dto/orders.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  async findAll(@ClubId() clubId: number, @Query() query: ListOrdersQueryDto) {
    const { data, pagination } = await this.ordersService.findAll(clubId, query);
    return { success: true, data, pagination };
  }

  @Get('stats/today')
  async todayStats(@ClubId() clubId: number) {
    const data = await this.ordersService.todayStats(clubId);
    return { success: true, data };
  }

  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.KASSIR, UserRole.OPERATOR)
  @Post()
  async create(
    @ClubId() clubId: number,
    @CurrentUser() user: User,
    @Body() dto: CreateOrderDto,
    @Lang() lang: Language,
  ) {
    const data = await this.ordersService.create(clubId, user, dto);
    return { success: true, message: t(lang, 'orders.created'), data };
  }

  /** Ochiq buyurtmani bekor qilish (ombor qaytariladi) — kassir va admin */
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.KASSIR)
  @HttpCode(200)
  @Post(':id/cancel')
  async cancel(
    @ClubId() clubId: number,
    @Param('id', ParseIntPipe) id: number,
    @Lang() lang: Language,
  ) {
    const data = await this.ordersService.cancel(clubId, id);
    return { success: true, message: t(lang, 'orders.cancelled'), data };
  }
}
