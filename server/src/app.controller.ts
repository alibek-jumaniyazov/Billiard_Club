import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly dataSource: DataSource) {}

  /** Sog'liq tekshiruvi — DB ulanishi ham tekshiriladi */
  @Public()
  @Get('health')
  async health() {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException({ key: 'common.serverError' });
    }
    return { status: 'OK', timestamp: new Date().toISOString() };
  }
}
