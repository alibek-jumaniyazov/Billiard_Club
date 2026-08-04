import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Repository } from 'typeorm';
import { AppRelease } from '../../entities/app-release.entity';
import { ReleasePlatform } from '../../entities/enums';
import { CreateReleaseDto } from './dto/releases.dto';

/** Multer yuklagan fayl — @types/multer qo'shmaslik uchun minimal shakl */
export interface UploadedFileLike {
  originalname: string;
  filename: string;
  path: string;
  size: number;
}

/**
 * Platforma boshiga ruxsat etilgan kengaytmalar.
 *
 * OQ RO'YXAT ataylab: kengaytma foydalanuvchidan (superadmin bo'lsa ham)
 * keladi va u diskdagi fayl nomiga tushadi. Ochiq qoldirilsa serverga
 * `.js`/`.sh` yuklab, uni public URL orqali tarqatish mumkin bo'lardi.
 */
const ALLOWED_EXT: Record<ReleasePlatform, string[]> = {
  [ReleasePlatform.WIN]: ['.exe', '.msi'],
  [ReleasePlatform.MAC]: ['.dmg', '.zip'],
  [ReleasePlatform.LINUX]: ['.appimage', '.deb', '.rpm'],
};

/** electron-updater qaysi platformada qaysi kanal faylini so'raydi */
export const CHANNEL_FILE: Record<ReleasePlatform, string> = {
  [ReleasePlatform.WIN]: 'latest.yml',
  [ReleasePlatform.MAC]: 'latest-mac.yml',
  [ReleasePlatform.LINUX]: 'latest-linux.yml',
};

/** Semver: "1.0.1" yoki "1.0.1-beta.2" */
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/**
 * Klientga ko'rinadigan shakl.
 *
 * `size` ATAYLAB songa aylantiriladi: TypeORM `bigint` ni SATR qilib qaytaradi
 * (64-bitli qiymat JS `number` ga sig'masligi mumkin degan ehtiyotkorlik
 * bilan) va u klientga shundayligicha borsa "3000000 bayt" ni MB ga aylantirish
 * `"3000000" / 1048576` bo'lib, NaN berardi. Fayl hajmi hech qachon 9 PB dan
 * oshmagani uchun bu yerda aylantirish xavfsiz.
 */
export const toPublicRelease = (r: AppRelease) => ({
  platform: r.platform,
  version: r.version,
  fileName: r.fileName,
  size: Number(r.size),
  sha512: r.sha512,
  notesUz: r.notesUz,
  notesRu: r.notesRu,
  publishedAt: r.publishedAt,
  url: `/api/public/download/${r.platform}`,
});

