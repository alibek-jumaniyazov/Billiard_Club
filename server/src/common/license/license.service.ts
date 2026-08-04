import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Club } from '../../entities/club.entity';
import { ClubStatus } from '../../entities/enums';

/**
 * OFLAYN OBUNA RUXSATNOMASI (litsenziya).
 *
 * MUAMMO. Obuna serverda tekshiriladi (SubscriptionGuard). Internet uzilganda
 * esa server umuman so'ralmaydi — klient keshdagi `club.isExpired` ni ko'radi
 * va u KESHLASH PAYTIDAGI qiymat. Ya'ni muddati bugun tugaydigan klub
 * internetni uzib qo'yib, cheksiz ishlashda davom eta olardi.
 *
 * YECHIM. Server har bir javobda klubga qisqa muddatli, IMZOLANGAN ruxsatnoma
 * beradi: "klub N, muddat 2026-09-01 gacha". Klient uni saqlaydi va OFLAYN
 * holatda imzoni ochiq kalit bilan tekshirib, muddatni o'zi nazorat qiladi.
 *
 * NEGA ASIMMETRIK (ECDSA P-256, ES256):
 *  - Klient FAQAT tekshira oladi, imzolay OLMAYDI. Simmetrik (HMAC) sxemada
 *    kalit klientda bo'lardi va uni ochib olgan odam o'ziga xohlagan muddatli
 *    ruxsatnoma yozib olardi.
 *  - P-256 + SHA-256 — brauzer WebCrypto da o'n yildan beri qo'llab-quvvatlanadi
 *    (Ed25519 ancha yangi va eski Chromium'da yo'q; qobiq Electron 33 =
 *    Chromium 130 bilan ketadi).
 *  - Imzo IEEE P1363 (r||s, 64 bayt) formatida — WebCrypto AYNAN shuni kutadi,
 *    Node ning standart DER formatini u qabul qilmaydi.
 *
 * QOLDIQ XAVF (ochiq aytilgan): klient kodi baribir klient mashinasida
 * ishlaydi. Juda tayyorgarlikli hujumchi bundle ni almashtirib tekshiruvni
 * butunlay olib tashlashi mumkin. Buni qobiq ham to'liq to'sa olmaydi.
 * Ammo BUZILMAYDIGAN himoya boshqa joyda: oflaynda yozilgan amallar aloqa
 * tiklanganda serverga yuboriladi va SubscriptionGuard muddati tugagan klubni
 * o'sha yerda rad etadi. Ya'ni "oflaynda ishlab olingan" pul hech qachon
 * haqiqiy yozuvga aylanmaydi.
 */

/** Ruxsatnomaning yashash muddati — klient shundan keyin yangisini kutadi */
const LICENSE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface SignedLicense {
  /** base64url(JSON) — LicensePayload */
  payload: string;
  /** base64url(64 bayt r||s) */
  signature: string;
  /** Imzo algoritmi — klient qaysi sxemani kutishini bilsin */
  alg: 'ES256';
}

interface LicensePayload {
  clubId: number;
  status: ClubStatus;
  /** Obuna tugash sanasi (ISO) yoki null — cheklovsiz */
  endsAt: string | null;
  /** Server vaqti — klientning monoton soat langari uchun */
  issuedAt: string;
  /** Ruxsatnomaning o'zi eskirmasligi uchun */
  expiresAt: string;
}

const b64url = (buf: Buffer): string => buf.toString('base64url');

@Injectable()
export class LicenseService implements OnModuleInit {
  private readonly logger = new Logger(LicenseService.name);
  private privateKey: crypto.KeyObject | null = null;
  private publicKeySpki = '';

  onModuleInit(): void {
    this.loadOrCreateKey();
  }

  /** Klient tekshirish uchun oladigan ochiq kalit (SPKI DER, base64) */
  publicKey(): { publicKey: string; alg: 'ES256' } {
    return { publicKey: this.publicKeySpki, alg: 'ES256' };
  }

