import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as fs from 'fs';
import * as path from 'path';
import { ReleasesService } from './releases.service';

/** Vaqtinchalik fayl shundan uzoq yotsa — u tashlandiq */
const TMP_MAX_AGE_MS = 60 * 60 * 1000;

/**
 * Reliz yuklashdan qolgan tashlandiq vaqtinchalik fayllarni tozalaydi.
 *
 * NEGA KERAK. Nest da tartib shunday: guard -> INTERCEPTOR -> pipe -> handler.
 * Ya'ni multer faylni diskka `FileInterceptor` bosqichida, DTO validatsiyasi
 * (ValidationPipe) dan OLDIN yozadi. Versiya formati noto'g'ri bo'lsa so'rov
 * pipe da yiqiladi va servisdagi `finally` tozalashi UMUMAN ishga tushmaydi —
 * fayl `tmp` da abadiy qolib ketardi. 200 MB lik o'rnatgichlarda bir necha
 * xato urinish diskni to'ldirishga yetadi.
 *
 * Shu sababli tozalash ATAYLAB so'rov oqimidan tashqarida: u yuklash qanday
 * tugaganidan (xato, uzilish, server qulashi) qat'i nazar ishlaydi.
 *
 * 1 soat — chegara ataylab keng: sekin tarmoqdan kelayotgan HALI TUGAMAGAN
 * yuklash o'chirilib ketmasligi kerak.
 */
@Injectable()
export class ReleasesCleanupService {
  private readonly logger = new Logger(ReleasesCleanupService.name);

  @Cron('0 25 4 * * *')
  cleanupTmp(): void {
    const dir = ReleasesService.tmpDir();
    try {
      if (!fs.existsSync(dir)) return;
      const now = Date.now();
      let removed = 0;

      for (const name of fs.readdirSync(dir)) {
        const file = path.join(dir, name);
        try {
          const stat = fs.statSync(file);
          if (!stat.isFile()) continue;
          if (now - stat.mtimeMs < TMP_MAX_AGE_MS) continue;
          fs.rmSync(file, { force: true });
          removed += 1;
        } catch {
          // Bitta fayl o'chmasa (band, ruxsat yo'q) qolganlari tozalanaversin
        }
      }

      if (removed > 0) {
        this.logger.log(`Reliz vaqtinchalik fayllari tozalandi: ${removed} ta`);
      }
    } catch (err) {
      this.logger.error(`Reliz tmp tozalash xatosi: ${(err as Error).message}`);
    }
  }
}
