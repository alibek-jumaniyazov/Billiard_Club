import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ClubId } from '../../common/decorators/club-id.decorator';
import { Lang, Language } from '../../common/decorators/lang.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { t } from '../../common/i18n/messages';
import { UserRole } from '../../entities/enums';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, ListCustomersQueryDto, UpdateCustomerDto } from './dto/customers.dto';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  async findAll(@ClubId() clubId: number, @Query() query: ListCustomersQueryDto) {
    const { data, pagination } = await this.customersService.findAll(clubId, query);
    return { success: true, data, pagination };
  }

  /** Mijoz profili: statistika + so'nggi sessiyalar */
  @Get(':id')
  async profile(@ClubId() clubId: number, @Param('id', ParseIntPipe) id: number) {
    const data = await this.customersService.profile(clubId, id);
    return { success: true, data };
  }

  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.KASSIR)
  @Post()
  async create(
    @ClubId() clubId: number,
    @Body() dto: CreateCustomerDto,
    @Lang() lang: Language,
  ) {
    const data = await this.customersService.create(clubId, dto);
    return { success: true, message: t(lang, 'customers.created'), data };
  }

  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.KASSIR)
  @Put(':id')
  async update(
    @ClubId() clubId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCustomerDto,
    @Lang() lang: Language,
  ) {
    const data = await this.customersService.update(clubId, id, dto);
    return { success: true, message: t(lang, 'customers.updated'), data };
  }

  /** O'chirish faqat admin uchun; ochiq qarzli mijoz o'chirilmaydi */
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  @Delete(':id')
  async remove(
    @ClubId() clubId: number,
    @Param('id', ParseIntPipe) id: number,
    @Lang() lang: Language,
  ) {
    await this.customersService.remove(clubId, id);
    return { success: true, message: t(lang, 'customers.deleted') };
  }
}
