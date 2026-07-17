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
    if (
      dto.timezone !== undefined &&
      !(SUPPORTED_TIMEZONES as readonly string[]).includes(dto.timezone)
    ) {
      throw new BadRequestException({ key: 'settings.invalidTimezone' });
    }

    const settings = await this.get(clubId);
    if (!settings) throw new NotFoundException({ key: 'subscription.clubNotFound' });
    Object.assign(settings, {
      ...(dto.clubName !== undefined ? { clubName: dto.clubName } : {}),
      ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
      ...(dto.address !== undefined ? { address: dto.address } : {}),
      ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
      ...(dto.currencySymbol !== undefined ? { currencySymbol: dto.currencySymbol } : {}),
      ...(dto.defaultTablePrice !== undefined ? { defaultTablePrice: dto.defaultTablePrice } : {}),
      ...(dto.workingHoursStart !== undefined ? { workingHoursStart: dto.workingHoursStart } : {}),
      ...(dto.workingHoursEnd !== undefined ? { workingHoursEnd: dto.workingHoursEnd } : {}),
      ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
    });
    return this.settingsRepo.save(settings);
  }
}
