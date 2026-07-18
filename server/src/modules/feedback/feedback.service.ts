import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { createReadStream, promises as fs, ReadStream } from 'fs';
import { extname, join, resolve, sep } from 'path';
import { Language } from '../../common/decorators/lang.decorator';
import { t } from '../../common/i18n/messages';
import { Club } from '../../entities/club.entity';
import { ClubNotification } from '../../entities/club-notification.entity';
import { FeedbackStatus } from '../../entities/enums';
import { Feedback } from '../../entities/feedback.entity';
import { User } from '../../entities/user.entity';
import { TelegramService } from '../../telegram/telegram.service';
import {
  AdminListFeedbackQueryDto,
  CreateFeedbackDto,
  ListFeedbackQueryDto,
  ReplyFeedbackDto,
  UpdateFeedbackStatusDto,
} from './dto/feedback.dto';

/** Biriktirma cheklovlari */
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_KB = 500;
const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_KB * 1024;

/** Ruxsat etilgan rasm turlari: mime -> fayl kengaytmasi */
const ALLOWED_IMAGE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/** data:image/...;base64,<payload> ko'rinishini qattiq tekshiradi */
const DATA_URL_RE = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/;

/** Fayl kengaytmasi -> Content-Type (oqim javobi uchun) */
const EXT_CONTENT_TYPE: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};

/**
 * uploads papkasi — server ishga tushirilgan katalogdan (server/).
 * DIQQAT: bu papka statik tarqatilMAYdi — fayllar faqat quyidagi
 * getAttachment* metodlari orqali (auth + tenant tekshiruvi bilan) beriladi.
 */
const UPLOADS_ROOT = join(process.cwd(), 'uploads');

/**
 * Fikr-mulohaza markazi:
 *  - klub tomoni: yuborish (rasm biriktirish bilan) va o'z fikrlarini ko'rish;
 *  - superadmin tomoni: ro'yxat, holat boshqaruvi, javob yozish.
 * Javob yozilganda klubga ClubNotification yaratiladi va yangi fikr
 * kelganda Telegram orqali platforma egasiga xabar boradi.
 */
@Injectable()
export class FeedbackService {
  constructor(
    @InjectRepository(Feedback) private readonly feedbackRepo: Repository<Feedback>,
    @InjectRepository(Club) private readonly clubRepo: Repository<Club>,
    @InjectRepository(ClubNotification)
    private readonly notificationRepo: Repository<ClubNotification>,
    private readonly telegram: TelegramService,
  ) {}

  // ==================== Klub tomoni ====================

  /**
   * Yangi fikr yuborish. @SkipSubscription tufayli request.clubId
   * o'rnatilmaydi — klub konteksti foydalanuvchining o'zidan olinadi
   * (bloklangan/muddat tugagan klub egasi ham shikoyat qila olishi uchun).
   */
  async create(user: User, dto: CreateFeedbackDto): Promise<Feedback> {
    if (!user.clubId) {
      throw new ForbiddenException({ key: 'subscription.clubContextRequired' });
    }

    // Avval barcha biriktirmalar tekshiriladi — xato bo'lsa hech narsa yozilmaydi
    const files = this.decodeAttachments(dto.attachments);

    const club = await this.clubRepo.findOne({ where: { id: user.clubId } });
    if (!club) throw new NotFoundException({ key: 'subscription.clubNotFound' });

    const saved = await this.feedbackRepo.save(
      this.feedbackRepo.create({
        clubId: user.clubId,
        userId: user.id,
        type: dto.type,
        priority: dto.priority,
        category: dto.category ?? null,
        subject: dto.subject,
        message: dto.message,
        attachments: null,
      }),
    );

    if (files.length > 0) {
      try {
        const dir = join(UPLOADS_ROOT, 'feedback', String(saved.id));
        await fs.mkdir(dir, { recursive: true });
        const paths: string[] = [];
        for (let i = 0; i < files.length; i++) {
          // Taxmin qilib bo'lmaydigan nom — ketma-ket 1.png, 2.png emas.
          // Manba — jsonb'dagi nisbiy yo'l; API biriktirmani massiv
          // indeksi orqali topadi, shuning uchun eski yozuvlar ham ishlaydi.
          const fileName = `${randomUUID()}.${files[i].ext}`;
          await fs.writeFile(join(dir, fileName), files[i].buffer);
          paths.push(`uploads/feedback/${saved.id}/${fileName}`);
        }
        saved.attachments = paths;
        await this.feedbackRepo.update(saved.id, { attachments: paths });
      } catch (err) {
        // Fayl yozilmasa — chala yozuv qolmasin
        await this.feedbackRepo.delete(saved.id);
        throw err;
      }
    }

    // Platforma egasiga Telegram xabari — fire-and-forget: javob Telegram
    // aylanishini KUTMAYDI (boshqa barcha chaqiruvchilar kabi). Xatolar
    // telegram servisi ichida yutiladi; send() da 5s timeout bor.
    void this.telegram.notifyFeedback(saved, club, user);

    return saved;
  }

