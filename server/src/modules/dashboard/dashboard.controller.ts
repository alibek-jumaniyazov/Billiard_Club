import { Controller, Get } from '@nestjs/common';
import { ClubId } from '../../common/decorators/club-id.decorator';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  async stats(@ClubId() clubId: number) {
    const data = await this.dashboardService.stats(clubId);
    // serverNow — jonli taymerlarda soat siljishini (clock skew) yo'qotish uchun
    return { success: true, data, serverNow: new Date().toISOString() };
  }
}
