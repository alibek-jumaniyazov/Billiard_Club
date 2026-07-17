import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from '../../entities/customer.entity';
import { Session } from '../../entities/session.entity';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  imports: [TypeOrmModule.forFeature([Customer, Session])],
  controllers: [CustomersController],
  providers: [CustomersService],
  // findOrLinkByPhone yordamchisi sessions moduli uchun eksport qilinadi
  exports: [CustomersService],
})
export class CustomersModule {}
