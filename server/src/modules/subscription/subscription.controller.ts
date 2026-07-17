import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang, Language } from '../../common/decorators/lang.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipSubscription } from '../../common/decorators/skip-subscription.decorator';
import { t } from '../../common/i18n/messages';
import { UserRole } from '../../entities/enums';
import { User } from '../../entities/user.entity';
import { ListMyInvoicesQueryDto, PurchaseDto } from './dto/subscription.dto';
import { SubscriptionService } from './subscription.service';

/**
 * Klub egasi (admin) uchun obuna sahifasi API si.
 * MUHIM: barcha endpointlar @SkipSubscription — muddati tugagan (LOCKED)
 * klub egasi ham obuna sotib olishi kerak. Shu sababli klub konteksti
 * request.clubId dan emas, JWT foydalanuvchisining clubId sidan olinadi
 * (SubscriptionGuard skip qilinganda request.clubId o'rnatilmaydi).
 */
@Roles(UserRole.ADMIN)
@SkipSubscription()
@Controller('subscription')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  /** Obuna holati: muddatlar, qolgan kunlar, joriy/oxirgi faktura, faol tarif */
  @Get()
  async status(@CurrentUser() user: User) {
    const data = await this.subscriptionService.status(this.clubIdOf(user));
    return { success: true, data };
  }

  /** Faol tariflar katalogi (uz+ru maydonlar birga, klient tanlaydi) */
  @Get('plans')
  async plans() {
    const data = await this.subscriptionService.plans();
    return { success: true, data };
  }

  /** To'lov so'rovi: PENDING hisob-faktura yaratiladi, superadmin xabardor qilinadi */
  @Post('purchase')
  async purchase(@CurrentUser() user: User, @Body() dto: PurchaseDto, @Lang() lang: Language) {
    const data = await this.subscriptionService.purchase(this.clubIdOf(user), dto);
    return { success: true, message: t(lang, 'subscription.purchaseCreated'), data };
  }

  /** O'z hisob-fakturalari tarixi (sahifalangan) */
  @Get('invoices')
  async invoices(@CurrentUser() user: User, @Query() query: ListMyInvoicesQueryDto) {
    const { data, pagination } = await this.subscriptionService.myInvoices(
      this.clubIdOf(user),
      query,
    );
    return { success: true, data, pagination };
  }

  /** O'zining PENDING fakturasini bekor qilish */
  @Delete('invoices/:id')
  async cancelInvoice(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Lang() lang: Language,
  ) {
    const data = await this.subscriptionService.cancelMyInvoice(this.clubIdOf(user), id);
    return { success: true, message: t(lang, 'subscription.invoiceCancelled'), data };
  }

  /** Admin foydalanuvchining klubi — kontekst bo'lmasa rad etiladi */
  private clubIdOf(user: User): number {
    if (!user?.clubId) {
      throw new ForbiddenException({ key: 'subscription.clubContextRequired' });
    }
    return user.clubId;
  }
}
