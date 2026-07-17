import { BadRequestException, Controller, Get, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ClubId } from '../../common/decorators/club-id.decorator';
import { Lang, Language } from '../../common/decorators/lang.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../entities/enums';
import { ReportQueryDto } from './dto/reports.dto';
import { ReportsService, ReportType } from './reports.service';

const REPORT_TYPES: ReportType[] = ['daily', 'weekly', 'monthly', 'custom'];

@Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.KASSIR)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('export/excel')
  async exportExcel(
    @ClubId() clubId: number,
    @Query('type') type: string = 'custom',
    @Query() query: ReportQueryDto,
    @Lang() lang: Language,
    @Res() res: Response,
  ) {
    if (!REPORT_TYPES.includes(type as ReportType)) {
      throw new BadRequestException({ key: 'reports.invalidFormat' });
    }
    await this.reportsService.exportExcel(clubId, type as ReportType, query, lang, res);
  }

  /** Bar/mahsulot savdosi hisoboti (':type' dan OLDIN turishi shart) */
  @Get('products')
  async products(
    @ClubId() clubId: number,
    @Query('type') type: string = 'daily',
    @Query() query: ReportQueryDto,
  ) {
    if (!REPORT_TYPES.includes(type as ReportType)) {
      throw new BadRequestException({ key: 'reports.invalidRange' });
    }
    const data = await this.reportsService.productsReport(clubId, type as ReportType, query);
    return { success: true, data };
  }

  @Get(':type')
  async getReport(
    @ClubId() clubId: number,
    @Param('type') type: string,
    @Query() query: ReportQueryDto,
  ) {
    if (!REPORT_TYPES.includes(type as ReportType)) {
      throw new BadRequestException({ key: 'reports.invalidRange' });
    }
    const data = await this.reportsService.getReport(clubId, type as ReportType, query);
    return { success: true, data };
  }
}
