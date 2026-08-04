import { BRIDGE_ONLY_DRIVERS, LightDriver } from '../../../entities/enums';
import type { LightDeviceConfig } from '../../../entities/light-config.type';
import { buildDigestHeader, parseDigestChallenge } from './digest-auth';

/**
 * Chiroq relelari bilan ishlovchi past darajali drayverlar.
 *
 * Bu fayl DB ga ham, NestJS ga ham bog'liq emas — faqat "manzil + kanal" ni olib
 * relega HTTP so'rov yuboradi. Shuning uchun uni ham server (DIRECT rejim), ham
 * klubdagi lokal agent (BRIDGE rejim) bir xil ishlatishi mumkin.
 *
 * Barcha so'rovlar global fetch + AbortSignal.timeout bilan — osilib qolmaydi.
 * Xatolar bu yerda LOG qilinmaydi, chaqiruvchi qatlamga throw qilinadi
 * (LightsService ularni ushlab, tables."lightError" ga yozadi).
 */

/**
 * Drayverga xos sozlamalar turi (`tables."lightConfig"`).
 * E'lon `entities/light-config.type.ts` da — entity ↔ drayver aylanma importi
 * bo'lmasligi uchun; bu yerdan re-export qilinadi, ya'ni drayver shartnomasini
 * shu fayldan ham import qilish mumkin.
 */
export type { LightDeviceConfig };

/** Bitta rele uchun ulanish ma'lumotlari (stol yozuvidan yoki bridge javobidan) */
export interface LightTarget {
  driver: LightDriver;
  /** "192.168.1.51" yoki "192.168.1.51:8080" — driver='http' da null bo'lishi mumkin */
  host: string | null;
  /** Rele kanali, 0 dan boshlanadi */
  channel: number;
  /** NC (normally closed) rele — yuboriladigan qiymat teskarilanadi */
  inverted: boolean;
  /**
   * Autentifikatsiya ma'lumoti:
   * - shelly/tasmota/esphome — basic yoki digest uchun "user:parol"
   * - home_assistant — long-lived access token (Bearer sifatida yuboriladi)
   */
  auth: string | null;
  /** driver='http' uchun yoqish shabloni */
  onUrl: string | null;
  /** driver='http' uchun o'chirish shabloni */
  offUrl: string | null;
  /** Drayverga xos qo'shimcha sozlamalar (jsonb) — yo'q bo'lsa null */
  config: LightDeviceConfig | null;
}

/** Standart so'rov timeouti (ms) — lokal tarmoq uchun 3 soniya yetarli */
const DEFAULT_TIMEOUT_MS = 3000;

/**
 * Bitta buyruqda qo'llanadigan kanallarning eng ko'p soni:
 * asosiy `channel` + `config.channels` dan 8 tagacha (validatsiyada ham 8 ta chegara bor).
 */
const MAX_CHANNELS = 9;

/** `config.channels` elementi uchun ruxsat etilgan chegara */
const MAX_CHANNEL_INDEX = 32;

/** BRIDGE_ONLY drayverlarni tez tekshirish uchun to'plam */
const BRIDGE_ONLY_SET = new Set<LightDriver>(BRIDGE_ONLY_DRIVERS);

/** ESPHome switch obyekti nomi ('relay_1') — URL ga qo'yilishidan OLDIN tekshiriladi */
const ESPHOME_ENTITY_RE = /^[a-z0-9_]+$/;

/** Home Assistant entity id ('switch.stol_3') — URL ga qo'yilishidan OLDIN tekshiriladi */
const HA_ENTITY_ID_RE = /^[a-z_]+\.[a-z0-9_]+$/;

/**
 * Rele HTTP xatosi. `message` FOYDALANUVCHIGA ko'rinadi (tables."lightError"),
 * shuning uchun unga faqat status yoziladi. Qurilma javobining TANASI esa
 * alohida `body` maydonida — uni faqat server logiga chiqarish mumkin,
 * aks holda so'rov javobi panel orqali o'qib olinadigan bo'lib qolardi.
 */