/** Superadmin ko'rinishi — nashr holati va statistika bilan */
export const toAdminRelease = (r: AppRelease) => ({
  ...toPublicRelease(r),
  id: r.id,
  storedName: r.storedName,
  isPublished: r.isPublished,
  downloads: r.downloads,
  uploadedById: r.uploadedById,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

@Injectable()
export class ReleasesService {
  private readonly logger = new Logger(ReleasesService.name);

  constructor(
    @InjectRepository(AppRelease) private readonly repo: Repository<AppRelease>,
  ) {}

  /** Relizlar saqlanadigan papka (RELEASES_DIR yoki <server>/uploads/releases) */
  static dir(): string {
    return process.env.RELEASES_DIR || path.join(process.cwd(), 'uploads', 'releases');
  }

  /** Multer vaqtinchalik fayllarni shu yerga yozadi */
  static tmpDir(): string {
    return path.join(ReleasesService.dir(), 'tmp');
  }

  static ensureDirs(): void {
    fs.mkdirSync(ReleasesService.tmpDir(), { recursive: true });
  }

  /* ------------------------------------------------------------- O'qish */

  /**
   * Platforma uchun eng so'nggi NASHR ETILGAN reliz.
   *
   * Tartib `publishedAt DESC` bo'yicha — versiya satri bo'yicha EMAS: "1.10.0"
   * satr sifatida "1.9.0" dan KICHIK va shunda eski reliz eng yangi deb
   * chiqib ketardi. Nashr vaqti esa har doim to'g'ri tartib beradi.
   */
  async latest(platform: ReleasePlatform): Promise<AppRelease | null> {
    return this.repo.findOne({
      where: { platform, isPublished: true },
      order: { publishedAt: 'DESC', id: 'DESC' },
    });
  }

  /** /download sahifasi uchun — har bir platformaning so'nggi relizi */
  async latestAll(): Promise<AppRelease[]> {
    const rows = await Promise.all(
      Object.values(ReleasePlatform).map((p) => this.latest(p)),
    );
    return rows.filter((r): r is AppRelease => r !== null);
  }

  /** Superadmin ro'yxati — nashr etilmaganlari ham */
  async list(): Promise<AppRelease[]> {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  /**
   * electron-updater uchun kanal fayli (YAML).
   *
   * Qo'lda yig'iladi — bitta kutubxona qo'shmaslik uchun. Xavfsiz, chunki
   * ichidagi barcha qiymatlar server nazoratida: `storedName` tozalangan
   * (faqat [a-z0-9._-]), `version` semver regexdan o'tgan, `sha512` base64.
   * Ya'ni YAML ga foydalanuvchi matni umuman tushmaydi.
   */
  async channelYml(platform: ReleasePlatform): Promise<string | null> {
    const release = await this.latest(platform);
    if (!release) return null;

    const releaseDate = (release.publishedAt ?? release.createdAt).toISOString();
    return [
      `version: ${release.version}`,
      `files:`,
      `  - url: ${release.storedName}`,
      `    sha512: ${release.sha512}`,
      `    size: ${release.size}`,
      `path: ${release.storedName}`,
      `sha512: ${release.sha512}`,
      `releaseDate: '${releaseDate}'`,
      '',
    ].join('\n');
  }

  /**
   * URL dagi fayl nomini diskdagi haqiqiy yo'lga aylantiradi.
   *
   * Nom BAZADAN qidiriladi, satr sifatida yo'lga yopishtirilmaydi — shuning
   * uchun `../../etc/passwd` kabi so'rov shunchaki "topilmadi" beradi
   * (path traversal imkonsiz).
   */
  async resolveFile(storedName: string): Promise<{ release: AppRelease; absPath: string }> {
    const release = await this.repo.findOne({ where: { storedName } });
    if (!release || !release.isPublished) throw new NotFoundException({ key: 'releases.notFound' });

    const absPath = path.join(ReleasesService.dir(), release.storedName);
    if (!fs.existsSync(absPath)) {
      // Baza va disk ajralib qolgan — buni jimgina 404 qilib yubormaymiz,
      // chunki bu sozlash xatosi (RELEASES_DIR o'zgargan, zaxiradan tiklashda
      // fayllar ko'chirilmagan) va u logda ko'rinishi kerak.
      this.logger.error(`Reliz fayli diskda yo'q: ${absPath}`);
      throw new NotFoundException({ key: 'releases.fileMissing' });
    }
    return { release, absPath };
  }

  /** Yuklab olishlar hisoblagichi — asosiy oqimni bloklamaydi */
  countDownload(id: number): void {
    void this.repo.increment({ id }, 'downloads', 1).catch((err) => {
      this.logger.warn(`Yuklab olishni hisoblab bo'lmadi (${id}): ${err}`);
    });
  }

  /* ------------------------------------------------------------ Yozish */

  async create(
    file: UploadedFileLike,
    dto: CreateReleaseDto,
    userId: number,
  ): Promise<AppRelease> {
    const tmpPath = file.path;
    try {
      if (!SEMVER_RE.test(dto.version)) {
        throw new BadRequestException({ key: 'releases.badVersion' });
      }

      const ext = path.extname(file.originalname).toLowerCase();
      if (!ALLOWED_EXT[dto.platform].includes(ext)) {
        throw new BadRequestException({
          key: 'releases.badExtension',
          args: { allowed: ALLOWED_EXT[dto.platform].join(', ') },
        });
      }

      const existing = await this.repo.findOne({
        where: { platform: dto.platform, version: dto.version },
      });
      if (existing) throw new BadRequestException({ key: 'releases.versionExists' });

      const storedName = `billiard-club-${dto.version}-${dto.platform}${ext}`;
      const finalPath = path.join(ReleasesService.dir(), storedName);
      if (fs.existsSync(finalPath)) throw new BadRequestException({ key: 'releases.versionExists' });

      const sha512 = await this.sha512Base64(tmpPath);
      // Ko'chirish EMAS, qayta nomlash: bitta fayl tizimi ichida atomik va
      // yuzlab megabaytni ikkinchi marta o'qimaydi.
      fs.renameSync(tmpPath, finalPath);

      const saved = await this.repo.save(
        this.repo.create({
          version: dto.version,
          platform: dto.platform,
          fileName: file.originalname,
          storedName,
          size: String(file.size),
          sha512,
          notesUz: dto.notesUz?.trim() || null,
          notesRu: dto.notesRu?.trim() || null,
          // Yuklashning O'ZI nashr qilmaydi: avval sinab ko'rish kerak.
          isPublished: false,
          publishedAt: null,
          uploadedById: userId,
        }),
      );
      return saved;
    } catch (err) {
      // Xato bo'lsa vaqtinchalik fayl diskda qolib ketmasin
      fs.rmSync(tmpPath, { force: true });
      throw err;
    }
  }

  async setPublished(id: number, isPublished: boolean): Promise<AppRelease> {
    const release = await this.repo.findOne({ where: { id } });
    if (!release) throw new NotFoundException({ key: 'releases.notFound' });

    release.isPublished = isPublished;
    // `publishedAt` FAQAT birinchi nashrda o'rnatiladi va keyin o'zgarmaydi:
    // u tartiblash kaliti (latest() shuni ishlatadi), qayta nashr qilish esa
    // eski relizni birdan "eng yangi" qilib qo'yardi.
    if (isPublished && !release.publishedAt) release.publishedAt = new Date();
    return this.repo.save(release);
  }

  async remove(id: number): Promise<void> {
    const release = await this.repo.findOne({ where: { id } });
    if (!release) throw new NotFoundException({ key: 'releases.notFound' });

    // Avval bazadan — shundan keyin hech kim faylni so'ray olmaydi. Teskari
    // tartibda fayl o'chib, baza yozuvi qolsa mijozlar 404 olaverardi.
    await this.repo.delete(id);
    fs.rmSync(path.join(ReleasesService.dir(), release.storedName), { force: true });
  }

  /** Faylning SHA-512 xesh summasi, base64 — electron-updater formati */
  private sha512Base64(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha512');
      const stream = fs.createReadStream(filePath);
      stream.on('error', reject);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('base64')));
    });
  }
}
