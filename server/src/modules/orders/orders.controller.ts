import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ClubId } from '../../common/decorators/club-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang, Language } from '../../common/decorators/lang.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { t } from '../../common/i18n/messages';
import { UserRole } from '../../entities/enums';
import { User } from '../../entities/user.entity';
import { CancelOrderDto, CreateOrderDto, ListOrdersQueryDto } from './dto/orders.dto';
import { OrdersService } from './orders.service';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';

// «Buyurtmalar» bo'limi (ro'yxat, statistika) — `orders` imkoniyati. Stol oynasidagi
// ishlar — mahsulot qo'shish, stoldagi buyurtmani ko'rish va xatoni bekor qilish —
// bar'ning o'zi. Tarifda bo'lmasa — 403 FEATURE_LOCKED
@RequireFeature('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /** Stoldagi (faol sessiyadagi) ochiq bar buyurtmasi — bo'lmasa null */
  @RequireFeature('bar')
  @Get('open/:sessionId')
  async openForSession(@ClubId() clubId: number, @Param('sessionId', ParseIntPipe) sessionId: number) {
    const data = await this.ordersService.findOpenForSession(clubId, sessionId);
    return { success: true, data };
  }

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

  @RequireFeature('bar')
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

  /**
   * Ochiq buyurtmani bekor qilish (ombor qaytariladi) — kassir va admin.
   * Faqat OCHIQ (yakunlanmagan stoldagi) buyurtma — xato qo'shilganini tuzatish
   * bar'ning o'zi, shuning uchun Standartda ham bor (stol oynasidan).
   */
  @RequireFeature('bar')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.KASSIR)
  @HttpCode(200)
  @Post(':id/cancel')
  async cancel(
    @ClubId() clubId: number,
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelOrderDto,
    @Lang() lang: Language,
  ) {
    const data = await this.ordersService.cancel(clubId, user, id, dto);
    return { success: true, message: t(lang, 'orders.cancelled'), data };
  }
}
