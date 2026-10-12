import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * OFLAYN OBUNA NAZORATI TESTLARI.
 *
 * Bu mantiq "muddati tugagan klub internetni uzib qo'yib ishlashda davom eta
 * oladimi" degan savolga javob beradi — ya'ni bevosita PULGA tegishli.
 * Har bir invariant shu yerda muhrlangan:
 *
 *  1. Imzosi buzilgan ruxsatnoma HECH QACHON qabul qilinmaydi.
 *  2. Muddat o'tgan bo'lsa QAT'IY blok (qo'shimcha muhlat yo'q).
 *  3. Kompyuter soatini ORQAGA surish blokni kechiktirmaydi.
 *  4. Boshqa klubning ruxsatnomasi ishlatilmaydi.
 */

/* IndexedDB Node muhitida yo'q — meta saqlashni oddiy Map bilan almashtiramiz */
const store = new Map<string, unknown>();
vi.mock('./db', () => ({
  metaGet: vi.fn(async (key: string) => (store.has(key) ? store.get(key) : null)),
  metaSet: vi.fn(async (key: string, value: unknown) => {
    store.set(key, value);
    return 1;
  }),
}));

const b64url = (bytes: Uint8Array): string => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** Server tomondagi imzolashni takrorlaydi (ES256, IEEE P1363) */
const makeSigner = async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
  let bin = '';
  for (const b of spki) bin += String.fromCharCode(b);

  const sign = async (payload: object) => {
    const encoded = b64url(new TextEncoder().encode(JSON.stringify(payload)));
    const sig = new Uint8Array(
      await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        pair.privateKey,
        new TextEncoder().encode(encoded),
      ),
    );
    return { payload: encoded, signature: b64url(sig), alg: 'ES256' as const };
  };

  return { publicKeyB64: btoa(bin), sign };
};

const HOUR = 60 * 60 * 1000;

describe('oflayn ruxsatnoma', () => {
  let mod: typeof import('./license');
  let signer: Awaited<ReturnType<typeof makeSigner>>;

  beforeEach(async () => {
    store.clear();
    vi.resetModules();
    vi.useRealTimers();
    mod = await import('./license');
    signer = await makeSigner();
    await mod.storePublicKey(signer.publicKeyB64);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const licenseFor = (endsAt: string | null, status = 'active', clubId = 1) => {
    const now = Date.now();
    return signer.sign({
      version: 2, userId: 11, role: 'admin',
      clubId,
      status,
      endsAt,
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 24 * HOUR).toISOString(),
    });
  };

  it('haqiqiy, muddati kelmagan ruxsatnoma — ochiq', async () => {
    await mod.storeLicense(await licenseFor(new Date(Date.now() + 5 * HOUR).toISOString()));
    expect(await mod.offlineVerdict(1)).toEqual({ locked: false, reason: 'ok' });
  });

  it('muddati o‘tgan ruxsatnoma — QAT’IY blok', async () => {
    const endsAt = new Date(Date.now() - 1000).toISOString();
    await mod.storeLicense(await licenseFor(endsAt));
    expect(await mod.offlineVerdict(1)).toEqual({ locked: true, reason: 'expired', endsAt });
  });

  it('bloklangan klub — blok', async () => {
    const endsAt = new Date(Date.now() + 100 * HOUR).toISOString();
    await mod.storeLicense(await licenseFor(endsAt, 'blocked'));
    expect(await mod.offlineVerdict(1)).toEqual({ locked: true, reason: 'blocked', endsAt });
  });

  it('muddatsiz ruxsatnoma (endsAt = null) — ochiq', async () => {
    await mod.storeLicense(await licenseFor(null));
    expect(await mod.offlineVerdict(1)).toEqual({ locked: false, reason: 'ok' });
  });

  it('BUZILGAN payload — ruxsatnoma butunlay rad etiladi', async () => {
    const real = await licenseFor(new Date(Date.now() - HOUR).toISOString());
    // Muddatni 2099 ga uzaytirib ko'ramiz (imzo eskisicha qoladi)
    const forgedPayload = b64url(
      new TextEncoder().encode(
        JSON.stringify({
          clubId: 1,
          status: 'active',
          endsAt: '2099-01-01T00:00:00.000Z',
          issuedAt: new Date().toISOString(),
          expiresAt: '2099-01-01T00:00:00.000Z',
        }),
      ),
    );
    await mod.storeLicense({ ...real, payload: forgedPayload });

    // Imzo mos kelmagani uchun tarkib O'QILMAYDI
    expect(await mod.readLicense()).toBeNull();
    // Imzosiz ma’lumot oflayn ishlashga huquq bermaydi.
    expect(await mod.offlineVerdict(1)).toEqual({ locked: true, reason: 'unverified', endsAt: null });
  });

  it('BOSHQA kalit bilan imzolangan ruxsatnoma — rad etiladi', async () => {
    const other = await makeSigner();
    const fake = await other.sign({
      clubId: 1,
      status: 'active',
      endsAt: '2099-01-01T00:00:00.000Z',
      issuedAt: new Date().toISOString(),
      expiresAt: '2099-01-01T00:00:00.000Z',
    });
    await mod.storeLicense(fake);
    expect(await mod.readLicense()).toBeNull();
  });

  it('BOSHQA klubning ruxsatnomasi ishlatilmaydi', async () => {
    await mod.storeLicense(await licenseFor(new Date(Date.now() + 5 * HOUR).toISOString(), 'active', 7));
    expect(await mod.offlineVerdict(1)).toEqual({ locked: true, reason: 'unverified', endsAt: null });
  });

  it('ruxsatnoma yo‘q — oflayn kirish yopiq', async () => {
    expect(await mod.offlineVerdict(1)).toEqual({ locked: true, reason: 'unverified', endsAt: null });
  });

  it('same club but another user cannot reuse an offline lease', async () => {
    await mod.storeLicense(await licenseFor(null));
    expect((await mod.offlineVerdict(1, 12)).locked).toBe(true);
    expect((await mod.offlineVerdict(1, 11)).locked).toBe(false);
    expect((await mod.offlineVerdict(null, 11)).locked).toBe(true);
  });

  it('24-hour lease expires even with an unlimited subscription', async () => {
    await mod.storeLicense(await licenseFor(null));
    mod.noteServerTime(Date.now() + 24 * HOUR + 1);
    expect(await mod.offlineVerdict(1, 11)).toEqual({ locked: true, reason: 'leaseExpired', endsAt: null });
  });

  it('expired status cannot be reopened by a future subscription date', async () => {
    await mod.storeLicense(await licenseFor(new Date(Date.now() + HOUR).toISOString(), 'expired'));
    expect((await mod.offlineVerdict(1)).locked).toBe(true);
  });

  it.each([
    { expiresAt: 'invalid' }, { issuedAt: 'invalid' }, { endsAt: 'invalid' },
    { role: 'superadmin' }, { clubId: -1 }, { userId: 0 }, { version: 1 },
    { expiresAt: new Date(Date.now() + 48 * HOUR).toISOString() },
  ])('rejects signed but malformed claims: %j', async (override) => {
    await mod.storeLicense(await signer.sign({ version: 2, userId: 11, role: 'admin', clubId: 1,
      status: 'active', endsAt: null, issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + HOUR).toISOString(), ...override }));
    expect(await mod.readLicense()).toBeNull();
    expect((await mod.offlineVerdict(1)).locked).toBe(true);
  });

  it('wrong algorithm cannot be accepted as ES256', async () => {
    const lease = await licenseFor(null);
    await mod.storeLicense({ ...lease, alg: 'none' as 'ES256' });
    expect(await mod.readLicense()).toBeNull();
  });

  it('restart with a rolled-back device clock requires a server check', async () => {
    await mod.storeLicense(await licenseFor(null));
    store.set('maxSeenTime', Date.now() + HOUR);
    await mod.initClock();
    expect((await mod.offlineVerdict(1)).reason).toBe('clock');
    mod.noteServerTime(Date.now());
    expect((await mod.offlineVerdict(1)).locked).toBe(false);
  });

  it('server null bersa — eski ruxsatnoma O‘CHIRILADI', async () => {
    // Bir kompyuterda avval klub xodimi ishlagan
    await mod.storeLicense(await licenseFor(new Date(Date.now() + 5 * HOUR).toISOString()));
    expect(await mod.readLicense()).not.toBeNull();

    // Endi superadmin kirdi — unga ruxsatnoma berilmaydi
    await mod.storeLicense(null);
    expect(await mod.readLicense()).toBeNull();
  });
});

