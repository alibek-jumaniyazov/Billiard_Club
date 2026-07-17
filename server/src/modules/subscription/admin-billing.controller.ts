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
  Query,
} from '@nestjs/common';
import { Lang, Language } from '../../common/decorators/lang.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipSubscription } from '../../common/decorators/skip-subscription.decorator';
import { t } from '../../common/i18n/messages';
import { UserRole } from '../../entities/enums';
import { AdminBillingService } from './admin-billing.service';
import {
  ConfirmInvoiceDto,
  CreateCouponDto,
  CreatePlanDto,
  ListAdminInvoicesQueryDto,
  RejectInvoiceDto,
  UpdateCouponDto,
  UpdatePlanDto,
} from './dto/subscription.dto';

/**
 * Superadmin savdo paneli: tariflar, kuponlar, hisob-fakturalar.
 * Faqat platforma egasi (superadmin) uchun.
 */
@Roles(UserRole.SUPERADMIN)
@SkipSubscription()
@Controller('admin')
export class AdminBillingController {
  constructor(private readonly adminBillingService: AdminBillingService) {}

  // ==================== Tariflar ====================

  @Get('plans')
  async listPlans() {
    const data = await this.adminBillingService.listPlans();
    return { success: true, data };
  }

  @Post('plans')
  async createPlan(@Body() dto: CreatePlanDto, @Lang() lang: Language) {
    const data = await this.adminBillingService.createPlan(dto);
    return { success: true, message: t(lang, 'subscription.planCreated'), data };
  }

  @Put('plans/:id')
  async updatePlan(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePlanDto,
    @Lang() lang: Language,
  ) {
    const data = await this.adminBillingService.updatePlan(id, dto);
    return { success: true, message: t(lang, 'subscription.planUpdated'), data };
  }

  /** Yumshoq o'chirish — tarif faolsizlantiriladi */
  @Delete('plans/:id')
  async deactivatePlan(@Param('id', ParseIntPipe) id: number, @Lang() lang: Language) {
    const data = await this.adminBillingService.deactivatePlan(id);
    return { success: true, message: t(lang, 'subscription.planDeactivated'), data };
  }

  // ==================== Kuponlar ====================

  @Get('coupons')
  async listCoupons() {
    const data = await this.adminBillingService.listCoupons();
    return { success: true, data };
  }

  @Post('coupons')
  async createCoupon(@Body() dto: CreateCouponDto, @Lang() lang: Language) {
    const data = await this.adminBillingService.createCoupon(dto);
    return { success: true, message: t(lang, 'subscription.couponCreated'), data };
  }

  @Put('coupons/:id')
  async updateCoupon(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCouponDto,
    @Lang() lang: Language,
  ) {
    const data = await this.adminBillingService.updateCoupon(id, dto);
    return { success: true, message: t(lang, 'subscription.couponUpdated'), data };
  }

  /** Yumshoq o'chirish — kupon faolsizlantiriladi */
  @Delete('coupons/:id')
  async deactivateCoupon(@Param('id', ParseIntPipe) id: number, @Lang() lang: Language) {
    const data = await this.adminBillingService.deactivateCoupon(id);
    return { success: true, message: t(lang, 'subscription.couponDeactivated'), data };
  }

  // ==================== Hisob-fakturalar ====================

  @Get('invoices')
  async listInvoices(@Query() query: ListAdminInvoicesQueryDto) {
    const { data, pagination } = await this.adminBillingService.listInvoices(query);
    return { success: true, data, pagination };
  }

  /** To'lovni tasdiqlash: faktura PAID + shartnoma + obuna uzaytmasi (instant unlock) */
  @HttpCode(200)
  @Post('invoices/:id/confirm')
  async confirmInvoice(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmInvoiceDto,
    @Lang() lang: Language,
  ) {
    const data = await this.adminBillingService.confirmInvoice(id, dto);
    return { success: true, message: t(lang, 'subscription.invoiceConfirmed'), data };
  }

  /** To'lov so'rovini rad etish */
  @HttpCode(200)
  @Post('invoices/:id/reject')
  async rejectInvoice(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectInvoiceDto,
    @Lang() lang: Language,
  ) {
    const data = await this.adminBillingService.rejectInvoice(id, dto);
    return { success: true, message: t(lang, 'subscription.invoiceRejected'), data };
  }
}
