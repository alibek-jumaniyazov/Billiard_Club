import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { Club } from '../../entities/club.entity';
import { ClubNotification } from '../../entities/club-notification.entity';
import { ClubStatus } from '../../entities/enums';
import { User } from '../../entities/user.entity';
import { ListNotificationsQueryDto, SendNotificationDto } from './dto/notifications.dto';

/** Fan-out da bitta INSERT ga sig'adigan yozuvlar soni */
const FANOUT_CHUNK_SIZE = 500;

/**
 * Klub xabarnomalari:
 *  - klub egasi o'z xabarnomalarini o'qiydi (o'qildi belgisi bilan);
 *  - superadmin bitta klubga yoki barcha bloklanmagan klublarga yuboradi.
 */
@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(ClubNotification)
    private readonly notificationRepo: Repository<ClubNotification>,
    @InjectRepository(Club) private readonly clubRepo: Repository<Club>,
  ) {}

  // ==================== Klub egasi tomoni ====================

  /**
   * O'z klubining xabarnomalari + o'qilmaganlar soni.
   * @SkipSubscription tufayli klub konteksti foydalanuvchidan olinadi —
   * obunasi tugagan egasi ham platforma xabarlarini ko'ra olsin.
   */
  async listForClub(user: User, query: ListNotificationsQueryDto) {
    const clubId = this.requireClubId(user);
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    const [rows, total] = await this.notificationRepo.findAndCount({
      where: { clubId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const unreadCount = await this.notificationRepo.count({
      where: { clubId, readAt: IsNull() },
    });

    return {
      data: rows,
      unreadCount,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  /** Bitta xabarnomani o'qilgan deb belgilash */
  async markRead(user: User, id: number): Promise<ClubNotification> {
    const clubId = this.requireClubId(user);
    const notification = await this.notificationRepo.findOne({ where: { id, clubId } });
    if (!notification) throw new NotFoundException({ key: 'notifications.notFound' });

    if (!notification.readAt) {
      notification.readAt = new Date();
      await this.notificationRepo.update(id, { readAt: notification.readAt });
    }
    return notification;
  }

  /** Barchasini o'qilgan deb belgilash */
  async markAllRead(user: User): Promise<void> {
    const clubId = this.requireClubId(user);
    await this.notificationRepo.update({ clubId, readAt: IsNull() }, { readAt: new Date() });
  }

  // ==================== Superadmin tomoni ====================

  /**
   * Xabarnoma yuborish: clubId berilsa — bitta klubga; berilmasa —
   * BARCHA bloklanmagan klublarga fan-out (bo'lak-bo'lak INSERT,
   * minglab klubda ham bitta gigant so'rov bo'lmasligi uchun).
   */
  async adminSend(admin: User, dto: SendNotificationDto) {
    const base = {
      title: dto.title,
      body: dto.body,
      type: dto.type ?? 'info',
      createdById: admin.id,
    };

    if (dto.clubId) {
      const club = await this.clubRepo.findOne({ where: { id: dto.clubId } });
      if (!club) throw new NotFoundException({ key: 'clubs.notFound' });

      const data = await this.notificationRepo.save(
        this.notificationRepo.create({ ...base, clubId: club.id }),
      );
      return { count: 1, data };
    }

    const clubs = await this.clubRepo.find({
      select: { id: true },
      where: { status: Not(ClubStatus.BLOCKED) },
    });

    for (let i = 0; i < clubs.length; i += FANOUT_CHUNK_SIZE) {
      const chunk = clubs
        .slice(i, i + FANOUT_CHUNK_SIZE)
        .map((club) => ({ ...base, clubId: club.id }));
      await this.notificationRepo.insert(chunk);
    }

    return { count: clubs.length, data: null };
  }

  /** Yuborilganlar tarixi — tekis ro'yxat, sahifalangan */
  async adminHistory(query: ListNotificationsQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    const [rows, total] = await this.notificationRepo.findAndCount({
      relations: { club: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: rows,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  // ==================== Yordamchilar ====================

  private requireClubId(user: User): number {
    if (!user.clubId) {
      throw new ForbiddenException({ key: 'subscription.clubContextRequired' });
    }
    return user.clubId;
  }
}
