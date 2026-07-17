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
  StreamableFile,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang, Language } from '../../common/decorators/lang.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipSubscription } from '../../common/decorators/skip-subscription.decorator';
import { t } from '../../common/i18n/messages';
import { UserRole } from '../../entities/enums';
import { User } from '../../entities/user.entity';
import {
  AdminListFeedbackQueryDto,
  ReplyFeedbackDto,
  UpdateFeedbackStatusDto,
} from './dto/feedback.dto';
import { FeedbackService } from './feedback.service';

/** Fikr-mulohaza markazi — superadmin paneli */
@Roles(UserRole.SUPERADMIN)
@SkipSubscription()
@Controller('admin/feedback')
export class FeedbackAdminController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Get()
  async findAll(@Query() query: AdminListFeedbackQueryDto) {
    const { data, pagination } = await this.feedbackService.adminFindAll(query);
    return { success: true, data, pagination };
  }

  /** Ochilganda unread -> read ga avtomatik o'tadi */
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const data = await this.feedbackService.adminFindOne(id);
    return { success: true, data };
  }

  /** Biriktirilgan rasm — superadmin uchun autentifikatsiyalangan oqim */
  @Get(':id/attachments/:index')
  async attachment(
    @Param('id', ParseIntPipe) id: number,
    @Param('index', ParseIntPipe) index: number,
  ): Promise<StreamableFile> {
    const { stream, contentType } = await this.feedbackService.getAttachmentForAdmin(id, index);
    return new StreamableFile(stream, { type: contentType });
  }

  @Put(':id/status')
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFeedbackStatusDto,
    @Lang() lang: Language,
  ) {
    const data = await this.feedbackService.updateStatus(id, dto);
    return { success: true, message: t(lang, 'feedback.statusUpdated'), data };
  }

  @HttpCode(200)
  @Post(':id/reply')
  async reply(
    @CurrentUser() admin: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReplyFeedbackDto,
    @Lang() lang: Language,
  ) {
    const data = await this.feedbackService.reply(admin, id, dto, lang);
    return { success: true, message: t(lang, 'feedback.replied'), data };
  }
}
