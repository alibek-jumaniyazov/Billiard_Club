import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditService } from '../../common/audit/audit.service';
import { OfflineMoment, OfflineStampDto, resolveOfflineAt } from '../../common/offline/offline-at';
import { clubTimezone, parseDateParts, zonedMidnight } from '../../common/time/club-day';
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

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 'YYYY-MM-DD' ni KLUB vaqt mintaqasidagi yarim tun sifatida o'qiydi
 * (expenses.service dagi bilan bir xil naqsh). Avval server-lokal yarim tun
 * olinardi: Docker'da UTC — tunda (00:00-05:00) yaratilgan bron noto'g'ri
 * kunga tushib, kun ro'yxatidan yo'qolardi.
 * To'liq ISO datetime ham qabul qilinadi (aniq on beriladi — o'zgarishsiz o'tadi).
 * endExclusive=true bo'lsa sana-kun keyingi kun boshiga suriladi ('to' yarim ochiq).
 */
const parseDateParam = (value: string, tz: string, endExclusive = false): Date => {
  const raw = value.trim();
  if (DATE_ONLY.test(raw)) {
    const { year, month, day } = parseDateParts(raw);
    return zonedMidnight(tz, year, month, endExclusive ? day + 1 : day);
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException({ key: 'reports.invalidRange' });
  }
  return date;
};

