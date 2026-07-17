import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Session } from '../../entities/session.entity';
import { Table } from '../../entities/table.entity';
import { TablesController } from './tables.controller';
import { TablesService } from './tables.service';

@Module({
  imports: [TypeOrmModule.forFeature([Table, Session])],
  controllers: [TablesController],
  providers: [TablesService],
})
export class TablesModule {}
