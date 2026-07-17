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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang, Language } from '../../common/decorators/lang.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { t } from '../../common/i18n/messages';
import { UserRole } from '../../entities/enums';
import { User } from '../../entities/user.entity';
import {
  EndSessionDto,
  ListSessionsQueryDto,
  StartSessionDto,
  TransferSessionDto,
} from './dto/sessions.dto';
import { SessionsService } from './sessions.service';

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  async findAll(@ClubId() clubId: number, @Query() query: ListSessionsQueryDto) {
    const { data, pagination } = await this.sessionsService.findAll(clubId, query);
    return { success: true, data, pagination };
  }

  /** Chek oldindan ko'rish — yakunlamasdan joriy sekundlik summalar (checkout modal) */
  @Get(':id/receipt')
  async receipt(@ClubId() clubId: number, @Param('id', ParseIntPipe) id: number) {
    const data = await this.sessionsService.receipt(clubId, id);
    return { success: true, data };
  }

  @Get(':id')
  async findOne(@ClubId() clubId: number, @Param('id', ParseIntPipe) id: number) {
    const data = await this.sessionsService.findOne(clubId, id);
    return { success: true, data };
  }

  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.KASSIR, UserRole.OPERATOR)
  @Post('start')
  async start(
    @ClubId() clubId: number,
    @CurrentUser() user: User,
    @Body() dto: StartSessionDto,
    @Lang() lang: Language,
  ) {
    const data = await this.sessionsService.start(clubId, user, dto);
    return { success: true, message: t(lang, 'sessions.started'), data };
  }

  /** Hisob-kitob — faqat kassir va admin */
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.KASSIR)
  @HttpCode(200)
  @Put(':id/end')
  async end(
    @ClubId() clubId: number,
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EndSessionDto,
    @Lang() lang: Language,
  ) {
    const data = await this.sessionsService.end(clubId, user, id, dto);
    return {
      success: true,
      message: t(lang, data.isDebt ? 'sessions.endedWithDebt' : 'sessions.ended'),
      data,
    };
  }

  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.KASSIR, UserRole.OPERATOR)
  @HttpCode(200)
  @Put(':id/pause')
  async pause(
    @ClubId() clubId: number,
    @Param('id', ParseIntPipe) id: number,
    @Lang() lang: Language,
  ) {
    const data = await this.sessionsService.pause(clubId, id);
    return { success: true, message: t(lang, 'sessions.paused'), data };
  }

  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.KASSIR, UserRole.OPERATOR)
  @HttpCode(200)
  @Put(':id/resume')
  async resume(
    @ClubId() clubId: number,
    @Param('id', ParseIntPipe) id: number,
    @Lang() lang: Language,
  ) {
    const data = await this.sessionsService.resume(clubId, id);
    return { success: true, message: t(lang, 'sessions.resumed'), data };
  }

  /** Sessiyani boshqa stolga ko'chirish — faqat faol sessiya */
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.KASSIR, UserRole.OPERATOR)
  @HttpCode(200)
  @Post(':id/transfer')
  async transfer(
    @ClubId() clubId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TransferSessionDto,
    @Lang() lang: Language,
  ) {
    const data = await this.sessionsService.transfer(clubId, id, dto);
    return { success: true, message: t(lang, 'sessions.transferred'), data };
  }

  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.KASSIR)
  @HttpCode(200)
  @Put(':id/cancel')
  async cancel(
    @ClubId() clubId: number,
    @Param('id', ParseIntPipe) id: number,
    @Lang() lang: Language,
  ) {
    const data = await this.sessionsService.cancel(clubId, id);
    return { success: true, message: t(lang, 'sessions.cancelled'), data };
  }
}