export class LightHttpError extends Error {
  constructor(
    message: string,
    readonly body: string | null,
  ) {
    super(message);
    this.name = 'LightHttpError';
  }
}

/**
 * SOZLAMA xatosi: manzil/entity/shablon URL ko'rsatilmagan yoki drayver bu
 * rejimda ishlamaydi. ULANISH xatolaridan (HTTP status, ECONNREFUSED, timeout)
 * ATAYLAB ajratilgan:
 *  - ulanish sababi foydalanuvchiga KO'RSATILMAYDI — aks holda `lightError`
 *    javobi ochiq/yopiq/filtrlangan portni aniqlaydigan skaner vositasiga
 *    aylanardi (faqat server logiga yoziladi);
 *  - sozlama xatosi esa tushunarli qoladi, aks holda klub egasi o'z relesini
 *    sozlay olmaydi.
 */
export class LightConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LightConfigError';
  }
}

/**
 * IPv4 (portsiz) shakli — oktetlar qiymati alohida tekshiriladi.
 *
 * DIQQAT: boshida nol turgan oktet ATAYLAB rad etiladi ('010.010.010.010').
 * Sababi: JS `Number('010')` = 10 (o'nlik), lekin Node ning WHATWG `URL` i
 * xuddi shu oktetni SAKKIZLIK deb o'qiydi — '010.010.010.010' fetch paytida
 * 8.8.8.8 ga aylanadi. Ya'ni tekshirilgan manzil bilan so'rov ketadigan manzil
 * boshqa-boshqa bo'lib qolardi va lokal-IP filtri (SSRF himoyasi) chetlab
 * o'tilardi. Shaklni faqat O'NLIK ko'rinish bilan cheklash bu farqni yo'q qiladi.
 */