/** Bron vaqti klub mintaqasida 'DD.MM HH:mm' — xato xabari uchun */
const formatClubMoment = (tz: string, at: Date): string => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(at));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('day')}.${part('month')} ${part('hour')}:${part('minute')}`;
};

@Injectable()
export class ReservationsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Reservation) private readonly reservationRepo: Repository<Reservation>,
    // Global AuditModule — testlarda servis usiz ham ishga tushaveradi
    @Optional() private readonly auditService?: AuditService,
  ) {}

  async findAll(clubId: number, query: ListReservationsQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 50, 100);
    // Kun chegaralari klub mintaqasida — xarajatlar/hisobotlar bilan bir xil ta'rif
    const tz = await clubTimezone(this.dataSource, clubId);

    const qb = this.reservationRepo
      .createQueryBuilder('reservation')
      .leftJoinAndSelect('reservation.table', 'table')
      .leftJoinAndSelect('reservation.customer', 'customer')
      .where('reservation.clubId = :clubId', { clubId });

    if (query.status) qb.andWhere('reservation.status = :status', { status: query.status });
    if (query.tableId) qb.andWhere('reservation.tableId = :tableId', { tableId: query.tableId });
    if (query.from) {
      qb.andWhere('reservation.startsAt >= :from', { from: parseDateParam(query.from, tz) });
    }
    if (query.to) {
      qb.andWhere('reservation.startsAt < :to', { to: parseDateParam(query.to, tz, true) });
    }

    // startsAt UNIKAL EMAS (bronlar 19:00 kabi butun soatlarga to'planadi).
    // Klient kun ko'rinishini bir nechta OFFSET sahifasidan yig'adi, shu bois
    // saralash aniq bo'lishi shart: aks holda sahifa chegarasidagi bron
    // takrorlanib yoki tushib qolishi mumkin.
    const [rows, total] = await qb
      .orderBy('reservation.startsAt', 'ASC')
      .addOrderBy('reservation.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: rows,
      timezone: tz,
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
   *
   * OFLAYN BRON (`offlineAt` bor — navbatdan, aloqa tiklangach): kassir uni
   * kiritgan paytda boshqa kassalar nima qilganini KO'RMAGAN. Shuning uchun
   * to'qnashuv bu yerda ogohlantirish emas, RAD ETISH (422): ogohlantirish
   * navbat javobida hech kimga ko'rinmasdan yo'qolardi va bitta stolga ikki
   * mijoz jimgina yozilib qolardi. 422 navbatda "doimiy xato" — kassir
   * "Yuborilmagan amallar" oynasida aniq sababni ko'radi va hal qiladi.
   * 409 ATAYLAB ishlatilmaydi: klient navbati 409 ni "idempotentlik kaliti
   * band" deb tushunib, 20 marta behuda qayta urinardi.
   *
   * Stol qatori QULF ostida tekshiriladi — oflayn navbat va boshqa kassa bir
   * vaqtda shu stolga bron yozsa ham tekshiruv navbat bilan o'tadi.
   */
  async create(clubId: number, dto: CreateReservationDto) {
    const moment = resolveOfflineAt(dto.offlineAt);
    const startsAt = new Date(dto.startsAt);

    const { savedId, overlaps } = await this.dataSource.transaction(async (manager) => {
      const table = await manager.findOne(Table, {
        where: { id: dto.tableId, clubId, isActive: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!table) throw new NotFoundException({ key: 'tables.notFound' });

      let customer: Customer | null = null;
      if (dto.customerId) {
        customer = await manager.findOne(Customer, { where: { id: dto.customerId, clubId } });
        if (!customer) throw new NotFoundException({ key: 'customers.notFound' });
      }

      const found = await this.findOverlaps(
        manager,
        clubId,
        dto.tableId,
        startsAt,
        dto.durationMinutes ?? null,
      );
      if (moment.offline && found.length > 0) {
        throw await this.offlineConflict(clubId, found[0]);
      }

      const saved = await manager.save(Reservation, {
        clubId,
        tableId: dto.tableId,
        customerId: customer?.id ?? null,
        customerName: dto.customerName?.trim() || customer?.name || null,
        customerPhone: dto.customerPhone?.trim() || customer?.phone || null,
        startsAt,
        durationMinutes: dto.durationMinutes ?? null,
        status: ReservationStatus.PENDING,
        notes: dto.notes?.trim() || null,
        // Oflayn kiritilgan bron — yaratilgan vaqti HAQIQIY kiritilgan payt
        ...(moment.offline ? { createdAt: moment.at } : {}),
      });
      return { savedId: saved.id, overlaps: found };
    });

    this.auditClamp(clubId, 'reservation.create', savedId, dto, moment);
    const reservation = await this.findOne(clubId, savedId);
    return { reservation, overlaps };
  }

  /**
   * Bronni yangilash:
   * - status o'tishlari ALLOWED_TRANSITIONS bo'yicha tekshiriladi
   * - yakuniy holatdagi (cancelled/no_show) bronning maydonlari o'zgartirilmaydi
   * - vaqt/stol o'zgarsa to'qnashuv qayta tekshiriladi (ogohlantirish bilan)
   */
  async update(clubId: number, id: number, dto: UpdateReservationDto) {
    // Oflayn holat o'tishi (navbatdan): muhr oralig'i tekshiriladi, o'tish
    // qoidalari ONLAYN bilan bir xil — boshqa kassa bronni allaqachon bekor
    // qilgan bo'lsa "o'tirdi" 400 bilan rad etiladi va navbatda ko'rinadi
    const moment = resolveOfflineAt(dto.offlineAt);
    const reservation = await this.reservationRepo.findOne({ where: { id, clubId } });
    if (!reservation) throw new NotFoundException({ key: 'reservations.notFound' });

    if (dto.status != null && dto.status !== reservation.status) {
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

    // DIQQAT: @IsOptional() literal `null` ni ham o'tkazib yuboradi. NOT NULL
    // ustunlar (tableId/startsAt/status) uchun `!= null` ishlatiladi — aks holda
    // {"startsAt": null} bronni 1970-yilga ko'chirib qo'yardi. Nullable maydonlar
    // (customerName/customerPhone/notes/durationMinutes) `!== undefined` bo'yicha
    // qoladi — ular ataylab tozalanishi mumkin, faqat trim null-xavfsiz qilindi.
    if (dto.tableId != null && dto.tableId !== reservation.tableId) {
      const table = await this.dataSource
        .getRepository(Table)
        .findOne({ where: { id: dto.tableId, clubId, isActive: true } });
      if (!table) throw new NotFoundException({ key: 'tables.notFound' });
      reservation.tableId = dto.tableId;
    }
    if (dto.customerId != null) {
      const customer = await this.dataSource
        .getRepository(Customer)
        .findOne({ where: { id: dto.customerId, clubId } });
      if (!customer) throw new NotFoundException({ key: 'customers.notFound' });
      reservation.customerId = customer.id;
      if (dto.customerName === undefined && !reservation.customerName) {
        reservation.customerName = customer.name;
      }
    }
    if (dto.startsAt != null) reservation.startsAt = new Date(dto.startsAt);
    if (dto.durationMinutes !== undefined) reservation.durationMinutes = dto.durationMinutes ?? null;
    if (dto.customerName !== undefined) reservation.customerName = dto.customerName?.trim() || null;
    if (dto.customerPhone !== undefined)
      reservation.customerPhone = dto.customerPhone?.trim() || null;
    if (dto.notes !== undefined) reservation.notes = dto.notes?.trim() || null;
    if (dto.status != null) reservation.status = dto.status;

    // Oflayn vaqt/stol o'zgarishi — yaratishdagi kabi to'qnashuv SAQLASHDAN
    // OLDIN tekshiriladi va rad etiladi (ogohlantirish navbatda yo'qolardi)
    if (moment.offline && timingChanged) {
      const conflicts = await this.findOverlaps(
        this.dataSource.manager,
        clubId,
        reservation.tableId,
        reservation.startsAt,
        reservation.durationMinutes,
        id,
      );
      if (conflicts.length > 0) throw await this.offlineConflict(clubId, conflicts[0]);
    }

    await this.reservationRepo.save(reservation);

    const overlaps = timingChanged
      ? await this.findOverlaps(
          this.dataSource.manager,
          clubId,
          reservation.tableId,
          reservation.startsAt,
          reservation.durationMinutes,
          id,
        )
      : [];

    this.auditClamp(clubId, 'reservation.update', id, dto, moment);
    return { reservation: await this.findOne(clubId, id), overlaps };
  }

  /**
   * Bekor qilish — faqat kutilayotgan/tasdiqlangan bronlar uchun.
   *
   * OFLAYN bekor qilish (navbatdan) allaqachon bekor qilingan bronga kelsa —
   * xato emas: kassirning niyati (bron bekor) allaqachon bajarilgan, uni
   * navbatda "xato" qilib qoldirish faqat chalkashlik tug'dirardi. Onlayn
   * oqimda avvalgidek 400.
   */
  async cancel(clubId: number, id: number, dto: OfflineStampDto = {}) {
    const moment = resolveOfflineAt(dto.offlineAt);
    const reservation = await this.reservationRepo.findOne({ where: { id, clubId } });
    if (!reservation) throw new NotFoundException({ key: 'reservations.notFound' });
    if (moment.offline && reservation.status === ReservationStatus.CANCELLED) {
      return this.findOne(clubId, id);
    }
    if (
      reservation.status !== ReservationStatus.PENDING &&
      reservation.status !== ReservationStatus.CONFIRMED
    ) {
      throw new BadRequestException({ key: 'reservations.invalidTransition' });
    }
    reservation.status = ReservationStatus.CANCELLED;
    await this.reservationRepo.save(reservation);
    this.auditClamp(clubId, 'reservation.cancel', id, dto, moment);
    return this.findOne(clubId, id);
  }

  /**
   * Oflayn bron to'qnashuvi — aniq sabab bilan (qaysi vaqt, kimning broni),
   * kassir navbat oynasida nima bo'lganini darhol tushunsin.
   */
  private async offlineConflict(clubId: number, overlap: Reservation) {
    const tz = await clubTimezone(this.dataSource, clubId);
    return new UnprocessableEntityException({
      key: 'reservations.offlineConflict',
      args: {
        time: formatClubMoment(tz, overlap.startsAt),
        name: overlap.customerName?.trim() || '—',
      },
    });
  }

  /** Kesilgan oflayn muhr (kichik kelajak farqi) — kutilmagan holat, iz qoladi */
  private auditClamp(
    clubId: number,
    action: string,
    entityId: number,
    dto: OfflineStampDto,
    moment: OfflineMoment,
  ) {
    if (!moment.clamped) return;
    this.auditService?.log({
      action: `${action}.offline_time_clamped`,
      clubId,
      entity: 'reservation',
      entityId,
      meta: { requested: dto.offlineAt ?? null, applied: moment.at.toISOString() },
    });
  }

  /**
   * Xuddi shu stolda vaqti kesishadigan faol (pending/confirmed/seated) bronlar.
   * Oyna: [startsAt, startsAt + durationMinutes); davomiylik ko'rsatilmagan
   * bronlar uchun 60 daqiqa deb olinadi.
   */
  private async findOverlaps(
    manager: EntityManager,
    clubId: number,
    tableId: number,
    startsAt: Date,
    durationMinutes: number | null,
    excludeId?: number,
  ): Promise<Reservation[]> {
    const durMin = durationMinutes ?? DEFAULT_DURATION_MIN;
    const endAt = new Date(startsAt.getTime() + durMin * 60_000);

    // `manager` — yaratishda stol qulfi bilan BIR tranzaksiyada o'qish uchun
    const qb = manager
      .getRepository(Reservation)
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
