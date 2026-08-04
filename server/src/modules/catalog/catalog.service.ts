import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, Not, Repository } from 'typeorm';
import { AuditService } from '../../common/audit/audit.service';
import { Category } from '../../entities/category.entity';
import { Product } from '../../entities/product.entity';
import { User } from '../../entities/user.entity';
import {
  AdjustStockDto,
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
    private readonly dataSource: DataSource,
    @InjectRepository(Category) private readonly categoryRepo: Repository<Category>,
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    // Global AuditModule ro'yxatdan o'tmagan bo'lsa ham servis ishga tushaveradi
    @Optional() private readonly auditService?: AuditService,
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

  /**
   * Mahsulot kartochkasini tahrirlash — ombor qoldig'iga TEGMAYDI.
   * Narxni tahrirlagan admin sahifa ochilgandan beri bo'lgan bar sotuvlarini
   * jimgina qaytarib yubormasligi uchun qoldiq faqat adjustStock() orqali.
   *
   * Narx o'zgarishi PUL NAZORATI hodisasi — u audit jurnaliga yoziladi
   * (tables.service dagi table.price naqshi bilan bir xil).
   */
  async updateProduct(clubId: number, id: number, user: User, dto: UpdateProductDto) {
    const product = await this.productRepo.findOne({ where: { id, clubId, isActive: true } });
    if (!product) throw new NotFoundException({ key: 'products.notFound' });

    if (dto.categoryId !== undefined && dto.categoryId !== product.categoryId) {
      const category = await this.categoryRepo.findOne({
        where: { id: dto.categoryId, clubId, isActive: true },
      });
      if (!category) throw new NotFoundException({ key: 'categories.notFound' });
    }

    const oldPrice = product.price;
    const priceChanged = dto.price !== undefined && dto.price !== oldPrice;

    Object.assign(product, {
      ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.price !== undefined ? { price: dto.price } : {}),
      ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
    });
    const saved = await this.productRepo.save(product);

    // Audit yozuv muvaffaqiyatli saqlangach (tables.service dagi kabi)
    if (priceChanged) {
      this.auditService?.log({
        action: 'product.price',
        clubId,
        userId: user.id,
        actorRole: user.role,
        entity: 'product',
        entityId: id,
        meta: { oldPrice, newPrice: saved.price, name: saved.name },
      });
    }

    return saved;
  }

  /**
   * Ombor qoldig'ini ATOMAR to'g'irlash (delta bo'yicha, mutlaq qiymat emas):
   * - Mahsulot qatori qulflanadi — parallel bar buyurtmasi bilan poyga bo'lmaydi
   * - Natija manfiy chiqsa — XATO (ombor minusga tushmaydi)
   * - Kim, qancha va nima sababdan o'zgartirgani audit jurnaliga yoziladi
   */
  async adjustStock(clubId: number, id: number, user: User, dto: AdjustStockDto) {
    const { before, after } = await this.dataSource.transaction(async (manager) => {
      const product = await manager.findOne(Product, {
        where: { id, clubId, isActive: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!product) throw new NotFoundException({ key: 'products.notFound' });

      const currentStock = product.stock;
      const nextStock = currentStock + dto.delta;
      if (nextStock < 0) {
        throw new BadRequestException({
          key: 'products.stockNegative',
          args: { name: product.name, stock: currentStock },
        });
      }

      await manager.update(Product, product.id, { stock: nextStock });
      return { before: currentStock, after: nextStock };
    });

    this.auditService?.log({
      action: 'product.stock',
      clubId,
      userId: user.id,
      actorRole: user.role,
      entity: 'product',
      entityId: id,
      meta: { delta: dto.delta, before, after, reason: dto.reason ?? null },
    });

    return this.productRepo.findOne({ where: { id, clubId }, relations: { category: true } });
  }

  async removeProduct(clubId: number, id: number) {
    const product = await this.productRepo.findOne({ where: { id, clubId, isActive: true } });
    if (!product) throw new NotFoundException({ key: 'products.notFound' });
    await this.productRepo.update(id, { isActive: false });
    return true;
  }
}
