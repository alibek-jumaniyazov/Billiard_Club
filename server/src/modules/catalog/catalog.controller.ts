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
import { CatalogService } from './catalog.service';
import {
  CreateCategoryDto,
  CreateProductDto,
  ListProductsQueryDto,
  UpdateCategoryDto,
  UpdateProductDto,
} from './dto/catalog.dto';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get()
  async findAll(@ClubId() clubId: number) {
    const data = await this.catalogService.findCategories(clubId);
    return { success: true, data };
  }

  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  @Post()
  async create(@ClubId() clubId: number, @Body() dto: CreateCategoryDto, @Lang() lang: Language) {
    const data = await this.catalogService.createCategory(clubId, dto);
    return { success: true, message: t(lang, 'categories.created'), data };
  }

  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  @Put(':id')
  async update(
    @ClubId() clubId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDto,
    @Lang() lang: Language,
  ) {
    const data = await this.catalogService.updateCategory(clubId, id, dto);
    return { success: true, message: t(lang, 'categories.updated'), data };
  }

  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  @Delete(':id')
  async remove(
    @ClubId() clubId: number,
    @Param('id', ParseIntPipe) id: number,
    @Lang() lang: Language,
  ) {
    await this.catalogService.removeCategory(clubId, id);
    return { success: true, message: t(lang, 'categories.deleted') };
  }
}

@Controller('products')
export class ProductsController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get()
  async findAll(@ClubId() clubId: number, @Query() query: ListProductsQueryDto) {
    const { data, pagination } = await this.catalogService.findProducts(clubId, query);
    return { success: true, data, pagination };
  }

  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  @Post()
  async create(@ClubId() clubId: number, @Body() dto: CreateProductDto, @Lang() lang: Language) {
    const data = await this.catalogService.createProduct(clubId, dto);
    return { success: true, message: t(lang, 'products.created'), data };
  }

  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  @Put(':id')
  async update(
    @ClubId() clubId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
    @Lang() lang: Language,
  ) {
    const data = await this.catalogService.updateProduct(clubId, id, dto);
    return { success: true, message: t(lang, 'products.updated'), data };
  }

  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  @Delete(':id')
  async remove(
    @ClubId() clubId: number,
    @Param('id', ParseIntPipe) id: number,
    @Lang() lang: Language,
  ) {
    await this.catalogService.removeProduct(clubId, id);
    return { success: true, message: t(lang, 'products.deleted') };
  }
}
