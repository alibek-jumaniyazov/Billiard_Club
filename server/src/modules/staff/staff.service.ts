import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Brackets, Repository } from 'typeorm';
import { User } from '../../entities/user.entity';
import { CreateStaffDto, ListStaffQueryDto, UpdateStaffDto } from './dto/staff.dto';

@Injectable()
export class StaffService {
  constructor(@InjectRepository(User) private readonly userRepo: Repository<User>) {}

  async findAll(clubId: number, query: ListStaffQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    const qb = this.userRepo
      .createQueryBuilder('user')
      .where('user.clubId = :clubId', { clubId });

    if (query.search) {
      qb.andWhere(
        new Brackets((b) => {
          b.where('user.name ILIKE :search', { search: `%${query.search}%` }).orWhere(
            'user.username ILIKE :search',
            { search: `%${query.search}%` },
          );
        }),
      );
    }
    if (query.role) qb.andWhere('user.role = :role', { role: query.role });

    const [rows, total] = await qb
      .orderBy('user.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: rows,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  async create(clubId: number, dto: CreateStaffDto) {
    const exists = await this.userRepo.findOne({ where: { username: dto.username } });
    if (exists) throw new ConflictException({ key: 'staff.usernameTaken' });

    const hash = await bcrypt.hash(dto.password, 12);
    const user = await this.userRepo.save({
      clubId,
      name: dto.name,
      username: dto.username,
      password: hash,
      role: dto.role,
      isActive: true,
    });
    const { password: _p, ...safe } = user;
    return safe;
  }

  /**
   * Yangilash. O'z akkauntida rol/holat o'zgartirish taqiqlanadi —
   * oxirgi admin o'zini bloklab qo'yishining oldini oladi.
   */
  async update(clubId: number, currentUserId: number, id: number, dto: UpdateStaffDto) {
    const user = await this.userRepo.findOne({ where: { id, clubId } });
    if (!user) throw new NotFoundException({ key: 'staff.notFound' });

    if (
      id === currentUserId &&
      ((dto.role !== undefined && dto.role !== user.role) ||
        (dto.isActive !== undefined && dto.isActive !== user.isActive))
    ) {
      throw new BadRequestException({ key: 'staff.cannotChangeSelf' });
    }

    const updates: Partial<User> = {};
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.role !== undefined) updates.role = dto.role;
    if (dto.isActive !== undefined) updates.isActive = dto.isActive;
    if (dto.password) {
      updates.password = await bcrypt.hash(dto.password, 12);
      // Parol almashdi — eski tokenlar bekor bo'lsin
      updates.tokenVersion = user.tokenVersion + 1;
    }

    if (Object.keys(updates).length > 0) {
      await this.userRepo.update(id, updates);
    }
    return this.userRepo.findOne({ where: { id } });
  }

  /** Soft-delete: isActive=false (moliyaviy yozuvlardagi izlar saqlanadi) */
  async remove(clubId: number, currentUserId: number, id: number) {
    const user = await this.userRepo.findOne({ where: { id, clubId } });
    if (!user) throw new NotFoundException({ key: 'staff.notFound' });
    if (id === currentUserId) throw new BadRequestException({ key: 'staff.cannotDeleteSelf' });
    await this.userRepo.update(id, { isActive: false });
    return true;
  }
}
