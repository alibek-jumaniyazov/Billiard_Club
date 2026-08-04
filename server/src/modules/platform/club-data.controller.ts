import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipSubscription } from '../../common/decorators/skip-subscription.decorator';
import { UserRole } from '../../entities/enums';
import { ClubDataService } from './club-data.service';
import { AuditLogsQueryDto, ClubDataQueryDto } from './dto/platform.dto';
import { PlatformService } from './platform.service';

/**
 * Klub ma'lumotlari konsoli — FAQAT superadmin, FAQAT O'QISH.
 *
 * `@SkipSubscription()`: bu platforma yo'li. Aynan MUDDATI TUGAGAN klubning
 * ma'lumotini ko'rish eng zarur payt (obunani uzaytirish yoki uzaytirmaslik
 * qarori shu yerda qabul qilinadi), shuning uchun obuna tekshiruvi bu yerda
 * o'tkazib yuboriladi.
 *
 * Diqqat: bu yerda birorta ham POST/PUT/DELETE yo'q va shunday qolishi kerak.
 * Yozish kerak bo'lsa "klubni ko'rish" (impersonatsiya) rejimi bor — u har
 * bir amalni `admin.impersonate` sifatida jurnalga yozadi.
 */
@Roles(UserRole.SUPERADMIN)
@SkipSubscription()
@Controller('admin/platform/clubs/:clubId')
export class ClubDataController {
  constructor(
    private readonly clubData: ClubDataService,
    private readonly platform: PlatformService,
  ) {}

  @Get('overview')
  async overview(@Param('clubId', ParseIntPipe) clubId: number) {
    return { success: true, data: await this.clubData.overview(clubId) };
  }

  @Get('sessions')
  async sessions(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Query() query: ClubDataQueryDto,
  ) {
    const { data, pagination } = await this.clubData.sessions(clubId, query);
    return { success: true, data, pagination };
  }

  @Get('orders')
  async orders(@Param('clubId', ParseIntPipe) clubId: number, @Query() query: ClubDataQueryDto) {
    const { data, pagination } = await this.clubData.orders(clubId, query);
    return { success: true, data, pagination };
  }

  @Get('debts')
  async debts(@Param('clubId', ParseIntPipe) clubId: number, @Query() query: ClubDataQueryDto) {
    const { data, pagination } = await this.clubData.debts(clubId, query);
    return { success: true, data, pagination };
  }

  @Get('staff')
  async staff(@Param('clubId', ParseIntPipe) clubId: number) {
    return { success: true, data: await this.clubData.staffActivity(clubId) };
  }

  /**
   * Klub faoliyati jurnali — oflayn kiritilgan amallar (`offline.replay`)
   * ham shu yerda ko'rinadi: qachon navbatga qo'yilgani, qachon yetib
   * kelgani va kechikish.
   *
   * Mavjud audit o'quvchisi qayta ishlatiladi, lekin `clubId` URL dan
   * MAJBURIY olinadi — so'rov parametri bilan boshqa klubni so'rab bo'lmaydi.
   */
  @Get('activity')
  async activity(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Query() query: AuditLogsQueryDto,
  ) {
    const { data, pagination } = await this.platform.auditLogs({ ...query, clubId });
    return { success: true, data, pagination };
  }
}
