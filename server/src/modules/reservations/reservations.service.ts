import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Customer } from '../../entities/customer.entity';
import { ReservationStatus } from '../../entities/enums';
import { Reservation } from '../../entities/reservation.entity';
import { Table } from '../../entities/table.entity';
import {
  CreateReservationDto,
  ListReservationsQueryDto,
  UpdateReservationDto,
} from './dto/reservations.dto';

/** Davomiylik ko'rsatilmagan bron uchun to'qnashuv tekshiruvidagi standart oyna */
const DEFAULT_DURATION_MIN = 60;

/**
 * Ruxsat etilgan holat o'tishlari. cancelled/no_show/seated — yakuniy holatlar
 * (seated dan qaytish yo'q: mijoz allaqachon o'tirgan).
 */
const ALLOWED_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  [ReservationStatus.PENDING]: [
    ReservationStatus.CONFIRMED,
    ReservationStatus.SEATED,
    ReservationStatus.CANCELLED,
    ReservationStatus.NO_SHOW,
  ],
  [ReservationStatus.CONFIRMED]: [
    ReservationStatus.SEATED,
    ReservationStatus.CANCELLED,
    ReservationStatus.NO_SHOW,
  ],
  [ReservationStatus.SEATED]: [],
  [ReservationStatus.CANCELLED]: [],
  [ReservationStatus.NO_SHOW]: [],
};

/** 'YYYY-MM-DD' server-lokal kun; to'liq ISO ham qabul qilinadi */
const parseDateParam = (value: string, endExclusive = false): Date => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  let date: Date;
  if (match) {
    date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (endExclusive) date.setDate(date.getDate() + 1);
  } else {
    date = new Date(value);
  }
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException({ key: 'reports.invalidRange' });
  }
  return date;
};