  /**
   * Klub uchun ruxsatnoma. Klub yo'q bo'lsa (superadmin) — null:
   * superadmin obunaga bog'liq emas va oflayn blok unga tegishli emas.
   */
  issue(club: Club | null): SignedLicense | null {
    if (!club || !this.privateKey) return null;

    const now = Date.now();
    const payload: LicensePayload = {
      clubId: club.id,
      status: club.status,
      // `effectiveEndsAt` — sinov va obuna muddatlaridan KEYINGISI
      // (club.entity.ts dagi getter). Klient boshqa hech narsani hisoblamaydi.
      endsAt: club.effectiveEndsAt ? new Date(club.effectiveEndsAt).toISOString() : null,
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + LICENSE_TTL_MS).toISOString(),
    };

    const encoded = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
    const signature = crypto.sign('sha256', Buffer.from(encoded, 'utf8'), {
      key: this.privateKey,
      // WebCrypto ECDSA aynan shu formatni kutadi (DER emas)
      dsaEncoding: 'ieee-p1363',
    });

    return { payload: encoded, signature: b64url(signature), alg: 'ES256' };
  }

  /* ------------------------------------------------------------- Kalit */

  private keyFilePath(): string {
    return (
      process.env.LICENSE_KEY_FILE ||
      path.join(process.cwd(), 'uploads', 'license-key.pem')
    );
  }

  /**
   * Kalitni topish tartibi:
   *  1. `LICENSE_PRIVATE_KEY` muhit o'zgaruvchisi (PEM, PKCS8)
   *  2. Diskdagi fayl (`LICENSE_KEY_FILE` yoki <server>/uploads/license-key.pem)
   *  3. Yangi kalit yaratiladi va SHU faylga yoziladi
   *
   * NEGA FAYLGA YOZILADI: kalit har ishga tushishda yangidan yaratilsa,
   * server qayta yuklangan zahoti hamma klublarning saqlangan ruxsatnomalari
   * yaroqsiz bo'lib qolardi — va aynan shu paytda internet yo'q klub
   * noo'rin bloklanardi.
   *
   * BIR NECHTA NUSXADA (bir nechta server) ishlatilsa — `LICENSE_PRIVATE_KEY`
   * ni ochiq belgilash SHART, aks holda har nusxa o'z kalitini yaratadi va
   * bir nusxa bergan ruxsatnomani klient boshqasining kaliti bilan tekshirib,
   * rad etardi.
   */
  private loadOrCreateKey(): void {
    try {
      const fromEnv = (process.env.LICENSE_PRIVATE_KEY || '').trim();
      if (fromEnv) {
        this.setKey(crypto.createPrivateKey(fromEnv.replace(/\\n/g, '\n')));
        this.logger.log("Litsenziya kaliti muhit o'zgaruvchisidan olindi");
        return;
      }

      const file = this.keyFilePath();
      if (fs.existsSync(file)) {
        this.setKey(crypto.createPrivateKey(fs.readFileSync(file, 'utf8')));
        return;
      }

      const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
      fs.mkdirSync(path.dirname(file), { recursive: true });
      // 0600 — kalitni faqat server jarayoni o'qiy olsin (Windows da e'tiborsiz
      // qoldiriladi, POSIX da muhim)
      fs.writeFileSync(file, pem, { encoding: 'utf8', mode: 0o600 });
      this.setKey(privateKey);
      this.logger.log(`Litsenziya kaliti yaratildi: ${file}`);
    } catch (err) {
      // Kalit bo'lmasa ruxsatnoma berilmaydi. Bu FALOKAT EMAS: onlayn ishlash
      // avvalgidek davom etadi (server tekshiruvi o'z joyida), faqat oflayn
      // muddat nazorati o'chadi. Shuning uchun error darajasida log.
      this.logger.error(`Litsenziya kalitini tayyorlab bo'lmadi: ${(err as Error).message}`);
      this.privateKey = null;
    }
  }

  private setKey(privateKey: crypto.KeyObject): void {
    this.privateKey = privateKey;
    this.publicKeySpki = crypto
      .createPublicKey(privateKey)
      .export({ type: 'spki', format: 'der' })
      .toString('base64');
  }
}
