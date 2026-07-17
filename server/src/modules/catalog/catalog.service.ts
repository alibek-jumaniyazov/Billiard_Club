import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Not, Repository } from 'typeorm';
import { Category } from '../../entities/category.entity';
import { Product } from '../../entities/product.entity';
import {
  CreateCategoryDto,
  CreateProductDto,
  ListProductsQueryDto,
  UpdateCategoryDto,
  UpdateProductDto,
} from './dto/catalog.dto';

/** Bar katalogi: kategoriyalar va mahsulotlar */
@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(Category) private readonly categoryRepo: Repository<Category>,
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
  ) {}

  // ==================== Kategoriyalar ====================

  async findCategories(clubId: number) {
    // products relation'iga ham isActive filtri — o'chirilgan mahsulotlar
    // kategoriya sonlarida ko'rinmasligi uchun
    return this.categoryRepo
      .createQueryBuilder('category')
      .leftJoinAndSelect('category.products', 'product', 'product.isActive = true')
      .where('category.clubId = :clubId', { clubId })
      .andWhere('category.isActive = true')
      .orderBy('category.name', 'ASC')
      .getMany();
  }

  async createCategory(clubId: number, dto: CreateCategoryDto) {
    const existing = await this.categoryRepo.findOne({
      where: { clubId, name: dto.name, isActive: true },
    });
    if (existing) throw new ConflictException({ key: 'categories.nameTaken' });
    return this.categoryRepo.save({
      clubId,
      name: dto.name,
      description: dto.description ?? null,
      icon: dto.icon ?? 'AppstoreOutlined',
    });
  }

  async updateCategory(clubId: number, id: number, dto: UpdateCategoryDto) {
    const category = await this.categoryRepo.findOne({ where: { id, clubId, isActive: true } });
    if (!category) throw new NotFoundException({ key: 'categories.notFound' });
    if (dto.name && dto.name !== category.name) {
      const dup = await this.categoryRepo.findOne({
        where: { clubId, name: dto.name, isActive: true, id: Not(id) },
      });
      if (dup) throw new ConflictException({ key: 'categories.nameTaken' });
    }
    Object.assign(category, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
    });
    return this.categoryRepo.save(category);
  }

  async removeCategory(clubId: number, id: number) {
    const category = await this.categoryRepo.findOne({ where: { id, clubId, isActive: true } });
    if (!category) throw new NotFoundException({ key: 'categories.notFound' });
    const productCount = await this.productRepo.count({
      where: { categoryId: id, isActive: true },
    });
    if (productCount > 0) throw new BadRequestException({ key: 'categories.hasProducts' });
    await this.categoryRepo.update(id, { isActive: false });
    return true;
  }

  // ==================== Mahsulotlar ====================

  async findProducts(clubId: number, query: ListProductsQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 50, 500);

    const where: Record<string, unknown> = { clubId, isActive: true };
    if (query.search) where.name = ILike(`%${query.search}%`);
    if (query.categoryId) where.categoryId = query.categoryId;

    const [rows, total] = await this.productRepo.findAndCount({
      where,
      relations: { category: true },
      order: { name: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: rows,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  async createProduct(clubId: number, dto: CreateProductDto) {
    const category = await this.categoryRepo.findOne({
      where: { id: dto.categoryId, clubId, isActive: true },
    });
    if (!category) throw new NotFoundException({ key: 'categories.notFound' });

    const dup = await this.productRepo.findOne({
      where: { clubId, categoryId: dto.categoryId, name: dto.name, isActive: true },
    });
    if (dup) throw new ConflictException({ key: 'products.nameTaken' });

    return this.productRepo.save({
      clubId,
      categoryId: dto.categoryId,
      name: dto.name,
      price: dto.price,
      stock: dto.stock ?? 0,
      unit: dto.unit ?? 'dona',
      description: dto.description ?? null,
    });
  }

  async updateProduct(clubId: number, id: number, dto: UpdateProductDto) {
    const product = await this.productRepo.findOne({ where: { id, clubId, isActive: true } });
    if (!product) throw new NotFoundException({ key: 'products.notFound' });

    if (dto.categoryId !== undefined && dto.categoryId !== product.categoryId) {
      const category = await this.categoryRepo.findOne({
        where: { id: dto.categoryId, clubId, isActive: true },
      });
      if (!category) throw new NotFoundException({ key: 'categories.notFound' });
    }

    Object.assign(product, {
      ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.price !== undefined ? { price: dto.price } : {}),
      ...(dto.stock !== undefined ? { stock: dto.stock } : {}),
      ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
    });
    return this.productRepo.save(product);
  }

  async removeProduct(clubId: number, id: number) {
    const product = await this.productRepo.findOne({ where: { id, clubId, isActive: true } });
    if (!product) throw new NotFoundException({ key: 'products.notFound' });
    await this.productRepo.update(id, { isActive: false });
    return true;
  }
}
