import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { DataSource, Repository } from 'typeorm';
import { Club } from '../../entities/club.entity';
import { ClubStatus, UserRole } from '../../entities/enums';
import { Plan } from '../../entities/plan.entity';
import { Settings } from '../../entities/settings.entity';
import { User } from '../../entities/user.entity';
import { PlatformConfigService } from '../../common/platform-config/platform-config.service';
import { TelegramService } from '../../telegram/telegram.service';
import { AuthService, RequestContext } from '../auth/auth.service';
import { RegisterDto } from './dto/register.dto';
import { TrialVerificationService } from './trial-verification.service';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class PublicService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly telegram: TelegramService,
    private readonly authService: AuthService,
    private readonly platformConfig: PlatformConfigService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Plan) private readonly planRepo: Repository<Plan>,
    private readonly trialVerification: TrialVerificationService,
  ) {}

  /**
   * Landing sahifa uchun faol tariflar katalogi — superadmin boshqaradigan
   * tariflarning aynan o'zi (autentifikatsiyasiz). Tartib SubscriptionService.plans()
   * bilan bir xil: avval sortOrder, so'ng narx bo'yicha o'sish tartibida.
   */
  async plans() {
    return this.planRepo.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', price: 'ASC' },
    });
  }

  /**
   * Landing sahifadan ro'yxatdan o'tish:
   * klub + admin + sozlamalar bitta tranzaksiyada. Sinov muddati
   * PLATFORMA SOZLAMASIDAN olinadi (superadmin panelida o'zgartiriladi) va
   * ro'yxatdan o'tgan PAYTdan boshlanadi. Sizga Telegram xabar ketadi,
   * foydalanuvchi darhol tizimga kiritiladi (avto-login).
   */
  async register(dto: RegisterDto, ctx: RequestContext) {
    // Honeypot: yashirin maydon to'ldirilgan bo'lsa — bot. Jimgina rad etamiz
    // (429 emas, 400 ham emas — botga muvaffaqiyat/xato farqini bildirmaymiz).
    if (dto.website && dto.website.trim().length > 0) {
      throw new ConflictException({ key: 'clubs.usernameTaken' });
    }

    const existing = await this.userRepo.findOne({ where: { username: dto.username } });
    if (existing) throw new ConflictException({ key: 'clubs.usernameTaken' });

    // Sinov muddati SUPERADMIN sozlamasidan (platform_settings) — ilgari u
    // shu faylda qat'iy 7 kun bo'lib yozilgan edi va uni o'zgartirish uchun
    // kodni tahrirlab, qayta deploy qilish kerak edi.
    const { trialDays } = await this.platformConfig.get();
    // Expensive password work happens before acquiring identity/club locks.
    const passwordHash = await bcrypt.hash(dto.password, 12);

    const { club, admin } = await this.dataSource.transaction(async (manager) => {
      const phone = await this.trialVerification.claim(
        manager, dto.trialVerificationId, dto.trialVerificationToken, dto.phone,
      );
      const trialEndsAt = new Date(Date.now() + trialDays * DAY_MS);
      const newClub = await manager.save(Club, {
        name: dto.clubName.trim(),
        ownerName: dto.ownerName.trim(),
        // Kanonik ko'rinish saqlanadi — keyingi ro'yxatdan o'tishlar aynan shu
        // kalit bo'yicha taqqoslanadi
        phone: `+${phone}`,
        address: dto.address.trim(),
        status: trialDays > 0 ? ClubStatus.TRIAL : ClubStatus.EXPIRED,
        trialEndsAt,
        notes: "Landing orqali o'zi ro'yxatdan o'tgan",
      });

      const newAdmin = await manager.save(User, {
        name: dto.ownerName.trim(),
        username: dto.username.trim(),
        password: passwordHash,
        role: UserRole.ADMIN,
        clubId: newClub.id,
        isActive: true,
      });

      await manager.save(Settings, {
        clubId: newClub.id,
        clubName: dto.clubName.trim(),
        phone: `+${phone}`,
        address: dto.address.trim(),
      });

      return { club: newClub, admin: newAdmin };
    });

    // Xabar mantig'i TelegramService.notifyNewTrial da YAGONA manba (avval bu
    // yerda takrorlanib, ikki nusxa bir-biridan uzoqlashib ketgan edi). Hodisa
    // o'chirib qo'yilgan bo'lsa metod ichida yuborilmaydi. Fire-and-forget.
    void this.telegram.notifyNewTrial(club, admin.username, trialDays);

    // Avto-login: login bilan bir xil yo'l — refresh sessiya saqlanadi,
    // cookie kontrollerda o'rnatiladi (aks holda 15 daqiqadan keyin chiqib ketardi)
    const tokens = await this.authService.issueTokens(admin, ctx);
    return {
      user: { ...admin, password: undefined },
      club: {
        id: club.id,
        name: club.name,
        status: club.status,
        trialEndsAt: club.trialEndsAt,
        subscriptionEndsAt: null,
        effectiveEndsAt: club.trialEndsAt,
        isExpired: !club.trialEndsAt || new Date(club.trialEndsAt).getTime() <= Date.now(),
      },
      ...tokens,
    };
  }
}
