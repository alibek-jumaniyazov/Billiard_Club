import { Controller, Get } from '@nestjs/common';
import { ClubId } from '../../common/decorators/club-id.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../entities/enums';
import { DashboardService } from './dashboard.service';

// Bosh sahifa to'liq moliyaviy ko'rsatkichlarni (tushum, foyda, qarzlar)
// qaytaradi — OPERATOR bularni ko'rmasligi kerak (reports/expenses bilan bir xil).
@Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.KASSIR)
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
