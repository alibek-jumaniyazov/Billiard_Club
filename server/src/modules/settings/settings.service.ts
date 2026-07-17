import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Settings } from '../../entities/settings.entity';
import { UpdateSettingsDto } from './dto/settings.dto';

@Injectable()
export class SettingsService {
  constructor(@InjectRepository(Settings) private readonly settingsRepo: Repository<Settings>) {}

  /** Har klub uchun bitta yozuv — bo'lmasa yaratiladi (DB unique indeks himoyasida) */
  async get(clubId: number) {
    let settings = await this.settingsRepo.findOne({ where: { clubId } });
    if (!settings) {
      try {
        settings = await this.settingsRepo.save({ clubId });
      } catch {
        // Parallel so'rov yaratib ulgurgan bo'lsa — qayta o'qiymiz
        settings = await this.settingsRepo.findOne({ where: { clubId } });
      }
    }
    return settings;
  }

  async update(clubId: number, dto: UpdateSettingsDto) {
    const settings = await this.get(clubId);
    Object.assign(settings!, {
      ...(dto.clubName !== undefined ? { clubName: dto.clubName } : {}),
      ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
      ...(dto.address !== undefined ? { address: dto.address } : {}),
      ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
      ...(dto.currencySymbol !== undefined ? { currencySymbol: dto.currencySymbol } : {}),
      ...(dto.defaultTablePrice !== undefined ? { defaultTablePrice: dto.defaultTablePrice } : {}),
      ...(dto.workingHoursStart !== undefined ? { workingHoursStart: dto.workingHoursStart } : {}),
      ...(dto.workingHoursEnd !== undefined ? { workingHoursEnd: dto.workingHoursEnd } : {}),
    });
    return this.settingsRepo.save(settings!);
  }
}