const IPV4_RE = /^(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/;

/** Hostname (portsiz): harf/raqam bilan boshlanadigan, nuqta bilan ajratilgan bo'laklar */
const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;

/**
 * Barcha bo'laklari raqamli manzil ('010.010.010.010', '8.8.8', '2130706433').
 * Bunday satr HOSTNAME_RE ga ham to'g'ri keladi — shuning uchun uni alohida
 * ushlab, IPv4 sifatida BAHOLAB rad etamiz: bu haqiqiy nom emas, IP yozishga
 * urinish, va uni "nom" deb qabul qilsak sakkizlik/o'nlik farqi qaytadi.
 */
const ALL_NUMERIC_HOST_RE = /^\d+(\.\d+)*$/;

/** Bitta HTTP so'rovining tavsifi (drayver bo'yicha yig'iladi) */
interface DeviceRequest {
  url: string;
  method: 'GET' | 'POST';
  /** So'rov tanasi (home_assistant uchun JSON) */
  body?: string;
  contentType?: string;
}

/**
 * Relega yoqish/o'chirish buyrug'ini yuboradi.
 * `on` — MANTIQIY holat (chiroq yonsinmi); inverted=true bo'lsa relega teskari
 * qiymat jo'natiladi. Javob res.ok bo'lmasa Error throw qilinadi.
 *
 * `config.channels` berilgan bo'lsa (bitta stolda bir nechta lampa) buyruq
 * asosiy `channel` dan boshlab har bir kanalga KETMA-KET yuboriladi —
 * bittasi xato bersa umumiy natija ham xato bo'ladi.
 */
export async function applyLight(
  target: LightTarget,
  on: boolean,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  // Bu drayverlar HTTP emas (MQTT/xom TCP/Modbus/COM-port) — bulutdagi server
  // klub tarmog'iga bunday ulana olmaydi, ular faqat lokal agentda bajariladi
  if (BRIDGE_ONLY_SET.has(target.driver)) {
    throw new LightConfigError('Bu drayver faqat lokal agent (bridge) rejimida ishlaydi');
  }

  // NC rele uchun mantiqiy holat fizik holatga teskari
  const physical = target.inverted ? !on : on;

  for (const channel of resolveChannels(target)) {
    const single = channel === target.channel ? target : { ...target, channel };
    await sendCommand(single, physical, timeoutMs);
  }
}

/**
 * Relening HAQIQIY holatini o'qish (mantiqiy qiymatda, inverted hisobga olingan).
 * O'qish majburiy emas: qurilma javob bermasa yoki formatni tushunmasak — null.
 *
 * Ko'p kanalli sozlamada faqat ASOSIY kanal o'qiladi — u stolning holatini
 * bildiradi (qolgan kanallar unga birga qo'llanadi).
 */
export async function readLight(
  target: LightTarget,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<boolean | null> {
  try {
    // Bridge drayverlarining holatini faqat agent o'qiy oladi
    if (BRIDGE_ONLY_SET.has(target.driver)) return null;

    const host = target.host?.trim();
    let physical: boolean | null = null;

    switch (target.driver) {
      case LightDriver.SHELLY_GEN1: {
        if (!host) return null;
        const data = await fetchJson(`http://${host}/relay/${target.channel}`, target, timeoutMs);
        const value = data?.['ison'];
        physical = typeof value === 'boolean' ? value : null;
        break;
      }
      case LightDriver.SHELLY_GEN2: {
        if (!host) return null;
        const url = `http://${host}/rpc/Switch.GetStatus?id=${target.channel}`;
        const data = await fetchJson(url, target, timeoutMs);
        const value = data?.['output'];
        physical = typeof value === 'boolean' ? value : null;
        break;
      }
      case LightDriver.TASMOTA: {
        if (!host) return null;
        const index = target.channel + 1;
        const data = await fetchJson(`http://${host}/cm?cmnd=Power${index}`, target, timeoutMs);
        // Ko'p kanalli qurilmada {"POWER2":"ON"}, bir kanallida {"POWER":"ON"}
        const value = data?.[`POWER${index}`] ?? data?.['POWER'];
        physical = typeof value === 'string' ? value.toUpperCase() === 'ON' : null;
        break;
      }
      case LightDriver.ESPHOME: {
        if (!host) return null;
        const entity = readEsphomeEntity(target.config);
        if (!entity) return null;
        const data = await fetchJson(`http://${host}/switch/${entity}`, target, timeoutMs);
        // ESPHome web server: {"state":"ON","value":true}
        const value = data?.['value'];
        if (typeof value === 'boolean') {
          physical = value;
        } else {
          physical = parseOnOff(data?.['state']);
        }
        break;
      }
      case LightDriver.HOME_ASSISTANT: {
        if (!host) return null;
        const entityId = readHaEntityId(target.config);
        if (!entityId) return null;
        const url = `http://${host}/api/states/${entityId}`;
        const data = await fetchJson(url, target, timeoutMs);
        // HA: {"state":"on"} | {"state":"off"} | {"state":"unavailable"}
        physical = parseOnOff(data?.['state']);
        break;
      }
      // driver='http' — ixtiyoriy shablon URL, holatni o'qishning yagona usuli yo'q
      default:
        return null;
    }

    if (physical === null) return null;
    return target.inverted ? !physical : physical;
  } catch {
    // O'qish majburiy emas — xato bo'lsa "noma'lum" deb qaytaramiz
    return null;
  }
}

/**
 * SSRF himoyasi: DIRECT rejimda server FAQAT lokal tarmoq manziliga chiqishi mumkin.
 * Ruxsat: 10.x, 172.16-31.x, 192.168.x — FAQAT raqamli IPv4.
 *
 * 127.x (loopback) ATAYLAB RUXSAT ETILMAYDI: rele hech qachon bulut serverining
 * o'zida turmaydi, lekin ruxsat berilsa klub admini `driver='http'` bilan
 * serverning O'Z portlariga so'rov yubortirib ichki xizmatlarni skanerlab olardi.
 *
 * Nom (hostname) ham ataylab RAD ETILADI: "localhost" ham, "shelly-abc.local" ham DNS/mDNS
 * orqali istalgan IP ga (jumladan tashqi manzilga) yechilishi mumkin, bu esa bulut
 * serverini ichki xizmatlarga so'rov yuborishga majburlash yo'lini ochadi.
 * Shu sababli DIRECT rejimda relega DHCP reservation orqali doimiy IP berilishi shart
 * (docs/LIGHT-CONTROL.md da shunday yozilgan). BRIDGE rejimida bu cheklov qo'llanmaydi —
 * u yerda so'rovni klub tarmog'idagi agentning o'zi yuboradi.
 *
 * DIQQAT: bu tekshiruv YAGONA emas — uning USTIGA operator ochgan CIDR ro'yxati
 * qo'shiladi (`isDirectAllowedHost`), chunki bulutli deployda serverning o'z
 * ichki xizmatlari ham aynan shu xususiy oraliqlarda turadi.
 */
export function isPrivateHost(host: string): boolean {
  const name = stripPort(host).toLowerCase();
  if (!name) return false;

  const match = IPV4_RE.exec(name);
  if (!match) return false;
  const octets = [match[1], match[2], match[3], match[4]].map((part) => Number(part));
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;

  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

/**
 * DIRECT rejimda ruxsat etilgan tarmoqlar (operator qo'yadigan muhit
 * o'zgaruvchisi `LIGHTS_DIRECT_ALLOWED_CIDRS`).
 *
 * STANDART QIYMAT — BO'SH, ya'ni operator ANIQ ruxsat bermaguncha DIRECT rejim
 * hech qanday manzilga chiqmaydi. Sababi: `isPrivateHost()` ning o'zi yetarli
 * emas — bulutli deployda (AWS/GCP/Hetzner VPC, Docker/K8s) serverning O'Z
 * PostgreSQL i, Redis i va ichki panellari AYNAN 10/8, 172.16/12, 192.168/16
 * oraliqlarida turadi, ya'ni "xususiy IP" belgisi ularni himoya qilmaydi.
 * BRIDGE rejimi (tavsiya etilgan yo'l) bu cheklovga umuman tegishli emas —
 * u yerda so'rovni klub tarmog'idagi agentning o'zi yuboradi.
 */
const DIRECT_ALLOWED_CIDRS_ENV = 'LIGHTS_DIRECT_ALLOWED_CIDRS';

/** Bitta CIDR: tarmoq manzili va niqob (32 bitli butun sonlar) */
interface CidrRange {
  base: number;
  mask: number;
}

/** Ro'yxat bir marta tahlil qilinadi (ogohlantirish ham bir marta chiqadi) */
let directAllowedCache: CidrRange[] | null = null;

/**
 * driver='http' shabloni murojaat qilishi mumkin bo'lgan portlar.
 * Bu ro'yxat port-skanerlashni cheklaydi: 5432 (PostgreSQL), 6379 (Redis),
 * 9200 va h.k. manzil xususiy bo'lsa ham rad etiladi.
 * 8123 — Home Assistant, 8080/8081 — ko'p relelarning muqobil web porti.
 */
const HTTP_ALLOWED_PORTS = new Set([80, 443, 8080, 8081, 8123]);

/** '192.168.1.51' -> 32 bitli son (shakl noto'g'ri bo'lsa null) */
function ipv4ToInt(value: string): number | null {
  const match = IPV4_RE.exec(value.trim());
  if (!match) return null;
  const octets = [match[1], match[2], match[3], match[4]].map((part) => Number(part));
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
}

/** '192.168.1.0/24' yoki '192.168.1.51' (=/32) -> oraliq; noto'g'ri bo'lsa null */
function parseCidr(entry: string): CidrRange | null {
  const slash = entry.indexOf('/');
  const ip = ipv4ToInt(slash === -1 ? entry : entry.slice(0, slash));
  if (ip === null) return null;

  let bits = 32;
  if (slash !== -1) {
    const raw = entry.slice(slash + 1).trim();
    if (!/^\d{1,2}$/.test(raw)) return null;
    bits = Number(raw);
    if (bits < 0 || bits > 32) return null;
  }
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return { base: (ip & mask) >>> 0, mask };
}

/**
 * Muhit o'zgaruvchisidan CIDR ro'yxatini o'qish.
 * Noto'g'ri yozilgan qiymat JIMGINA "hammasiga ruxsat" ga aylanmasligi kerak:
 * u ogohlantirish bilan tashlab yuboriladi (bitta ham to'g'ri qiymat qolmasa —
 * bo'sh ro'yxat, ya'ni DIRECT rejim ishlamaydi).
 *
 * Bu yerda NestJS Logger ishlatilmaydi: fayl ataylab NestJS ga bog'liq emas
 * (uni klubdagi lokal agent ham ishlatadi).
 */
function directAllowedCidrs(): CidrRange[] {
  if (directAllowedCache) return directAllowedCache;

  const raw = (process.env[DIRECT_ALLOWED_CIDRS_ENV] ?? '').trim();
  const ranges: CidrRange[] = [];
  for (const item of raw.split(',')) {
    const entry = item.trim();
    if (!entry) continue;
    const range = parseCidr(entry);
    if (!range) {
      console.warn(
        `[lights] ${DIRECT_ALLOWED_CIDRS_ENV}: noto'g'ri CIDR e'tiborsiz qoldirildi: "${entry}"`,
      );
      continue;
    }
    ranges.push(range);
  }

  directAllowedCache = ranges;
  return ranges;
}

/**
 * DIRECT rejimda shu manzilga so'rov yuborish mumkinmi.
 * Manzil BIR VAQTNING O'ZIDA ikkala shartga javob berishi kerak:
 *   1) mavjud lokal-tarmoq tekshiruvi (`isPrivateHost`) — loopback/tashqi IP rad;
 *   2) operator ochgan `LIGHTS_DIRECT_ALLOWED_CIDRS` ro'yxati ichida bo'lishi.
 * Ro'yxat bo'sh bo'lsa (standart) DIRECT rejim hech qayerga chiqmaydi.
 */
export function isDirectAllowedHost(host: string): boolean {
  if (!isPrivateHost(host)) return false;

  const ranges = directAllowedCidrs();
  if (ranges.length === 0) return false;

  const ip = ipv4ToInt(stripPort(host));
  if (ip === null) return false;
  return ranges.some((range) => ((ip & range.mask) >>> 0) === range.base);
}

/**
 * driver='http' shablon URL i ruxsat etilgan portga murojaat qiladimi.
 * Port ko'rsatilmasa sxemaning standart porti olinadi (http=80, https=443).
 */
export function isAllowedHttpPort(template: string): boolean {
  try {
    const parsed = new URL(template);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const port = parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80;
    return HTTP_ALLOWED_PORTS.has(port);
  } catch {
    return false;
  }
}

/**
 * Manzildagi PORT ruxsat etilganmi ('192.168.1.50:8080' -> 8080).
 *
 * NEGA KERAK: port cheklovi avval FAQAT driver='http' shablon URL lariga
 * qo'llanardi. Ammo Shelly/Tasmota/ESPHome/Home Assistant drayverlari ham
 * manzilni `host[:port]` ko'rinishida oladi va u yerdagi portni hech kim
 * tekshirmasdi — ya'ni drayverni almashtirib, ruxsat etilgan tarmoq ichida
 * istalgan portni (PostgreSQL 5432, Redis 6379, ichki panel) tekshirib ko'rish
 * mumkin edi. Endi cheklov BARCHA to'g'ridan-to'g'ri (DIRECT) chiqishlarga
 * bir xil qo'llanadi.
 *
 * Port ko'rsatilmasa 80 deb qabul qilinadi (drayverlar HTTP bilan ishlaydi).
 */
export function isAllowedHostPort(host: string): boolean {
  const raw = host?.trim();
  if (!raw) return false;
  const parts = raw.split(':');
  if (parts.length === 1) return true; // port yo'q -> 80/443, ikkalasi ham ro'yxatda
  if (parts.length !== 2) return false;
  const port = Number(parts[1]);
  return Number.isInteger(port) && HTTP_ALLOWED_PORTS.has(port);
}

/** Manzil formati to'g'rimi: IPv4[:port] yoki hostname[:port] (IPv6 qo'llab-quvvatlanmaydi) */
export function isValidHost(host: string): boolean {
  const raw = host?.trim();
  if (!raw || raw.length > 260) return false;
  // Ikkitadan ortiq bo'lak = IPv6 yoki noto'g'ri format
  const parts = raw.split(':');
  if (parts.length > 2) return false;

  if (parts.length === 2) {
    const port = parts[1];
    if (!/^\d{1,5}$/.test(port)) return false;
    const portNumber = Number(port);
    if (portNumber < 1 || portNumber > 65535) return false;
  }

  const name = parts[0].toLowerCase();
  if (!name || name.length > 253) return false;

  const match = IPV4_RE.exec(name);
  if (match) {
    const octets = [match[1], match[2], match[3], match[4]].map((part) => Number(part));
    return octets.every((n) => Number.isInteger(n) && n >= 0 && n <= 255);
  }
  // Butunlay raqamli manzil qat'iy IPv4 shaklidan o'tmadi — nom sifatida ham
  // qabul qilinmaydi (aks holda '010.010.010.010' saqlanib qolardi)
  if (ALL_NUMERIC_HOST_RE.test(name)) return false;
  return HOSTNAME_RE.test(name);
}

/** Drayver serverning o'zida (DIRECT) emas, faqat lokal agentda bajariladimi */
export function isBridgeOnlyDriver(driver: LightDriver): boolean {
  return BRIDGE_ONLY_SET.has(driver);
}

/**
 * Buyruq yuboriladigan kanallar ro'yxati: asosiy `channel` DOIM birinchi,
 * keyin `config.channels` dagi takrorlanmagan, chegaradagi qiymatlar.
 *
 * `entity`/`entityId` bilan ishlaydigan drayverlarda (esphome, home_assistant)
 * manzil kanalga bog'liq emas — u yerda qo'shimcha kanallar bir xil so'rovni
 * takrorlashdan boshqa narsa bermaydi, shuning uchun e'tiborga olinmaydi.
 */
function resolveChannels(target: LightTarget): number[] {
  const channels = [target.channel];
  if (!driverUsesChannel(target.driver)) return channels;

  const extra = target.config?.channels;
  if (!Array.isArray(extra)) return channels;

  for (const raw of extra) {
    if (channels.length >= MAX_CHANNELS) break;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0 || value > MAX_CHANNEL_INDEX) continue;
    if (!channels.includes(value)) channels.push(value);
  }
  return channels;
}

/** Drayver manzilida kanal raqami qatnashadimi */
function driverUsesChannel(driver: LightDriver): boolean {
  return (
    driver === LightDriver.SHELLY_GEN1 ||
    driver === LightDriver.SHELLY_GEN2 ||
    driver === LightDriver.TASMOTA ||
    driver === LightDriver.HTTP
  );
}

/** Bitta kanalga buyruq yuborish (`physical` — relega yuboriladigan qiymat) */
async function sendCommand(
  target: LightTarget,
  physical: boolean,
  timeoutMs: number,
): Promise<void> {
  const request = buildCommandRequest(target, physical);
  const res = await deviceFetch(request, target, timeoutMs);
  if (!res.ok) {
    // Javob TANASI xato matniga qo'shilmaydi (u panelga chiqadi) — faqat log uchun
    const body = await res.text().catch(() => '');
    throw new LightHttpError(
      `HTTP ${res.status} ${res.statusText}`,
      body ? body.slice(0, 300) : null,
    );
  }
}

/** Drayver bo'yicha so'rovni yig'ish (`physical` — relega yuboriladigan qiymat) */
function buildCommandRequest(target: LightTarget, physical: boolean): DeviceRequest {
  const host = target.host?.trim();

  switch (target.driver) {
    case LightDriver.SHELLY_GEN1:
      return {
        url: `http://${requireHost(host)}/relay/${target.channel}?turn=${physical ? 'on' : 'off'}`,
        method: 'GET',
      };

    case LightDriver.SHELLY_GEN2:
      return {
        url:
          `http://${requireHost(host)}/rpc/Switch.Set` +
          `?id=${target.channel}&on=${physical ? 'true' : 'false'}`,
        method: 'GET',
      };

    case LightDriver.TASMOTA:
      // %20 allaqachon kodlangan — URLSearchParams ishlatilmaydi
      return {
        url:
          `http://${requireHost(host)}/cm` +
          `?cmnd=Power${target.channel + 1}%20${physical ? 'ON' : 'OFF'}`,
        method: 'GET',
      };

    case LightDriver.ESPHOME: {
      // ESPHome web server: POST /switch/<entity>/turn_on|turn_off
      const entity = readEsphomeEntity(target.config);
      if (!entity) {
        throw new LightConfigError(
          "esphome drayveri uchun config.entity ko'rsatilmagan yoki noto'g'ri",
        );
      }
      return {
        url: `http://${requireHost(host)}/switch/${entity}/${physical ? 'turn_on' : 'turn_off'}`,
        method: 'POST',
      };
    }

    case LightDriver.HOME_ASSISTANT: {
      // HA REST: POST /api/services/<domain>/turn_on, tana: {"entity_id":"switch.stol_3"}
      const entityId = readHaEntityId(target.config);
      if (!entityId) {
        throw new LightConfigError(
          "home_assistant drayveri uchun config.entityId ko'rsatilmagan yoki noto'g'ri",
        );
      }
      const domain = entityId.slice(0, entityId.indexOf('.'));
      return {
        url:
          `http://${requireHost(host)}/api/services/${domain}` +
          `/${physical ? 'turn_on' : 'turn_off'}`,
        method: 'POST',
        body: JSON.stringify({ entity_id: entityId }),
        contentType: 'application/json',
      };
    }

    case LightDriver.HTTP: {
      const template = physical ? target.onUrl : target.offUrl;
      if (!template) {
        throw new LightConfigError(
          `http drayveri uchun ${physical ? 'onUrl' : 'offUrl'} ko'rsatilmagan`,
        );
      }
      return {
        url: template
          .replace(/\{channel\}/g, String(target.channel))
          .replace(/\{state\}/g, physical ? 'on' : 'off'),
        method: 'GET',
      };
    }

    default:
      throw new LightConfigError(`Chiroq drayveri qo'llab-quvvatlanmaydi: ${target.driver}`);
  }
}

/**
 * Qurilmaga so'rov yuborish. 401 javobida (Shelly Gen2/Gen3 parol qo'yilgan)
 * `WWW-Authenticate: Digest` chaqirig'i bo'yicha digest hisoblanadi va so'rov
 * BIR MARTA qayta yuboriladi. Qolgan hollarda javob o'zgarishsiz qaytariladi.
 */
async function deviceFetch(
  request: DeviceRequest,
  target: LightTarget,
  timeoutMs: number,
): Promise<Response> {
  const headers = buildHeaders(target);
  if (request.contentType) headers['Content-Type'] = request.contentType;

  const res = await fetch(request.url, {
    method: request.method,
    headers,
    body: request.body,
    // Yo'naltirish KUZATILMAYDI: ruxsat etilgan lokal manzil 302 bilan serverni
    // boshqa (tashqi) manzilga jo'natib yuborishi mumkin edi — 3xx xato hisoblanadi
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
  });

  // Bearer tokenli qurilmada (home_assistant) digest bo'lmaydi — qayta urinilmaydi
  if (res.status !== 401 || !target.auth || target.driver === LightDriver.HOME_ASSISTANT) {
    return res;
  }
  const challenge = parseDigestChallenge(res.headers.get('www-authenticate'));
  if (!challenge) return res;

  // Ulanish bo'shashi uchun 401 javobning tanasi o'qib tashlanadi
  await res.text().catch(() => '');

  const separator = target.auth.indexOf(':');
  const username = separator === -1 ? target.auth : target.auth.slice(0, separator);
  const password = separator === -1 ? '' : target.auth.slice(separator + 1);
  const parsed = new URL(request.url);

  return fetch(request.url, {
    method: request.method,
    headers: {
      ...headers,
      Authorization: buildDigestHeader(challenge, {
        username,
        password,
        method: request.method,
        // Digest HA2 faqat yo'l + query dan hisoblanadi (host qatnashmaydi)
        uri: `${parsed.pathname}${parsed.search}`,
      }),
    },
    body: request.body,
    redirect: 'manual',
    // Qayta urinish uchun YANGI timeout — birinchisi allaqachon sarflangan
    signal: AbortSignal.timeout(timeoutMs),
  });
}

/**
 * Autentifikatsiya headeri:
 * - home_assistant — `Authorization: Bearer <token>` (foydalanuvchi "Bearer " deb
 *   yozib qo'ysa ham to'g'ri ishlashi uchun prefiks kesib tashlanadi)
 * - qolganlari — basic auth ("user:parol"); qurilma digest talab qilsa
 *   `deviceFetch` 401 dan keyin digest bilan qayta yuboradi
 */
function buildHeaders(target: LightTarget): Record<string, string> {
  const auth = target.auth?.trim();
  if (!auth) return {};

  if (target.driver === LightDriver.HOME_ASSISTANT) {
    const token = auth.replace(/^Bearer\s+/i, '');
    return { Authorization: `Bearer ${token}` };
  }
  const encoded = Buffer.from(auth, 'utf8').toString('base64');
  return { Authorization: `Basic ${encoded}` };
}

/** Holat o'qish uchun JSON so'rov — xato yoki noto'g'ri format bo'lsa null */
async function fetchJson(
  url: string,
  target: LightTarget,
  timeoutMs: number,
): Promise<Record<string, unknown> | null> {
  const res = await deviceFetch({ url, method: 'GET' }, target, timeoutMs);
  if (!res.ok) return null;
  const data: unknown = await res.json();
  return typeof data === 'object' && data !== null && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : null;
}

/** 'ON'/'on'/'off' ko'rinishidagi qiymatni mantiqiy holatga o'girish (tushunarsiz bo'lsa null) */
function parseOnOff(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'on' || normalized === 'true' || normalized === '1') return true;
  if (normalized === 'off' || normalized === 'false' || normalized === '0') return false;
  // 'unavailable', 'unknown' va h.k. — noma'lum
  return null;
}

/** ESPHome switch nomi — shakli tekshiriladi (URL ga qo'shilishi sababli) */
function readEsphomeEntity(config: LightDeviceConfig | null): string | null {
  const entity = config?.entity?.trim().toLowerCase();
  return entity && ESPHOME_ENTITY_RE.test(entity) ? entity : null;
}

/** Home Assistant entity id — shakli tekshiriladi (URL ga qo'shilishi sababli) */
function readHaEntityId(config: LightDeviceConfig | null): string | null {
  const entityId = config?.entityId?.trim().toLowerCase();
  return entityId && HA_ENTITY_ID_RE.test(entityId) ? entityId : null;
}

/** Manzilsiz drayverlar uchun aniq xato matni */
function requireHost(host: string | undefined): string {
  if (!host) throw new LightConfigError("Rele manzili (host) ko'rsatilmagan");
  return host;
}

/** "192.168.1.51:8080" -> "192.168.1.51" */
function stripPort(host: string): string {
  const raw = host?.trim() ?? '';
  const index = raw.indexOf(':');
  return index === -1 ? raw : raw.slice(0, index);
}
