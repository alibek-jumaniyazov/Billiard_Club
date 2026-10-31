import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Brackets, In, IsNull, Repository } from 'typeorm';
import { AuditService } from '../../common/audit/audit.service';
import { PlanTiersService } from '../../common/plan-tiers/plan-tiers.service';
import { Club } from '../../entities/club.entity';
import { UserRole } from '../../entities/enums';
import { RefreshSession } from '../../entities/refresh-session.entity';
import { User } from '../../entities/user.entity';
import { CreateStaffDto, ListStaffQueryDto, UpdateStaffDto } from './dto/staff.dto';

@Injectable()
export class StaffService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(RefreshSession)
    private readonly refreshRepo: Repository<RefreshSession>,
    // Global AuditModule ro'yxatdan o'tmagan bo'lsa ham servis ishga tushaveradi
    @Optional() private readonly auditService?: AuditService,
    @Optional() private readonly tiers?: PlanTiersService,
  ) {}

  /**
   * Tarif cheklovi. Xodim qo'shish tarifda bo'lmasa — 403 FEATURE_LOCKED (faqat
   * egasi ishlaydi). Bo'lsa — faol hisoblar EGASI BILAN (admin/kassir/operator)
   * soni; cheklovga yetgan bo'lsa 403 LIMIT_REACHED.
   */
  private async assertStaffLimit(clubId: number): Promise<void> {
    if (!this.tiers) return;
    const club = await this.userRepo.manager.getRepository(Club).findOne({ where: { id: clubId }, select: { id: true, tier: true } });
    if (!club) return;
    await this.tiers.assertFeature(club, 'staff');
    const current = await this.userRepo.count({
      where: { clubId, isActive: true, role: In([UserRole.ADMIN, UserRole.KASSIR, UserRole.OPERATOR]) },
    });
    await this.tiers.assertLimit(club, 'staff', current);
  }

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
    await this.assertStaffLimit(clubId);

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
   *
   * HISOB EGALLASH amallari (parol almashtirish, rol berish, faolsizlantirish)
   * audit jurnaliga yoziladi — kim kimga nima qilgani iz qoldiradi.
   */
  async update(clubId: number, actor: User, id: number, dto: UpdateStaffDto) {
    const currentUserId = actor.id;
    const user = await this.userRepo.findOne({ where: { id, clubId } });
    if (!user) throw new NotFoundException({ key: 'staff.notFound' });

    if (
      id === currentUserId &&
      ((dto.role !== undefined && dto.role !== user.role) ||
        (dto.isActive !== undefined && dto.isActive !== user.isActive))
    ) {
      throw new BadRequestException({ key: 'staff.cannotChangeSelf' });
    }

    // Bloklangan hisobni qayta yoqish ham yangi o'rin egallaydi — tarif cheklovi
    if (dto.isActive === true && !user.isActive) await this.assertStaffLimit(clubId);

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

    // tokenVersion tokenlarni o'ldiradi, lekin refresh_sessions qatorlari
    // ochiq qolib, GET /auth/sessions da o'lik qurilmalarni "faol" ko'rsatardi.
    // auth.service.changePassword bilan bir xil idioma: hammasi revoked.
    if (dto.password) {
      await this.refreshRepo.update(
        { userId: id, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
    }

    // Audit yozuvlari o'zgarish saqlangach (debts/tables dagi kabi)
    const audit = (action: string, meta: Record<string, unknown>) =>
      this.auditService?.log({
        action,
        clubId,
        userId: actor.id,
        actorRole: actor.role,
        entity: 'user',
        entityId: id,
        meta: { username: user.username, ...meta },
      });
    if (dto.password) audit('staff.password_reset', {});
    if (updates.role !== undefined && updates.role !== user.role) {
      audit('staff.role_change', { oldRole: user.role, newRole: updates.role });
    }
    if (updates.isActive === false && user.isActive) audit('staff.deactivate', {});

    return this.userRepo.findOne({ where: { id } });
  }

  /** Soft-delete: isActive=false (moliyaviy yozuvlardagi izlar saqlanadi) */
  async remove(clubId: number, actor: User, id: number) {
    const user = await this.userRepo.findOne({ where: { id, clubId } });
    if (!user) throw new NotFoundException({ key: 'staff.notFound' });
    if (id === actor.id) throw new BadRequestException({ key: 'staff.cannotDeleteSelf' });
    await this.userRepo.update(id, { isActive: false });

    this.auditService?.log({
      action: 'staff.deactivate',
      clubId,
      userId: actor.id,
      actorRole: actor.role,
      entity: 'user',
      entityId: id,
      meta: { username: user.username, role: user.role, viaDelete: true },
    });

    return true;
  }
}
