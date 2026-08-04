import { Controller, Get, Header, NotFoundException, Param, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { ReleasePlatform } from '../../entities/enums';
import { CHANNEL_FILE, ReleasesService, toPublicRelease } from './releases.service';

/** Kanal fayli nomi -> platforma (electron-updater so'rovini tanish uchun) */
const FILE_TO_PLATFORM = new Map<string, ReleasePlatform>(
  Object.entries(CHANNEL_FILE).map(([platform, file]) => [file, platform as ReleasePlatform]),
);

/**
 * Desktop dasturni yuklab olish va avtomatik yangilash — OMMAVIY yo'llar.
 *
 * Ikki xil iste'molchi bor va ular ATAYLAB ajratilgan:
 *
 *  1. ODAM — /download sahifasi. `GET /api/public/download` metama'lumot
 *     beradi (versiya, hajm, sana, o'zgarishlar), `GET /api/public/download/:platform`
 *     esa faylni "saqlash" oynasi bilan beradi va hisoblagichni oshiradi.
 *
 *  2. DASTUR — electron-updater. U `GET /api/public/updates/latest.yml` ni
 *     so'raydi, ichidagi versiyani o'zinikiga solishtiradi va kerak bo'lsa
 *     o'sha yerdagi `url` ni yuklab oladi. Hisoblagich bu yerda OSHMAYDI:
 *     aks holda "yuklab olishlar" soni har soatlik avtomatik tekshiruvdan
 *     shishib, haqiqiy o'rnatishlar sonini ko'rsatmay qolardi.
 */
@Public()
@Controller('public')
export class PublicReleasesController {
  constructor(private readonly releases: ReleasesService) {}

  /** /download sahifasi uchun: har bir platformaning so'nggi relizi */
  @Get('download')
  async list() {
    const rows = await this.releases.latestAll();
    return { success: true, data: rows.map(toPublicRelease) };
  }

  /** Odam yuklab oladigan yo'l — "Saqlash" oynasi va hisoblagich bilan */
  @Get('download/:platform')
  async download(@Param('platform') platform: string, @Res() res: Response) {
    if (!Object.values(ReleasePlatform).includes(platform as ReleasePlatform)) {
      throw new NotFoundException({ key: 'releases.notFound' });
    }
    const release = await this.releases.latest(platform as ReleasePlatform);
    if (!release) throw new NotFoundException({ key: 'releases.notFound' });

    const { absPath } = await this.releases.resolveFile(release.storedName);
    this.releases.countDownload(release.id);
    // res.download — Content-Disposition ni RFC 5987 bo'yicha kodlaydi
    // (nomda bo'sh joy yoki lotin bo'lmagan harf bo'lsa ham to'g'ri chiqadi)
    // va Range so'rovlarini qo'llab-quvvatlaydi (uzilgan yuklash davom etadi).
    res.download(absPath, release.fileName);
  }

  /**
   * electron-updater yo'li: kanal fayli (YAML) yoki binarning o'zi.
   *
   * Bitta marshrutda birlashtirilgan — alohida `latest.yml` marshruti va
   * `:file` marshruti yonma-yon turganda e'lon tartibi buzilsa `:file`
   * kanal faylini ham "ushlab" qolib, YAML o'rniga 404 qaytarardi.
   *
   * Chegara ODAM yo'lidan yumshoqroq: klubning hamma kompyuteri bitta tashqi
   * IP dan chiqadi va ular kuniga bir necha marta tekshiradi. Umuman
   * chegarasiz qoldirilmaydi — bu ochiq, autentifikatsiyasiz yo'l.
   */
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Header('Cache-Control', 'no-cache')
  @Get('updates/:file')
  async updates(@Param('file') file: string, @Res() res: Response) {
    const platform = FILE_TO_PLATFORM.get(file);
    if (platform) {
      const yml = await this.releases.channelYml(platform);
      // Reliz yo'q = "yangilanish yo'q". 404 aynan shu ma'noni beradi va
      // electron-updater uni jimgina, xatosiz qabul qiladi.
      if (!yml) throw new NotFoundException({ key: 'releases.notFound' });
      res.type('text/yaml').send(yml);
      return;
    }

    const { absPath } = await this.releases.resolveFile(file);
    res.sendFile(absPath);
  }
}
