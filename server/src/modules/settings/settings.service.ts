import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { AuditService } from '../../common/audit/audit.service';
import { normalizeRoundingStep } from '../../common/money/table-rounding';
import { SessionStatus } from '../../entities/enums';
import { Session } from '../../entities/session.entity';
import { Settings } from '../../entities/settings.entity';
import { UpdateSettingsDto } from './dto/settings.dto';
import { SUPPORTED_TIMEZONES } from './timezones';

/** Sozlamani o'zgartirgan xodim — audit jurnali uchun */
export interface SettingsActor {
  id: number;
  role: string;
}

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(Settings) private readonly settingsRepo: Repository<Settings>,
    private readonly dataSource: DataSource,
    // Global AuditModule ulanmagan bo'lsa ham (testlar) servis ishlayveradi
    @Optional() private readonly auditService?: AuditService,
  ) {}

  /** Har klub uchun bitta yozuv — bo'lmasa yaratiladi (DB unique indeks himoyasida) */
  async get(clubId: number): Promise<Settings> {
    let settings = await this.settingsRepo.findOne({ where: { clubId } });
    if (!settings) {
      try {
        settings = await this.settingsRepo.save({ clubId });
      } catch (err) {
        // Parallel so'rov yaratib ulgurgan bo'lsa — qayta o'qiymiz;
        // baribir topilmasa xato boshqa sababdan — uni yutmaymiz
        settings = await this.settingsRepo.findOne({ where: { clubId } });
        if (!settings) throw err;
      }
    }
    return settings;
  }

  async update(clubId: number, dto: UpdateSettingsDto, actor?: SettingsActor) {
    // Vaqt mintaqasi faqat ruxsat etilgan ro'yxatdan — noto'g'ri qiymat
    // dashboard/hisobot SQL "AT TIME ZONE" so'rovlarini buzadi
    if (dto.timezone != null && !(SUPPORTED_TIMEZONES as readonly string[]).includes(dto.timezone)) {
      throw new BadRequestException({ key: 'settings.invalidTimezone' });
    }

    const settings = await this.get(clubId);
    if (!settings) throw new NotFoundException({ key: 'subscription.clubNotFound' });
    const previousStep = normalizeRoundingStep(settings.tableRoundingStep);
    // NOT NULL ustunlar `!= null` bilan tekshiriladi: @IsOptional() literal
    // `null` ni ham o'tkazadi va u ustunga yozilsa 23502 (not_null_violation)
    // bo'lardi. phone/address esa nullable — ular ataylab tozalanishi mumkin.
    Object.assign(settings, {
      ...(dto.clubName != null ? { clubName: dto.clubName } : {}),
      ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
      ...(dto.address !== undefined ? { address: dto.address } : {}),
      ...(dto.currency != null ? { currency: dto.currency } : {}),
      ...(dto.currencySymbol != null ? { currencySymbol: dto.currencySymbol } : {}),
      ...(dto.defaultTablePrice != null ? { defaultTablePrice: dto.defaultTablePrice } : {}),
      ...(dto.tableRoundingStep != null ? { tableRoundingStep: dto.tableRoundingStep } : {}),
      ...(dto.workingHoursStart != null ? { workingHoursStart: dto.workingHoursStart } : {}),
      ...(dto.workingHoursEnd != null ? { workingHoursEnd: dto.workingHoursEnd } : {}),
      ...(dto.timezone != null ? { timezone: dto.timezone } : {}),
    });
    const nextStep = normalizeRoundingStep(settings.tableRoundingStep);
    if (nextStep === previousStep) return this.settingsRepo.save(settings);

    /**
     * YAXLITLASH O'ZGARDI — sozlama va DAVOM ETAYOTGAN o'yinlar bitta
     * tranzaksiyada yangilanadi. Egasi "yoqdim" deganda stollardagi summa
     * darhol yaxlit ko'rinishi kerak; har o'yinda muhrlangan qadam esa barcha
     * kassalar va yakuniy hisob-kitob AYNAN bir xil summani ko'rishini
     * kafolatlaydi. Yakunlangan o'yinlar o'zgarmaydi (pul allaqachon olingan).
     */
    const { saved, affected } = await this.dataSource.transaction(async (manager) => {
      const row = await manager.save(Settings, settings);
      const result = await manager.update(
        Session,
        { clubId, status: In([SessionStatus.ACTIVE, SessionStatus.PAUSED]) },
        { roundingStep: nextStep },
      );
      return { saved: row, affected: result.affected ?? 0 };
    });

    // Pulga ta'sir qiladigan sozlama — kim, qachon, nimadan nimaga o'zgartirgani
    this.auditService?.log({
      action: 'settings.table_rounding',
      clubId,
      userId: actor?.id ?? null,
      actorRole: actor?.role ?? null,
      entity: 'settings',
      entityId: saved.id,
      meta: { from: previousStep, to: nextStep, runningSessions: affected },
    });
    return saved;
  }
}
