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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang, Language } from '../../common/decorators/lang.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { t } from '../../common/i18n/messages';
import { UserRole } from '../../entities/enums';
import { User } from '../../entities/user.entity';
import { CreateExpenseDto, ListExpensesQueryDto, UpdateExpenseDto } from './dto/expenses.dto';
import { EXPENSE_CATEGORY_SUGGESTIONS } from './expense-categories';
import { ExpensesService } from './expenses.service';

/** Xarajatlar — moliyaviy bo'lim: operator ko'rmaydi, kassir kiritadi, admin boshqaradi */
@Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.KASSIR)
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Get()
  async findAll(@ClubId() clubId: number, @Query() query: ListExpensesQueryDto) {
    const { data, sum, pagination } = await this.expensesService.findAll(clubId, query);
    return { success: true, data, sum, pagination };
  }

  /** Tavsiya etiladigan toifalar ro'yxati (UI uchun) */
  @Get('categories')
  categories() {
    return { success: true, data: EXPENSE_CATEGORY_SUGGESTIONS };
  }

  @Post()
  async create(
    @ClubId() clubId: number,
    @CurrentUser() user: User,
    @Body() dto: CreateExpenseDto,
    @Lang() lang: Language,
  ) {
    const data = await this.expensesService.create(clubId, user, dto);
    return { success: true, message: t(lang, 'expenses.created'), data };
  }

  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  @Put(':id')
  async update(
    @ClubId() clubId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExpenseDto,
    @Lang() lang: Language,
  ) {
    const data = await this.expensesService.update(clubId, id, dto);
    return { success: true, message: t(lang, 'expenses.updated'), data };
  }

  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  @Delete(':id')
  async remove(
    @ClubId() clubId: number,
    @Param('id', ParseIntPipe) id: number,
    @Lang() lang: Language,
  ) {
    await this.expensesService.remove(clubId, id);
    return { success: true, message: t(lang, 'expenses.deleted') };
  }
}
