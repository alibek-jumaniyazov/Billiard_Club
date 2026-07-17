import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { DataSource, Repository } from 'typeorm';
import { Club } from '../../entities/club.entity';
import { ClubStatus, UserRole } from '../../entities/enums';
import { Settings } from '../../entities/settings.entity';
import { User } from '../../entities/user.entity';
import { TelegramService } from '../../telegram/telegram.service';
import { AuthService, RequestContext } from '../auth/auth.service';
import { RegisterDto } from './dto/register.dto';

const TRIAL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class PublicService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly telegram: TelegramService,
    private readonly authService: AuthService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  /**
   * Landing sahifadan ro'yxatdan o'tish:
   * klub + admin + sozlamalar bitta tranzaksiyada, 7 kunlik sinov
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

    // Trial-farming himoyasi: bitta telefon raqamiga bitta sinov klubi
    const phoneUsed = await this.dataSource.getRepository(Club).findOne({
      where: { phone: dto.phone.trim() },
    });
    if (phoneUsed) {
      throw new ConflictException({ key: 'public.phoneAlreadyRegistered' });
    }

    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * DAY_MS);

    const { club, admin } = await this.dataSource.transaction(async (manager) => {
      const newClub = await manager.save(Club, {
        name: dto.clubName.trim(),
        ownerName: dto.ownerName.trim(),
        phone: dto.phone.trim(),
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

    void this.telegram.notify(
      [
        '🆕 <b>Yangi sinov foydalanuvchi ro\'yxatdan o\'tdi!</b>',
        '',
        `🏢 Klub: <b>${this.escapeHtml(club.name)}</b>`,
        `👤 Egasi: ${this.escapeHtml(club.ownerName ?? '-')}`,
        `📞 Telefon: ${this.escapeHtml(club.phone ?? '-')}`,
        `📍 Manzil: ${this.escapeHtml(club.address ?? '-')}`,
        `🔑 Login: <code>${this.escapeHtml(admin.username)}</code>`,
        `⏳ Sinov tugaydi: ${trialEndsAt.toLocaleDateString('uz-UZ')} (${TRIAL_DAYS} kun)`,
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
