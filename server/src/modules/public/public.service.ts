import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { DataSource, In, Repository } from 'typeorm';
import { Club } from '../../entities/club.entity';
import { ClubStatus, UserRole } from '../../entities/enums';
import { Plan } from '../../entities/plan.entity';
import { Settings } from '../../entities/settings.entity';
import { User } from '../../entities/user.entity';
import { PlatformConfigService } from '../../common/platform-config/platform-config.service';
import { TelegramService } from '../../telegram/telegram.service';
import { AuthService, RequestContext } from '../auth/auth.service';
import { normalizePhone } from '../customers/customers.service';
import { RegisterDto } from './dto/register.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Sinov (trial) tekshiruvi uchun telefonning YAGONA kanonik ko'rinishi.
 *
 * DIQQAT: customers modulidagi normalizePhone ATAYLAB o'zgartirilmaydi — uning
 * natijasi uq_customers_club_phone indeksidagi SAQLANGAN kalit, uni qayta
 * ta'riflash mavjud mijoz telefonlarini ikkiga bo'lib yuborardi. Shu sababli
 * bu yerda alohida funksiya:
 *   - faqat raqamlar qoladi ('+998 90 123-45-67' -> '998901234567');
 *   - boshidagi xalqaro '00' prefiksi olib tashlanadi ('00998...' -> '998...');
 *   - 9 xonali lokal raqam '998' bilan to'ldiriladi ('901234567' -> '998901234567').
 * Raqam umuman bo'lmasa (masalan '-------') — null: bunday telefon bilan
 * ro'yxatdan o'tishga yo'l qo'yilmaydi (aks holda tekshiruv butunlay tashlab
 * ketilar va bitta odam cheksiz bepul sinov ochib olardi).
 */
const canonicalPhone = (value?: string | null): string | null => {
  const digits = (value ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const withoutIdd = digits.startsWith('00') ? digits.slice(2) : digits;
  if (!withoutIdd) return null;
  const national = withoutIdd.length === 9 ? `998${withoutIdd}` : withoutIdd;
  return national.slice(0, 20);
};

@Injectable()
export class PublicService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly telegram: TelegramService,
    private readonly authService: AuthService,
    private readonly platformConfig: PlatformConfigService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Plan) private readonly planRepo: Repository<Plan>,
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

    // Trial-farming himoyasi: bitta telefon raqamiga bitta sinov klubi.
    // Telefon KANONIK ko'rinishga keltiriladi — '+998901234567', '998901234567',
    // '00998901234567' va '90 123 45 67' bitta kalitga tushadi, aks holda xuddi
    // shu raqam qayta-qayta bepul sinov ochib olardi.
    const phone = canonicalPhone(dto.phone);
    if (!phone) {
      // Raqamsiz "telefon" ('-------') RegisterDto shablonidan o'tib ketadi,
      // lekin u bilan tekshiruvni bajarib bo'lmaydi — darhol rad etamiz
      throw new BadRequestException({ key: 'public.invalidPhone' });
    }

    // Eski yozuvlar normalizePhone ko'rinishida saqlangan ('+998...' yoki
    // '998...') — ular ham tekshiruvdan chetda qolmasligi uchun barcha
    // ehtimoliy variantlar bo'yicha qidiriladi
    const phoneVariants = Array.from(
      new Set([phone, `+${phone}`, normalizePhone(dto.phone) ?? phone]),
    );
    const phoneUsed = await this.dataSource.getRepository(Club).findOne({
      where: { phone: In(phoneVariants) },
    });
    if (phoneUsed) {
      throw new ConflictException({ key: 'public.phoneAlreadyRegistered' });
    }

    // Sinov muddati SUPERADMIN sozlamasidan (platform_settings) — ilgari u
    // shu faylda qat'iy 7 kun bo'lib yozilgan edi va uni o'zgartirish uchun
    // kodni tahrirlab, qayta deploy qilish kerak edi.
    const { trialDays } = await this.platformConfig.get();
    const trialEndsAt = new Date(Date.now() + trialDays * DAY_MS);

    const { club, admin } = await this.dataSource.transaction(async (manager) => {
      const newClub = await manager.save(Club, {
        name: dto.clubName.trim(),
        ownerName: dto.ownerName.trim(),
        // Kanonik ko'rinish saqlanadi — keyingi ro'yxatdan o'tishlar aynan shu
        // kalit bo'yicha taqqoslanadi
        phone,
        address: dto.address.trim(),
        status: ClubStatus.TRIAL,
        trialEndsAt,
        notes: "Landing orqali o'zi ro'yxatdan o'tgan",
      });

      const passwordHash = await bcrypt.hash(dto.password, 12);
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
        phone: dto.phone.trim(),
        address: dto.address.trim(),
      });

      return { club: newClub, admin: newAdmin };
    });

    // Hodisa nomi bilan: 'new_trial' o'chirib qo'yilgan bo'lsa xabar ketmaydi
    // (bir argumentli notify() sozlamani umuman tekshirmasdi)
    void this.telegram.notify(
      'new_trial',
      [
        '🆕 <b>Yangi sinov foydalanuvchi ro\'yxatdan o\'tdi!</b>',
        '',
        `🏢 Klub: <b>${this.escapeHtml(club.name)}</b>`,
        `👤 Egasi: ${this.escapeHtml(club.ownerName ?? '-')}`,
        `📞 Telefon: ${this.escapeHtml(club.phone ?? '-')}`,
        `📍 Manzil: ${this.escapeHtml(club.address ?? '-')}`,
        `🔑 Login: <code>${this.escapeHtml(admin.username)}</code>`,
        `⏳ Sinov tugaydi: ${trialEndsAt.toLocaleDateString('uz-UZ')} (${trialDays} kun)`,
      ].join('\n'),
    );

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
        isExpired: false,
      },
      ...tokens,
    };
  }

  private escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
