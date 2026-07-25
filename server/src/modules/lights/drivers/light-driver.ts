import { LightDriver } from '../../../entities/enums';

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

/** Bitta rele uchun ulanish ma'lumotlari (stol yozuvidan yoki bridge javobidan) */
export interface LightTarget {
  driver: LightDriver;
  /** "192.168.1.51" yoki "192.168.1.51:8080" — driver='http' da null bo'lishi mumkin */
  host: string | null;
  /** Rele kanali, 0 dan boshlanadi */
  channel: number;
  /** NC (normally closed) rele — yuboriladigan qiymat teskarilanadi */
  inverted: boolean;
  /** Basic-auth "user:parol" yoki null */
  auth: string | null;
  /** driver='http' uchun yoqish shabloni */
  onUrl: string | null;
  /** driver='http' uchun o'chirish shabloni */
  offUrl: string | null;
}

/** Standart so'rov timeouti (ms) — lokal tarmoq uchun 3 soniya yetarli */
const DEFAULT_TIMEOUT_MS = 3000;

/** IPv4 (portsiz) shakli — oktetlar qiymati alohida tekshiriladi */
const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** Hostname (portsiz): harf/raqam bilan boshlanadigan, nuqta bilan ajratilgan bo'laklar */
const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;

/**
 * Relega yoqish/o'chirish buyrug'ini yuboradi.
 * `on` — MANTIQIY holat (chiroq yonsinmi); inverted=true bo'lsa relega teskari
 * qiymat jo'natiladi. Javob res.ok bo'lmasa Error throw qilinadi.
 */
export async function applyLight(
  target: LightTarget,
  on: boolean,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  // NC rele uchun mantiqiy holat fizik holatga teskari
  const physical = target.inverted ? !on : on;
  const url = buildCommandUrl(target, physical);

  const res = await fetch(url, {
    headers: buildHeaders(target),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const tail = body ? ` — ${body.slice(0, 150)}` : '';
    throw new Error(`HTTP ${res.status} ${res.statusText}${tail}`);
  }
}

/**
 * Relening HAQIQIY holatini o'qish (mantiqiy qiymatda, inverted hisobga olingan).
 * O'qish majburiy emas: qurilma javob bermasa yoki formatni tushunmasak — null.
 */
export async function readLight(
  target: LightTarget,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<boolean | null> {
  try {
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
 * Ruxsat: 10.x, 172.16-31.x, 192.168.x, 127.x — FAQAT raqamli IPv4.
 *
 * Nom (hostname) ataylab RAD ETILADI: "localhost" ham, "shelly-abc.local" ham DNS/mDNS
 * orqali istalgan IP ga (jumladan tashqi manzilga) yechilishi mumkin, bu esa bulut
 * serverini ichki xizmatlarga so'rov yuborishga majburlash yo'lini ochadi.
 * Shu sababli DIRECT rejimda relega DHCP reservation orqali doimiy IP berilishi shart
 * (docs/LIGHT-CONTROL.md da shunday yozilgan). BRIDGE rejimida bu cheklov qo'llanmaydi —
 * u yerda so'rovni klub tarmog'idagi agentning o'zi yuboradi.
 */
export function isPrivateHost(host: string): boolean {
  const name = stripPort(host).toLowerCase();
  if (!name) return false;

  const match = IPV4_RE.exec(name);
  if (!match) return false;
  const octets = [match[1], match[2], match[3], match[4]].map((part) => Number(part));
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;

  const [a, b] = octets;
  if (a === 10 || a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
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
  return HOSTNAME_RE.test(name);
}

/** Drayver bo'yicha buyruq URL ini yig'ish (`physical` — relega yuboriladigan qiymat) */
function buildCommandUrl(target: LightTarget, physical: boolean): string {
  const host = target.host?.trim();

  switch (target.driver) {
    case LightDriver.SHELLY_GEN1:
      return `http://${requireHost(host)}/relay/${target.channel}?turn=${physical ? 'on' : 'off'}`;

    case LightDriver.SHELLY_GEN2:
      return (
        `http://${requireHost(host)}/rpc/Switch.Set` +
        `?id=${target.channel}&on=${physical ? 'true' : 'false'}`
      );

    case LightDriver.TASMOTA:
      // %20 allaqachon kodlangan — URLSearchParams ishlatilmaydi
      return (
        `http://${requireHost(host)}/cm` +
        `?cmnd=Power${target.channel + 1}%20${physical ? 'ON' : 'OFF'}`
      );

    case LightDriver.HTTP: {
      const template = physical ? target.onUrl : target.offUrl;
      if (!template) {
        throw new Error(`http drayveri uchun ${physical ? 'onUrl' : 'offUrl'} ko'rsatilmagan`);
      }
      return template
        .replace(/\{channel\}/g, String(target.channel))
        .replace(/\{state\}/g, physical ? 'on' : 'off');
    }

    default:
      throw new Error(`Chiroq drayveri qo'llab-quvvatlanmaydi: ${target.driver}`);
  }
}

/** Basic-auth headeri (auth "user:parol" ko'rinishida bo'lsa) */
function buildHeaders(target: LightTarget): Record<string, string> {
  if (!target.auth) return {};
  const encoded = Buffer.from(target.auth, 'utf8').toString('base64');
  return { Authorization: `Basic ${encoded}` };
}

/** Holat o'qish uchun JSON so'rov — xato yoki noto'g'ri format bo'lsa null */
async function fetchJson(
  url: string,
  target: LightTarget,
  timeoutMs: number,
): Promise<Record<string, unknown> | null> {
  const res = await fetch(url, {
    headers: buildHeaders(target),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) return null;
  const data: unknown = await res.json();
  return typeof data === 'object' && data !== null && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : null;
}

/** Manzilsiz drayverlar uchun aniq xato matni */
function requireHost(host: string | undefined): string {
  if (!host) throw new Error("Rele manzili (host) ko'rsatilmagan");
  return host;
}

/** "192.168.1.51:8080" -> "192.168.1.51" */
function stripPort(host: string): string {
  const raw = host?.trim() ?? '';
  const index = raw.indexOf(':');
  return index === -1 ? raw : raw.slice(0, index);
}
