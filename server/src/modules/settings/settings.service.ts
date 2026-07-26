import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Settings } from '../../entities/settings.entity';
import { UpdateSettingsDto } from './dto/settings.dto';
import { SUPPORTED_TIMEZONES } from './timezones';

@Injectable()
export class SettingsService {
  constructor(@InjectRepository(Settings) private readonly settingsRepo: Repository<Settings>) {}

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

  async update(clubId: number, dto: UpdateSettingsDto) {
    // Vaqt mintaqasi faqat ruxsat etilgan ro'yxatdan — noto'g'ri qiymat
    // dashboard/hisobot SQL "AT TIME ZONE" so'rovlarini buzadi
    if (dto.timezone != null && !(SUPPORTED_TIMEZONES as readonly string[]).includes(dto.timezone)) {
      throw new BadRequestException({ key: 'settings.invalidTimezone' });
    }

    const settings = await this.get(clubId);
    if (!settings) throw new NotFoundException({ key: 'subscription.clubNotFound' });
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
      ...(dto.workingHoursStart != null ? { workingHoursStart: dto.workingHoursStart } : {}),
      ...(dto.workingHoursEnd != null ? { workingHoursEnd: dto.workingHoursEnd } : {}),
      ...(dto.timezone != null ? { timezone: dto.timezone } : {}),
    });
    return this.settingsRepo.save(settings);
  }
}