describe('monoton soat — orqaga surishga qarshi', () => {
  let mod: typeof import('./license');

  beforeEach(async () => {
    store.clear();
    vi.resetModules();
    mod = await import('./license');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('serverdan kelgan vaqt langar bo‘ladi va soat orqaga surilsa saqlanadi', async () => {
    const serverTime = Date.now() + 10 * HOUR;
    mod.noteServerTime(new Date(serverTime).toISOString());

    // Kompyuter soatini 5 soat ORQAGA suramiz
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() - 5 * HOUR);

    // "Hozir" hamon server aytgan vaqtdan kichik emas
    expect(mod.effectiveNow()).toBeGreaterThanOrEqual(serverTime);
  });

  it('soatni orqaga surish muddati o‘tgan obunani tiriltirmaydi', async () => {
    const endsAt = new Date(Date.now() + HOUR).toISOString();
    // Server "endsAt dan keyingi" vaqtni aytdi — obuna tugagan
    mod.noteServerTime(new Date(Date.parse(endsAt) + 60_000).toISOString());

    vi.useFakeTimers();
    // Soatni bir yil orqaga suramiz
    vi.setSystemTime(Date.now() - 365 * 24 * HOUR);

    expect(mod.isSubscriptionOver(endsAt)).toBe(true);
  });

  it('oddiy holatda (manipulyatsiyasiz) muddat hurmat qilinadi', async () => {
    expect(mod.isSubscriptionOver(new Date(Date.now() + HOUR).toISOString())).toBe(false);
    expect(mod.isSubscriptionOver(new Date(Date.now() - HOUR).toISOString())).toBe(true);
    expect(mod.isSubscriptionOver(null)).toBe(false);
  });

  it('first server response corrects an incorrectly fast device clock', async () => {
    const actual = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(actual + 365 * 24 * HOUR);
    mod.effectiveNow();
    mod.noteServerTime(actual);
    expect(mod.effectiveNow()).toBeLessThan(actual + 1000);
    expect(mod.isSubscriptionOver(new Date(actual + 30_000).toISOString())).toBe(false);
  });
});