@Injectable()
export class ReservationsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Reservation) private readonly reservationRepo: Repository<Reservation>,
  ) {}

  async findAll(clubId: number, query: ListReservationsQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 50, 100);

    const qb = this.reservationRepo
      .createQueryBuilder('reservation')
      .leftJoinAndSelect('reservation.table', 'table')
      .leftJoinAndSelect('reservation.customer', 'customer')
      .where('reservation.clubId = :clubId', { clubId });

    if (query.status) qb.andWhere('reservation.status = :status', { status: query.status });
    if (query.tableId) qb.andWhere('reservation.tableId = :tableId', { tableId: query.tableId });
    if (query.from) {
      qb.andWhere('reservation.startsAt >= :from', { from: parseDateParam(query.from) });
    }
    if (query.to) {
      qb.andWhere('reservation.startsAt < :to', { to: parseDateParam(query.to, true) });
    }

    const [rows, total] = await qb
      .orderBy('reservation.startsAt', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: rows,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  async findOne(clubId: number, id: number) {
    const reservation = await this.reservationRepo.findOne({
      where: { id, clubId },
      relations: { table: true, customer: true },
    });
    if (!reservation) throw new NotFoundException({ key: 'reservations.notFound' });
    return reservation;
  }

  /**
   * Bron yaratish. Xuddi shu stolda vaqti kesishadigan boshqa faol bron bo'lsa —
   * OGOHLANTIRISH qaytariladi (qat'iy blok EMAS: klub o'zi hal qiladi).
   * Sessiya avtomatik yaratilmaydi.
   */
  async create(clubId: number, dto: CreateReservationDto) {
    const table = await this.dataSource
      .getRepository(Table)
      .findOne({ where: { id: dto.tableId, clubId, isActive: true } });
    if (!table) throw new NotFoundException({ key: 'tables.notFound' });

    let customer: Customer | null = null;
    if (dto.customerId) {
      customer = await this.dataSource
        .getRepository(Customer)
        .findOne({ where: { id: dto.customerId, clubId } });
      if (!customer) throw new NotFoundException({ key: 'customers.notFound' });
    }

    const startsAt = new Date(dto.startsAt);
    const overlaps = await this.findOverlaps(
      clubId,
      dto.tableId,
      startsAt,
      dto.durationMinutes ?? null,
    );

    const saved = await this.reservationRepo.save({
      clubId,
      tableId: dto.tableId,
      customerId: customer?.id ?? null,
      customerName: dto.customerName?.trim() || customer?.name || null,
      customerPhone: dto.customerPhone?.trim() || customer?.phone || null,
      startsAt,
      durationMinutes: dto.durationMinutes ?? null,
      status: ReservationStatus.PENDING,
      notes: dto.notes?.trim() || null,
    });

    const reservation = await this.findOne(clubId, saved.id);
    return { reservation, overlaps };
  }

  /**
   * Bronni yangilash:
   * - status o'tishlari ALLOWED_TRANSITIONS bo'yicha tekshiriladi
   * - yakuniy holatdagi (cancelled/no_show) bronning maydonlari o'zgartirilmaydi
   * - vaqt/stol o'zgarsa to'qnashuv qayta tekshiriladi (ogohlantirish bilan)
   */
  async update(clubId: number, id: number, dto: UpdateReservationDto) {
    const reservation = await this.reservationRepo.findOne({ where: { id, clubId } });
    if (!reservation) throw new NotFoundException({ key: 'reservations.notFound' });

    if (dto.status !== undefined && dto.status !== reservation.status) {
      const allowed = ALLOWED_TRANSITIONS[reservation.status] ?? [];
      if (!allowed.includes(dto.status)) {
        throw new BadRequestException({ key: 'reservations.invalidTransition' });
      }
    }

    const timingChanged =
      dto.tableId !== undefined || dto.startsAt !== undefined || dto.durationMinutes !== undefined;
    const fieldsChanged =
      timingChanged ||
      dto.customerId !== undefined ||
      dto.customerName !== undefined ||
      dto.customerPhone !== undefined ||
      dto.notes !== undefined;
    const isFinal =
      reservation.status === ReservationStatus.CANCELLED ||
      reservation.status === ReservationStatus.NO_SHOW;
    if (fieldsChanged && isFinal) {
      throw new BadRequestException({ key: 'reservations.invalidTransition' });
    }

    if (dto.tableId !== undefined && dto.tableId !== reservation.tableId) {
      const table = await this.dataSource
        .getRepository(Table)
        .findOne({ where: { id: dto.tableId, clubId, isActive: true } });
      if (!table) throw new NotFoundException({ key: 'tables.notFound' });
      reservation.tableId = dto.tableId;
    }
    if (dto.customerId !== undefined) {
      const customer = await this.dataSource
        .getRepository(Customer)
        .findOne({ where: { id: dto.customerId, clubId } });
      if (!customer) throw new NotFoundException({ key: 'customers.notFound' });
      reservation.customerId = customer.id;
      if (dto.customerName === undefined && !reservation.customerName) {
        reservation.customerName = customer.name;
      }
    }
    if (dto.startsAt !== undefined) reservation.startsAt = new Date(dto.startsAt);
    if (dto.durationMinutes !== undefined) reservation.durationMinutes = dto.durationMinutes;
    if (dto.customerName !== undefined) reservation.customerName = dto.customerName.trim() || null;
    if (dto.customerPhone !== undefined)
      reservation.customerPhone = dto.customerPhone.trim() || null;
    if (dto.notes !== undefined) reservation.notes = dto.notes.trim() || null;
    if (dto.status !== undefined) reservation.status = dto.status;

    await this.reservationRepo.save(reservation);

    const overlaps = timingChanged
      ? await this.findOverlaps(
          clubId,
          reservation.tableId,
          reservation.startsAt,
          reservation.durationMinutes,
          id,
        )
      : [];

    return { reservation: await this.findOne(clubId, id), overlaps };
  }

  /** Bekor qilish — faqat kutilayotgan/tasdiqlangan bronlar uchun */
  async cancel(clubId: number, id: number) {
    const reservation = await this.reservationRepo.findOne({ where: { id, clubId } });
    if (!reservation) throw new NotFoundException({ key: 'reservations.notFound' });
    if (
      reservation.status !== ReservationStatus.PENDING &&
      reservation.status !== ReservationStatus.CONFIRMED
    ) {
      throw new BadRequestException({ key: 'reservations.invalidTransition' });
    }
    reservation.status = ReservationStatus.CANCELLED;
    await this.reservationRepo.save(reservation);
    return this.findOne(clubId, id);
  }

  /**
   * Xuddi shu stolda vaqti kesishadigan faol (pending/confirmed/seated) bronlar.
   * Oyna: [startsAt, startsAt + durationMinutes); davomiylik ko'rsatilmagan
   * bronlar uchun 60 daqiqa deb olinadi.
   */
  private async findOverlaps(
    clubId: number,
    tableId: number,
    startsAt: Date,
    durationMinutes: number | null,
    excludeId?: number,
  ): Promise<Reservation[]> {
    const durMin = durationMinutes ?? DEFAULT_DURATION_MIN;
    const endAt = new Date(startsAt.getTime() + durMin * 60_000);

    const qb = this.reservationRepo
      .createQueryBuilder('r')
      .where('r.clubId = :clubId', { clubId })
      .andWhere('r.tableId = :tableId', { tableId })
      .andWhere('r.status IN (:...statuses)', {
        statuses: [
          ReservationStatus.PENDING,
          ReservationStatus.CONFIRMED,
          ReservationStatus.SEATED,
        ],
      })
      .andWhere('r.startsAt < :endAt', { endAt })
      .andWhere(
        `r."startsAt" + make_interval(mins => COALESCE(r."durationMinutes", ${DEFAULT_DURATION_MIN})) > :startAt`,
        { startAt: startsAt },
      );
    if (excludeId) qb.andWhere('r.id != :excludeId', { excludeId });

    return qb.orderBy('r.startsAt', 'ASC').take(5).getMany();
  }
}