  /** O'z klubining fikrlari (javoblar bilan birga), sahifalangan */
  async findForClub(user: User, query: ListFeedbackQueryDto) {
    if (!user.clubId) {
      throw new ForbiddenException({ key: 'subscription.clubContextRequired' });
    }
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    const [rows, total] = await this.feedbackRepo.findAndCount({
      where: { clubId: user.clubId },
      relations: { user: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: rows,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  /**
   * Biriktirilgan rasm oqimi — klub tomoni. Tenant izolyatsiyasi:
   * fikr faqat foydalanuvchining o'z klubiga tegishli bo'lsa beriladi
   * (aks holda mavjudligi ham oshkor qilinmaydi — 404).
   */
  async getAttachmentForClub(
    user: User,
    id: number,
    index: number,
  ): Promise<{ stream: ReadStream; contentType: string }> {
    if (!user.clubId) {
      throw new ForbiddenException({ key: 'subscription.clubContextRequired' });
    }
    const feedback = await this.feedbackRepo.findOne({
      where: { id, clubId: user.clubId },
    });
    if (!feedback) throw new NotFoundException({ key: 'feedback.notFound' });
    return this.openAttachment(feedback, index);
  }

  // ==================== Superadmin tomoni ====================

  async adminFindAll(query: AdminListFeedbackQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    const qb = this.feedbackRepo
      .createQueryBuilder('feedback')
      .leftJoinAndSelect('feedback.club', 'club')
      .leftJoinAndSelect('feedback.user', 'user');

    if (query.status) qb.andWhere('feedback.status = :status', { status: query.status });
    if (query.type) qb.andWhere('feedback.type = :type', { type: query.type });
    if (query.clubId) qb.andWhere('feedback.clubId = :clubId', { clubId: query.clubId });

    const [rows, total] = await qb
      .orderBy('feedback.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: rows,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  /** Bitta fikr — ochilganda unread -> read ga avtomatik o'tadi */
  async adminFindOne(id: number): Promise<Feedback> {
    const feedback = await this.feedbackRepo.findOne({
      where: { id },
      relations: { club: true, user: true, repliedBy: true },
    });
    if (!feedback) throw new NotFoundException({ key: 'feedback.notFound' });

    if (feedback.status === FeedbackStatus.UNREAD) {
      feedback.status = FeedbackStatus.READ;
      await this.feedbackRepo.update(id, { status: FeedbackStatus.READ });
    }
    return feedback;
  }

  /** Biriktirilgan rasm oqimi — superadmin istalgan klub fikrini ko'radi */
  async getAttachmentForAdmin(
    id: number,
    index: number,
  ): Promise<{ stream: ReadStream; contentType: string }> {
    const feedback = await this.feedbackRepo.findOne({ where: { id } });
    if (!feedback) throw new NotFoundException({ key: 'feedback.notFound' });
    return this.openAttachment(feedback, index);
  }

  /** Holatni aniq o'zgartirish — resolved/rejected faqat shu yerdan */
  async updateStatus(id: number, dto: UpdateFeedbackStatusDto): Promise<Feedback> {
    const feedback = await this.feedbackRepo.findOne({ where: { id } });
    if (!feedback) throw new NotFoundException({ key: 'feedback.notFound' });

    feedback.status = dto.status;
    return this.feedbackRepo.save(feedback);
  }

  /**
   * Superadmin javobi:
   *  - reply/repliedBy/repliedAt saqlanadi;
   *  - holat FAQAT unread -> read ga o'tadi ('resolved' — alohida, aniq
   *    holat o'zgartirish orqali);
   *  - klubga ClubNotification yaratiladi (egasi javobni panelida ko'radi).
   */
  async reply(admin: User, id: number, dto: ReplyFeedbackDto, lang: Language): Promise<Feedback> {
    const feedback = await this.feedbackRepo.findOne({ where: { id } });
    if (!feedback) throw new NotFoundException({ key: 'feedback.notFound' });

    feedback.reply = dto.reply;
    feedback.repliedById = admin.id;
    feedback.repliedAt = new Date();
    if (feedback.status === FeedbackStatus.UNREAD) {
      feedback.status = FeedbackStatus.READ;
    }
    const saved = await this.feedbackRepo.save(feedback);

    // Sarlavha ustuni varchar(200) — mavzu uzun bo'lsa qirqiladi
    const title = t(lang, 'feedback.replyNotificationTitle', {
      subject: feedback.subject,
    }).slice(0, 200);

    await this.notificationRepo.save(
      this.notificationRepo.create({
        clubId: feedback.clubId,
        title,
        body: dto.reply,
        type: 'info',
        createdById: admin.id,
      }),
    );

    return saved;
  }

  // ==================== Yordamchilar ====================

  /**
   * attachments[index] faylini o'qish oqimiga aylantiradi.
   * Indeks chegaradan tashqarida yoki fayl diskda yo'q bo'lsa — 404.
   */
  private async openAttachment(
    feedback: Feedback,
    index: number,
  ): Promise<{ stream: ReadStream; contentType: string }> {
    const relPath = feedback.attachments?.[index];
    if (!relPath) throw new NotFoundException({ key: 'feedback.attachmentNotFound' });

    // Yo'l serverning o'zi tomonidan yozilgan, lekin himoya qatlami sifatida
    // uploads papkasidan tashqariga chiqishga baribir yo'l qo'yilmaydi
    const absPath = resolve(process.cwd(), relPath);
    if (!absPath.startsWith(UPLOADS_ROOT + sep)) {
      throw new NotFoundException({ key: 'feedback.attachmentNotFound' });
    }

    try {
      await fs.access(absPath);
    } catch {
      throw new NotFoundException({ key: 'feedback.attachmentNotFound' });
    }

    const ext = extname(absPath).slice(1).toLowerCase();
    return {
      stream: createReadStream(absPath),
      contentType: EXT_CONTENT_TYPE[ext] ?? 'application/octet-stream',
    };
  }

  /** base64 data-URL larni tekshirib, fayl buferlariga aylantiradi */
  private decodeAttachments(attachments?: string[]): { buffer: Buffer; ext: string }[] {
    if (!attachments || attachments.length === 0) return [];
    if (attachments.length > MAX_ATTACHMENTS) {
      throw new BadRequestException({
        key: 'feedback.tooManyAttachments',
        args: { max: MAX_ATTACHMENTS },
      });
    }

    return attachments.map((dataUrl) => {
      const match = DATA_URL_RE.exec(dataUrl);
      if (!match) throw new BadRequestException({ key: 'feedback.invalidAttachment' });

      const ext = ALLOWED_IMAGE_EXT[match[1]];
      const buffer = Buffer.from(match[2], 'base64');
      if (!ext || buffer.length === 0) {
        throw new BadRequestException({ key: 'feedback.invalidAttachment' });
      }
      if (buffer.length > MAX_ATTACHMENT_BYTES) {
        throw new BadRequestException({
          key: 'feedback.attachmentTooLarge',
          args: { max: MAX_ATTACHMENT_KB },
        });
      }
      return { buffer, ext };
    });
  }
}
