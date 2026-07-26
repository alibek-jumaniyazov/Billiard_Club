import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang, Language } from '../../common/decorators/lang.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipSubscription } from '../../common/decorators/skip-subscription.decorator';
import { USER_THROTTLER, UserThrottlerGuard } from '../../common/guards/user-throttler.guard';
import { t } from '../../common/i18n/messages';
import { UserRole } from '../../entities/enums';
import { User } from '../../entities/user.entity';
import { CreateFeedbackDto, ListFeedbackQueryDto } from './dto/feedback.dto';
import { FeedbackService } from './feedback.service';

/**
 * Fikr-mulohaza markazi — klub tomoni.
 * @SkipSubscription: obunasi tugagan/bloklangan klub egasi ham
 * shikoyat yubora olishi kerak (blok ekranidan). Shu sababli klub
 * konteksti request.clubId dan emas, foydalanuvchining o'zidan olinadi.
 */
@Roles(UserRole.ADMIN, UserRole.KASSIR, UserRole.OPERATOR)
@SkipSubscription()
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  /**
   * Yangi fikr yuborish — HAR FOYDALANUVCHI uchun soatiga 10 tadan ko'p emas.
   * Limit SHART: @SkipSubscription tufayli bu yo'l bloklangan yoki muddati
   * tugagan klubga ham ochiq, biriktirmalar esa server DISKIGA yoziladi.
   * Limitsiz bo'lsa bitta hisob bilan diskni to'ldirib qo'yish mumkin edi.
   *
   * DIQQAT: limit IP emas, foydalanuvchi bo'yicha sanaladi (UserThrottlerGuard).
   * Global ThrottlerGuard auth'dan oldin ishlaydi va reverse proxy ortida
   * hamma so'rovni bitta IP deb ko'radi — u yerda 10/soat butun platformaga
   * umumiy bo'lib qolardi. Marshrut guard'i esa JwtAuthGuard'dan keyin
   * ishlaydi, shu bois req.user bo'yicha kalitlash mumkin.
   */
  @Throttle({ [USER_THROTTLER]: { limit: 10, ttl: 60 * 60 * 1000 } })
  @UseGuards(UserThrottlerGuard)
  @Post()
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateFeedbackDto,
    @Lang() lang: Language,
  ) {
    const data = await this.feedbackService.create(user, dto);
    return { success: true, message: t(lang, 'feedback.created'), data };
  }

  @Get()
  async findAll(@CurrentUser() user: User, @Query() query: ListFeedbackQueryDto) {
    const { data, pagination } = await this.feedbackService.findForClub(user, query);
    return { success: true, data, pagination };
  }

  /**
   * Biriktirilgan rasm — autentifikatsiyalangan oqim. uploads statik
   * tarqatilmaydi (tenant izolyatsiyasi), rasm faqat shu endpoint orqali
   * va faqat o'z klubining fikri uchun beriladi.
   */
  @Get(':id/attachments/:index')
  async attachment(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Param('index', ParseIntPipe) index: number,
  ): Promise<StreamableFile> {
    const { stream, contentType } = await this.feedbackService.getAttachmentForClub(
      user,
      id,
      index,
    );
    return new StreamableFile(stream, { type: contentType });
  }
}
