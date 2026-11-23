'use strict';

/**
 * CHIROQ MARKAZI (LightHub) — stol chiroqlarini klub tarmog'ida boshqaradigan dvigatel.
 *
 * Bir xil kod ikki joyda ishlaydi:
 *   - bridge agenti (bridge/agent.js) — alohida, doim yoqiq kompyuterda;
 *   - kassa kompyuteridagi Windows dasturi (desktop/main.js) — dasturning o'zida.
 *
 * Ma'lumot manbalari:
 *   1. BULUT (server): uzun-polling orqali rele sozlamalari, klub qoidalari va har
 *      stolning holati (o'yin, qo'lda boshqaruv, bronlar) keladi.
 *   2. KASSA (faqat kompyuter dasturida): kassir ekranidagi stollar holati
 *      to'g'ridan-to'g'ri, INTERNETSIZ keladi — `pushView()`.
 *   3. QO'LDA boshqaruv (internet yo'qligida ham) — `setOverride()`.
 *
 * Kerakli holat LOKAL hisoblanadi (lib/rules.js — serverdagi qoidaning nusxasi),
 * shuning uchun internet uzilsa ham o'yin boshlanishi/tugashi, pauza, o'yin
 * tugagach kechikish va bron oldidan yoqish o'z vaqtida ishlaydi.
 *
 * Ustuvorlik (har stol uchun alohida): eng YANGI dalil g'olib. Kassadagi hali
 * serverga yetmagan (navbatdagi) amal esa server uni tasdiqlaguncha ustun turadi —
 * aks holda internet qaytgan zahoti, navbat hali yuborilmay turib, eski bulut
 * holati o'ynayotgan stol chirog'ini o'chirib qo'yardi.
 *
 * Tashqi bog'liqlik YO'Q (Node 18+). Parol/token HECH QACHON logga chiqmaydi.
 */

const fs = require('node:fs');
const { EventEmitter } = require('node:events');

const { errText, clampInt, fetchWithTimeout } = require('./common');
const serial = require('./serial');
const { MqttClient } = require('./mqtt');
const { discover } = require('./discover');
const { logicalState, executeDevice } = require('./control');
const { normalizeRules, resolveDesired, nextChangeAt } = require('./rules');
const drivers = require('./drivers');

/** state.json formati: 2 — lokal model (o'yinlar, qo'lda boshqaruv, qoidalar) bilan */
const STATE_FORMAT = 2;

/** Uzun-polling timeouti — server javobni 25 s ushlaydi, biroz zaxira bilan */
const POLL_TIMEOUT_MS = 30_000;

/** Tarmoq xatosida kutish bosqichlari (ms) */
const BACKOFF_MS = [1000, 2000, 5000, 10_000, 30_000];

/** Token bekor qilingan (401/403) bo'lsa — shuncha kutib qayta tekshiramiz */
const AUTH_RETRY_MS = 60_000;

/** Xato rele bo'lsa serverdan javobni qisqaroq ushlash so'raladi (?hold=) */
const FAILED_RETRY_HOLD_MS = [2000, 3000, 5000, 8000, 10_000];

/** Bir vaqtda nechta stol bilan ishlanadi */
const MAX_PARALLEL = 8;

/** Server bir hisobotda 200 tagacha natija qabul qiladi */
const MAX_REPORT_ITEMS = 200;

/**
 * Ma'lumot shuncha eskirgan bo'lsa relelarga TEGILMAYDI (24 soat — kassaning
 * internetsiz ishlash chegarasi bilan bir xil). Masalan kompyuter ikki kun
 * o'chiq turib, internetsiz yoqilsa — ikki kun oldingi "o'yin ketyapti" holati
 * qayta tiklanib, bo'sh stolda chiroq yonib ketmasin.
 */
const MAX_EVIDENCE_AGE_MS = 24 * 60 * 60 * 1000;

/** Kassadagi navbatdagi amal shuncha vaqtdan keyin baribir eskirgan hisoblanadi */
const MAX_PENDING_AGE_MS = 24 * 60 * 60 * 1000;

/** Qo'lda boshqaruv chegaralari (daqiqa) — server API bilan bir xil */
const OVERRIDE_MIN_MINUTES = 1;
const OVERRIDE_MAX_MINUTES = 720;
const OVERRIDE_DEFAULT_MINUTES = 30;

/** Diskka yozishlar orasidagi eng qisqa oraliq */
const PERSIST_THROTTLE_MS = 2000;

/** Holat o'zgarishi haqidagi hodisalar orasidagi eng qisqa oraliq (UI uchun) */
const STATUS_THROTTLE_MS = 250;

/** Bajarilgan discover tasklari (takrorlamaslik uchun) */
const MAX_DONE_TASKS = 200;

const SESSION_VALUES = new Set(['active', 'paused']);

/** ISO matn yoki son -> epoch ms; yaroqsiz bo'lsa null */
function toMs(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? null : parsed;
}

function toSession(value) {
  return SESSION_VALUES.has(value) ? value : null;
}

/**
 * Qidiruvda topilgan qurilmani serverga yuboriladigan shaklga keltiradi.
 * Uzunliklar server DTO si bilan bir xil — bitta uzun nom butun natijani
 * (400 javob bilan) rad ettirmasin.
 */
function discoveredForServer(item) {
  const text = (value, max) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);
  const out = {};
  const host = text(item.host, 60);
  const serialPort = text(item.serialPort, 60);
  const serialNumber = text(item.serialNumber, 40);
  const id = text(item.id, 64);
  const version = text(item.version, 10);
  const mac = text(item.mac, 40);
  const model = text(item.model, 60);
  const name = text(item.name, 60);
  if (host) out.host = host;
  if (serialPort) out.serialPort = serialPort;
  if (serialNumber) out.serialNumber = serialNumber;
  if (id && /^[A-Za-z0-9]+$/.test(id)) out.id = id;
  if (version) out.version = version;
  if (typeof item.encrypt === 'boolean') out.encrypt = item.encrypt;
  if (mac) out.mac = mac;
  if (model) out.model = model;
  if (name) out.name = name;
  // Faqat ma'lum drayver nomi — server noma'lum qiymatni (butun natijani) rad etadi
  if (typeof item.driver === 'string' && drivers.getDriver(item.driver)) out.driver = item.driver;
  if (Number.isInteger(item.channels) && item.channels >= 1 && item.channels <= 32) out.channels = item.channels;
  return out;
}

/**
 * Drayver qiymatlaridan mantiqiy holat. Holat aniqlanmasa va drayver sababini aytgan bo'lsa
 * (`values.reason`, masalan Tuya: "DP 1 — yoqish kanali emas"), u o'qish xatosi sifatida
 * qaytadi — sinov oynasida umumiy "tasdiqlab bo'lmadi" o'rniga aniq sabab ko'rinadi.
 */
function stateOrReason(values, inverted, desired) {
  const list = Array.isArray(values) ? values : [];
  const state = logicalState(list, inverted === true, desired === true);
  if (state === null && list.length && typeof values.reason === 'string' && values.reason) throw new Error(values.reason);
  return state;
}

class LightHub extends EventEmitter {
  /**
   * @param {object} options
   * @param {string} [options.serverUrl]   bulut server (bo'lmasa faqat lokal rejim)
   * @param {string} [options.token]       bridge tokeni
   * @param {string} [options.stateFile]   holat fayli (state.json)
   * @param {{seal:(s:string)=>string, open:(s:string)=>string}} [options.secretCodec]
   *        rele parollarini diskka SHIFRLAB yozish (kompyuter dasturida — Windows DPAPI)
   * @param {boolean} [options.cacheSecrets] shifrlovchi yo'q bo'lsa parollarni ochiq yozish
   * @param {'bridge'|'desktop'} [options.kind]
   * @param {string} [options.agentVersion]
   * @param {(level:string, message:string)=>void} [options.log]
   * @param {object} [options.mqtt]        { url, user, pass, clientId, keepaliveSec, caFile, tlsInsecure }
   * @param {() => number} [options.now]   soat (testlar uchun)
   */
  constructor(options = {}) {
    super();
    this.kind = options.kind === 'desktop' ? 'desktop' : 'bridge';
    this.agentVersion = String(options.agentVersion || '3.0.0');
    this.log = typeof options.log === 'function' ? options.log : () => {};
    this.serverUrl = String(options.serverUrl || '').trim().replace(/\/+$/, '');
    this.token = String(options.token || '').trim();
    this.stateFile = options.stateFile || null;
    this.secretCodec = options.secretCodec || null;
    this.cacheSecrets = options.cacheSecrets === true;
    this.requestTimeoutMs = clampInt(options.requestTimeoutMs, 500, 60_000, 5000);
    this.deviceTimeoutMs = clampInt(options.deviceTimeoutMs, 500, 30_000, 3000);
    this.defaultForceSyncMs = clampInt(options.forceSyncMs, 5000, 3_600_000, 60_000);
    this.forceSyncMs = this.defaultForceSyncMs;
    this.mqttOptions = options.mqtt && options.mqtt.url ? options.mqtt : null;
    this.subnet = String(options.subnet || '').trim();
    this.discoverTimeoutMs = clampInt(options.discoverTimeoutMs, 200, 5000, 700);
    this.discoverParallel = clampInt(options.discoverParallel, 1, 128, 32);
    this.nowFn = typeof options.now === 'function' ? options.now : Date.now;
    this.sleepFn = typeof options.sleep === 'function' ? options.sleep : null;
    /** Qo'shimcha qidiruvchilar (USB portlar, mDNS, Tuya) — `discoverLocal` uchun */
    this.discoveryProviders = Array.isArray(options.discoveryProviders) ? options.discoveryProviders : [];

    this.running = false;
    this.stopping = false;
    this.controller = new AbortController();
    this.sleepers = new Set();
    this.timers = new Set();

    /** tableId -> rele sozlamasi (bulutdan; auth bilan) */
    this.devices = new Map();
    /** tableId -> bulutdagi holat modeli */
    this.cloudModel = new Map();
    this.cloudVersion = '';
    /** Bulut suratining SERVER vaqti (eng oxirgi muvaffaqiyatli javob) */
    this.cloudAt = 0;
    /** Klub qoidalari; null — server eski (faqat tayyor `desired` yuboradi) */
    this.rules = null;
    this.verify = false;
    /** Server soati - lokal soat (ms) */
    this.clockOffsetMs = 0;
    /** Kassa ko'rinishi: { fetchedAt, receivedAt, tables: Map } */
    this.view = null;
    /** tableId -> { on: boolean|null, until, setAt } — lokal qo'lda boshqaruv */
    this.localOverrides = new Map();

    this.applied = new Map();
    this.failed = new Set();
    this.failedRounds = 0;
    this.lastForceSyncAt = 0;
    /** tableId -> oxirgi natija (UI va diagnostika uchun) */
    this.lastResults = new Map();
    /** tableId -> oxirgi hisoblangan holat va manbasi */
    this.lastDesired = new Map();

    this.cloud = {
      configured: Boolean(this.serverUrl && this.token),
      online: false,
      lastOkAt: null,
      lastError: null,
      authFailed: false,
    };

    this.locks = new Map();
    this.mqttClient = null;
    this.mqttInitError = null;
    this.warnedTopics = new Set();
    this.authSkipWarned = false;

    this.reconcileRunning = false;
    this.reconcileAgain = false;
    this.reconcileTimer = null;
    this.wakeTimer = null;
    this.forceTimer = null;
    this.persistTimer = null;
    this.lastPersistAt = 0;
    this.statusTimer = null;
    this.lastStatusAt = 0;

    this.doneTasks = new Set();
    this.taskQueue = [];
    this.discoverRunning = false;
    this.runningTaskId = null;
    this.unsentDiscover = null;
  }

  /* ---------------------------------------------------------------- */
  /*  Soat, kutish, taymerlar                                          */
  /* ---------------------------------------------------------------- */

  /** SERVER soati bo'yicha hozirgi vaqt */
  now() {
    return this.nowFn() + this.clockOffsetMs;
  }

  sleep(ms) {
    if (this.sleepFn) return this.sleepFn(ms);
    if (this.stopping) return Promise.resolve();
    return new Promise((resolve) => {
      const entry = {
        timer: setTimeout(() => {
          this.sleepers.delete(entry);
          resolve();
        }, ms),
        resolve,
      };
      this.sleepers.add(entry);
    });
  }

  setTimer(fn, ms) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      fn();
    }, Math.max(0, ms));
    this.timers.add(timer);
    return timer;
  }

  clearTimer(timer) {
    if (!timer) return;
    clearTimeout(timer);
    this.timers.delete(timer);
  }

  /* ---------------------------------------------------------------- */
  /*  Ishga tushirish / to'xtatish                                     */
  /* ---------------------------------------------------------------- */

  start() {
    if (this.running) return;
    this.running = true;
    this.stopping = false;
    this.loadState();
    if (this.cloud.configured) this.startCloudLoop();
    // Majburiy sinxronizatsiya: har 5 s da muddat o'tdimi tekshiriladi
    this.forceTimer = setInterval(() => {
      if (this.nowFn() - this.lastForceSyncAt >= this.forceSyncMs) this.scheduleReconcile(0);
    }, 5000);
    this.scheduleReconcile(0);
    this.emitStatus(true);
  }

  async stop() {
    if (!this.running || this.stopping) return;
    this.stopping = true;
    for (const entry of this.sleepers) {
      clearTimeout(entry.timer);
      entry.resolve();
    }
    this.sleepers.clear();
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    if (this.forceTimer) clearInterval(this.forceTimer);
    this.forceTimer = null;
    try {
      this.controller.abort();
    } catch {
      /* e'tiborsiz */
    }
    if (this.mqttClient) {
      try {
        this.mqttClient.close();
      } catch {
        /* e'tiborsiz */
      }
      this.mqttClient = null;
    }
    try {
      serial.closeAll();
    } catch {
      /* e'tiborsiz */
    }
    this.persistNow();
    this.running = false;
    this.emitStatus(true);
  }

  /* ---------------------------------------------------------------- */
  /*  Tashqi kirishlar: kassa ko'rinishi va qo'lda boshqaruv           */
  /* ---------------------------------------------------------------- */

  /**
   * Kassir ekranidagi stollar holati (kompyuter dasturidan, internetsiz ham).
   *
   * @param {object} view
   * @param {number|string} view.fetchedAt  stollar serverdan OXIRGI MARTA olingan vaqt
   *        (keshdan ko'rsatilgan bo'lsa — keshning asl vaqti, hozirgi vaqt EMAS)
   * @param {number|string} [view.serverNow] kassaning server soati bo'yicha "hozir"i
   * @param {Array} view.tables  [{ tableId, session: 'active'|'paused'|null,
   *        since, pending, endedAt }] — `pending` — amal kassada navbatda, serverga
   *        hali yetmagan; `since` — shu holat boshlangan vaqt; `endedAt` — o'yin
   *        tugagan vaqt (grace uchun)
   */
  pushView(view) {
    if (!view || !Array.isArray(view.tables)) return;
    const fetchedAt = toMs(view.fetchedAt) ?? 0;
    const tables = new Map();
    const now = this.now();
    for (const raw of view.tables.slice(0, 500)) {
      const tableId = Number(raw && raw.tableId);
      if (!Number.isInteger(tableId) || tableId <= 0) continue;
      const since = toMs(raw.since);
      const pending = raw.pending === true && since !== null && now - since < MAX_PENDING_AGE_MS;
      tables.set(tableId, {
        session: toSession(raw.session),
        since,
        pending,
        endedAt: toMs(raw.endedAt),
      });
    }
    // Bulut bilan aloqa yo'q bo'lsa server soatini kassadan olamiz
    const serverNow = toMs(view.serverNow);
    if (serverNow !== null && !this.cloud.online) this.clockOffsetMs = serverNow - this.nowFn();

    this.view = { fetchedAt, receivedAt: this.nowFn(), tables };
    this.schedulePersist();
    this.scheduleReconcile(0);
  }

  /**
   * Qo'lda boshqaruv (internetsiz ham ishlaydi).
   * @param {object} params
   * @param {number[]|null} params.tableIds  null — barcha stollar (master)
   * @param {boolean|null} params.on          null — avtomatikaga qaytarish
   * @param {number} [params.minutes]
   */
  setOverride({ tableIds = null, on = null, minutes } = {}) {
    const ids = Array.isArray(tableIds)
      ? tableIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)
      : Array.from(this.devices.keys());
    const mins = clampInt(minutes, OVERRIDE_MIN_MINUTES, OVERRIDE_MAX_MINUTES, OVERRIDE_DEFAULT_MINUTES);
    const now = this.now();
    for (const id of ids) {
      // on=null ham yoziladi: "avtomatikaga qaytarish" bulutdagi eski qo'lda
      // boshqaruvni ham bekor qiladi (computeDesired: yozuvning `setAt` i)
      this.localOverrides.set(id, {
        on: typeof on === 'boolean' ? on : null,
        until: now + mins * 60_000,
        setAt: now,
      });
    }
    this.schedulePersist();
    this.scheduleReconcile(0);
    return { tables: ids.length, until: new Date(now + mins * 60_000).toISOString() };
  }

  /* ---------------------------------------------------------------- */
  /*  Kerakli holatni hisoblash                                        */
  /* ---------------------------------------------------------------- */

  /**
   * Bitta stolning kerakli holati va uning manbasi.
   * @returns {{ desired: boolean, source: string, input: object }}
   */
  computeDesired(tableId, now = this.now()) {
    const cloud = this.cloudModel.get(tableId) || null;
    const viewEntry = this.view ? this.view.tables.get(tableId) || null : null;
    const local = this.localOverrides.get(tableId) || null;
    const rulesKnown = this.rules !== null && Boolean(cloud && cloud.hasModel);

    // Eski server (faqat tayyor `desired`) va lokal ma'lumot yo'q — avvalgidek
    if (!rulesKnown && !viewEntry && !(local && local.until > now)) {
      return { desired: Boolean(cloud && cloud.desired), source: 'cloud', input: null };
    }

    let session = cloud ? cloud.session : null;
    let lastEndAt = cloud ? cloud.lastEndAt : null;
    let source = 'cloud';
    let sessionEventAt = null;

    if (viewEntry) {
      const cloudAt = cloud ? cloud.at : 0;
      // Navbatdagi amal: bulut UNI tasdiqlaguncha ustun (holat bir xil va
      // bulut surati amaldan keyin olingan bo'lsa — tasdiqlangan)
      const confirmed = viewEntry.pending && cloud
        && cloud.at >= viewEntry.since && cloud.session === viewEntry.session;
      const viewWins = viewEntry.pending
        ? !confirmed
        : (this.view.fetchedAt > cloudAt || !cloud);
      if (viewWins) {
        session = viewEntry.session;
        source = viewEntry.pending ? 'local' : 'view';
        if (viewEntry.pending) sessionEventAt = viewEntry.since;
        if (session === null) {
          const ended = viewEntry.endedAt ?? (viewEntry.pending ? viewEntry.since : null);
          if (ended !== null && (lastEndAt === null || ended > lastEndAt)) lastEndAt = ended;
        }
      }
    }

    // Qo'lda boshqaruv: YANGIROG'I g'olib. Lokal yozuv (muddati o'tgan bo'lsa
    // ham) o'zidan ESKI bulut buyrug'ini butunlay bekor qiladi — serverdagidek:
    // yangi buyruq eskisining o'rnini egallaydi, u tugagach eski qaytib kelmaydi.
    // `on: null` — "avtomatikaga qaytarish".
    const cloudOverride = cloud && typeof cloud.overrideOn === 'boolean' && cloud.overrideUntil > now
      && (!local || cloud.overrideSeenAt > local.setAt)
      ? { on: cloud.overrideOn, until: cloud.overrideUntil, setAt: cloud.overrideSeenAt }
      : null;
    const localOverride = local && local.until > now && typeof local.on === 'boolean' ? local : null;
    let override = cloudOverride || localOverride;
    // Serverdagidek: o'yin amali (boshlash/pauza/tugatish) qo'lda boshqaruvni bekor qiladi
    if (override && sessionEventAt !== null && sessionEventAt > override.setAt) override = null;
    if (override) source = override === localOverride ? 'override-local' : 'override';

    const input = {
      override,
      session,
      lastEndAt,
      reservations: cloud ? cloud.reservations : [],
    };
    const desired = rulesKnown || viewEntry || override
      ? resolveDesired(input, this.rules || undefined, now)
      : Boolean(cloud && cloud.desired);
    return { desired, source, input };
  }

  /** Eng yangi dalil vaqti (server soati) — eskirgan holatda relelarga tegilmaydi */
  latestEvidenceAt() {
    let latest = this.cloudAt || 0;
    if (this.view) {
      latest = Math.max(latest, this.view.fetchedAt || 0);
      for (const entry of this.view.tables.values()) {
        if (entry.pending && entry.since) latest = Math.max(latest, entry.since);
      }
    }
    for (const entry of this.localOverrides.values()) latest = Math.max(latest, entry.setAt || 0);
    return latest;
  }

  /* ---------------------------------------------------------------- */
  /*  Qo'llash (reconcile)                                             */
  /* ---------------------------------------------------------------- */

  scheduleReconcile(delayMs = 0) {
    if (!this.running || this.stopping) return;
    if (this.reconcileTimer) return; // allaqachon rejalashtirilgan
    this.reconcileTimer = this.setTimer(() => {
      this.reconcileTimer = null;
      void this.reconcile();
    }, delayMs);
  }

  async reconcile() {
    if (this.reconcileRunning) {
      this.reconcileAgain = true;
      return;
    }
    this.reconcileRunning = true;
    try {
      do {
        this.reconcileAgain = false;
        // eslint-disable-next-line no-await-in-loop
        await this.reconcileOnce();
      } while (this.reconcileAgain && !this.stopping);
    } catch (err) {
      this.log('error', `Chiroqlarni qo'llashda xato: ${errText(err)}`);
    } finally {
      this.reconcileRunning = false;
    }
    this.scheduleWake();
    this.emitStatus();
  }

  /** Keyingi vaqtga bog'liq o'zgarishga (grace/bron/override) taymer qo'yadi */
  scheduleWake() {
    if (this.stopping) return;
    this.clearTimer(this.wakeTimer);
    this.wakeTimer = null;
    const now = this.now();
    let next = null;
    for (const tableId of this.devices.keys()) {
      const { input } = this.computeDesired(tableId, now);
      if (!input) continue;
      const at = nextChangeAt(input, this.rules || undefined, now);
      if (at !== null && (next === null || at < next)) next = at;
    }
    if (next === null) return;
    // +50 ms — chegara aniq o'tganidan keyin hisoblansin (qat'iy taqqoslashlar)
    this.wakeTimer = this.setTimer(() => {
      this.wakeTimer = null;
      this.scheduleReconcile(0);
    }, Math.min(next - now + 50, 2_147_000_000));
  }

  fingerprint(entry) {
    return JSON.stringify([entry.desired, entry.driver, entry.host, entry.channel, entry.inverted,
      entry.auth, entry.onUrl, entry.offUrl, entry.config, this.resolveVerify(entry)]);
  }

  resolveVerify(entry) {
    const config = entry.config || {};
    if (typeof config.verify === 'boolean') return config.verify;
    return this.verify === true;
  }

  async reconcileOnce() {
    if (this.stopping) return;
    if (this.cloud.authFailed) return; // boshqa agent ulangan — relelarga tegmaymiz
    const now = this.now();
    if (!this.devices.size) return;
    const evidence = this.latestEvidenceAt();
    if (!evidence || now - evidence > MAX_EVIDENCE_AGE_MS) {
      this.log('debug', "Chiroq ma'lumoti eskirgan — relelarga tegilmaydi");
      return;
    }

    const forced = this.nowFn() - this.lastForceSyncAt >= this.forceSyncMs;
    if (forced) this.lastForceSyncAt = this.nowFn();

    const entries = [];
    for (const device of this.devices.values()) {
      if (!device || !device.driver || device.driver === 'none') continue;
      if (device.authOmitted) continue; // parol diskda saqlanmagan — buyruq foydasiz
      const { desired, source } = this.computeDesired(device.tableId, now);
      this.lastDesired.set(device.tableId, { desired, source });
      entries.push({ ...device, desired });
    }

    const known = new Set(entries.map((entry) => entry.tableId));
    for (const id of Array.from(this.applied.keys())) if (!known.has(id)) this.applied.delete(id);
    for (const id of Array.from(this.failed)) if (!known.has(id)) this.failed.delete(id);

    const pending = entries.filter((entry) => forced || this.applied.get(entry.tableId) !== this.fingerprint(entry));
    if (!pending.length) return;

    this.log(forced ? 'debug' : 'info',
      `${pending.length} ta stol tekshirilmoqda${forced ? ' (majburiy sinxronizatsiya)' : ''}`);

    const fingerprints = new Map(pending.map((entry) => [entry.tableId, this.fingerprint(entry)]));
    const results = await this.runPool(pending, MAX_PARALLEL, (entry) => this.handleDevice(entry, forced));

    for (const result of results) {
      this.lastResults.set(result.tableId, { ...result, at: new Date(this.now()).toISOString() });
      if (result.ok) {
        this.applied.set(result.tableId, fingerprints.get(result.tableId));
        this.failed.delete(result.tableId);
      } else {
        this.applied.delete(result.tableId); // keyingi siklda qayta urinamiz
        this.failed.add(result.tableId);
      }
    }
    if (this.failed.size) {
      this.failedRounds += 1;
      // Xato rele bor — bir necha soniyadan keyin yana urinamiz (bulutsiz ham)
      const wait = FAILED_RETRY_HOLD_MS[Math.min(this.failedRounds - 1, FAILED_RETRY_HOLD_MS.length - 1)];
      this.setTimer(() => this.scheduleReconcile(0), wait);
    } else if (this.failedRounds) {
      this.log('info', 'Barcha relelar javob bermoqda');
      this.failedRounds = 0;
    }

    if (this.cloud.configured && this.cloud.online && !this.cloud.authFailed) {
      await this.sendReport(results);
    }
  }

  /** Bir xil kalitli (plata/port) buyruqlarni navbat bilan bajaradi */
  withLock(key, fn) {
    if (!key) return fn();
    const previous = this.locks.get(key) || Promise.resolve();
    const run = previous.catch(() => undefined).then(fn);
    const tail = run.catch(() => undefined);
    this.locks.set(key, tail);
    void tail.then(() => {
      if (this.locks.get(key) === tail) this.locks.delete(key);
    });
    return run;
  }

  driverCtx() {
    return {
      timeoutMs: this.deviceTimeoutMs,
      signal: this.controller.signal,
      log: this.log,
      sleep: (ms) => this.sleep(ms),
      mqtt: () => this.ensureMqtt(),
      mqttStateTtlMs: Math.max(this.forceSyncMs, (this.mqttOptions?.keepaliveSec || 30) * 2000),
    };
  }

  /** Bitta stol: yozish + (mumkin bo'lsa) holatni o'qib tasdiqlash */
  async handleDevice(entry, forced) {
    const startedAt = this.nowFn();
    const driver = drivers.getDriver(entry.driver);
    if (!driver) {
      return {
        tableId: entry.tableId, commandRevision: entry.commandRevision, ok: false, on: entry.desired,
        actual: null, attempts: 0, latencyMs: 0, error: `noma'lum rele turi: "${entry.driver}"`,
      };
    }
    const unreachable = this.failed.has(entry.tableId);
    const ctx = this.driverCtx();
    const result = await this.withLock(driver.lockKey(entry), () => executeDevice(entry, {
      verify: this.resolveVerify(entry),
      readback: driver.readback(entry),
      forced,
      sleep: (ms) => this.sleep(ms),
      ...(unreachable ? { delays: [0] } : {}),
      write: async (physical) => {
        if (this.stopping) throw new Error("chiroq markazi to'xtatilmoqda");
        await driver.write(entry, physical, ctx);
      },
      read: async (options) => {
        const values = await driver.read(entry, ctx, options || {});
        return stateOrReason(values, entry.inverted === true, entry.desired === true);
      },
    }));
    const message = result.error ? String(result.error).replace(/\s+/g, ' ').trim().slice(0, 200) : null;
    this.log(result.ok ? 'debug' : 'error', `stol #${entry.tableNumber ?? entry.tableId}: ${result.ok
      ? (result.actual === null ? 'buyruq yuborildi, holat tasdiqlanmagan' : 'rele holati tasdiqlandi')
      : message}`);
    return {
      ...result,
      tableId: entry.tableId,
      commandRevision: entry.commandRevision,
      latencyMs: this.nowFn() - startedAt,
      error: message,
    };
  }

  async runPool(items, limit, worker) {
    const results = [];
    let index = 0;
    const run = async () => {
      for (;;) {
        const current = index;
        index += 1;
        if (current >= items.length || this.stopping) return;
        try {
          // eslint-disable-next-line no-await-in-loop
          results.push(await worker(items[current]));
        } catch (err) {
          results.push({
            tableId: items[current].tableId, commandRevision: items[current].commandRevision,
            ok: false, on: null, actual: null, attempts: 0, latencyMs: 0, error: errText(err).slice(0, 200),
          });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
    return results;
  }

  /* ---------------------------------------------------------------- */
  /*  Sinov va qidiruv (sozlash ustasi uchun)                          */
  /* ---------------------------------------------------------------- */

  /**
   * Ixtiyoriy sozlamani bir marta sinaydi (saqlashdan OLDIN ham ishlaydi).
   * Kerakli holatga ta'sir qilmaydi: stol sozlangan bo'lsa keyingi sinxronizatsiya
   * uni yana avtomatik holatga qaytaradi.
   */
  async testDevice(device, on) {
    const entry = {
      tableId: Number(device && device.tableId) || 0,
      tableNumber: device && device.tableNumber,
      driver: device && device.driver,
      host: device && device.host ? String(device.host) : '',
      channel: Number.isInteger(device && device.channel) ? device.channel : 0,
      inverted: Boolean(device && device.inverted),
      auth: device && typeof device.auth === 'string' ? device.auth : null,
      onUrl: device && device.onUrl ? String(device.onUrl) : null,
      offUrl: device && device.offUrl ? String(device.offUrl) : null,
      config: device && device.config && typeof device.config === 'object' ? device.config : null,
      desired: on === true,
    };
    // Saqlangan stol bo'lsa va parol kiritilmagan bo'lsa — saqlangan paroldan foydalanamiz
    if (!entry.auth && entry.tableId && this.devices.has(entry.tableId)) {
      entry.auth = this.devices.get(entry.tableId).auth || null;
    }
    const driver = drivers.getDriver(entry.driver);
    if (!driver) return { ok: false, on: entry.desired, actual: null, attempts: 0, error: `noma'lum rele turi: "${entry.driver}"` };
    const ctx = this.driverCtx();
    const startedAt = this.nowFn();
    const result = await this.withLock(driver.lockKey(entry), () => executeDevice(entry, {
      verify: true,
      readback: driver.readback(entry),
      forced: false,
      sleep: (ms) => this.sleep(ms),
      write: (physical) => driver.write(entry, physical, ctx),
      read: async (options) => stateOrReason(
        await driver.read(entry, ctx, options || {}), entry.inverted, entry.desired,
      ),
    }));
    // Sozlangan stolning qayta qo'llanishi uchun izini o'chiramiz
    if (entry.tableId) this.applied.delete(entry.tableId);
    return { ...result, latencyMs: this.nowFn() - startedAt };
  }

  /**
   * Lokal tarmoqda qurilmalarni qidiradi. `providers` — qo'shimcha qidiruvchilar
   * (USB portlar, mDNS, Tuya) — kompyuter dasturi o'zinikini qo'shadi.
   */
  async discoverLocal({ subnet, providers = this.discoveryProviders } = {}) {
    const results = [];
    let usedSubnet = null;
    const scan = discover({
      subnet: String(subnet || this.subnet || '').trim(),
      serverHost: this.serverHost(),
      timeoutMs: this.discoverTimeoutMs,
      parallel: this.discoverParallel,
      signal: this.controller.signal,
      log: this.log,
    }).then((found) => {
      usedSubnet = found.subnet;
      results.push(...found.devices);
    }).catch((err) => this.log('error', `Tarmoqni skanerlashda xato: ${errText(err)}`));
    const extra = providers.map((provider) => Promise.resolve()
      .then(() => provider({ signal: this.controller.signal, log: this.log, subnet }))
      .then((devices) => { if (Array.isArray(devices)) results.push(...devices); })
      .catch((err) => this.log('error', `Qidiruvda xato: ${errText(err)}`)));
    await Promise.all([scan, ...extra]);
    // Bir xil qurilma bir necha usulda topilishi mumkin — manzil+tur bo'yicha birlashtiramiz
    const unique = new Map();
    for (const device of results) {
      if (!device) continue;
      const key = `${device.driver || ''}|${device.host || device.serialPort || device.id || ''}`;
      unique.set(key, { ...(unique.get(key) || {}), ...device });
    }
    return { subnet: usedSubnet, devices: Array.from(unique.values()) };
  }

  serverHost() {
    try {
      return new URL(this.serverUrl).hostname;
    } catch {
      return '';
    }
  }

  /* ---------------------------------------------------------------- */
  /*  MQTT                                                             */
  /* ---------------------------------------------------------------- */

  ensureMqtt() {
    if (this.mqttClient) return this.mqttClient;
    if (this.mqttInitError) throw this.mqttInitError;
    if (!this.mqttOptions) {
      this.mqttInitError = new Error('mqtt drayveri uchun MQTT broker manzili (MQTT_URL) sozlanmagan');
      throw this.mqttInitError;
    }
    try {
      const options = this.mqttOptions;
      this.mqttClient = new MqttClient({
        url: options.url,
        username: options.user,
        password: options.pass,
        clientId: options.clientId,
        keepaliveSec: options.keepaliveSec || 30,
        caFile: options.caFile,
        tlsInsecure: options.tlsInsecure === true,
        log: this.log,
      });
      this.mqttClient.start();
      this.log('info', `MQTT: ulanish boshlandi (${this.mqttClient.address})`);
      return this.mqttClient;
    } catch (err) {
      this.mqttInitError = new Error(`mqtt: ${errText(err)}`);
      throw this.mqttInitError;
    }
  }

  ensureSubscriptions() {
    const topics = Array.from(this.devices.values())
      .filter((item) => item && item.driver === 'mqtt' && item.config && item.config.stateTopic)
      .map((item) => String(item.config.stateTopic).trim())
      .filter(Boolean)
      .filter((topic) => {
        if (!drivers.hasWildcard(topic)) return true;
        if (!this.warnedTopics.has(topic)) {
          this.warnedTopics.add(topic);
          this.log('error', `MQTT: "${topic}" da joker belgi (#/+) bor — bunday holat mavzusi qo'llanmaydi`);
        }
        return false;
      });
    if (!topics.length) return;
    try {
      const client = this.ensureMqtt();
      for (const topic of topics) client.subscribe(topic);
    } catch (err) {
      this.log('debug', `MQTT obunalari o'rnatilmadi: ${errText(err)}`);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Bulut bilan aloqa                                                */
  /* ---------------------------------------------------------------- */

  startCloudLoop() {
    const restart = (message) => {
      if (this.stopping) return;
      this.log('error', `${message} — 5 s dan keyin qayta ishga tushiramiz`);
      this.setTimer(() => this.startCloudLoop(), 5000);
    };
    this.cloudLoop()
      .then(() => { if (!this.stopping) restart("Bulut sikli kutilmaganda to'xtadi"); })
      .catch((err) => restart(`Bulut sikli xatosi: ${errText(err)}`));
  }

  async cloudLoop() {
    let backoffIndex = 0;
    while (!this.stopping) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const data = await this.fetchState(this.cloudVersion);
        if (this.stopping) break;
        const wasOffline = !this.cloud.online;
        if (backoffIndex > 0) this.log('info', 'Server bilan aloqa tiklandi');
        backoffIndex = 0;
        this.cloud.online = true;
        this.cloud.authFailed = false;
        this.cloud.lastError = null;
        this.cloud.lastOkAt = new Date().toISOString();
        this.applyCloudData(data);
        // Uzilishdan keyin hammasi to'liq tekshirilib, natijalar serverga yuboriladi
        if (wasOffline) this.lastForceSyncAt = 0;
        const idleTasks = this.handleTasks(Array.isArray(data.tasks) ? data.tasks : []);
        this.scheduleReconcile(0);
        this.emitStatus();
        // eslint-disable-next-line no-await-in-loop
        if (idleTasks) await this.sleep(2000);
      } catch (err) {
        if (this.stopping) break;
        const auth = Boolean(err && err.authFailed);
        const wait = auth ? AUTH_RETRY_MS : BACKOFF_MS[Math.min(backoffIndex, BACKOFF_MS.length - 1)];
        backoffIndex += 1;
        this.cloud.online = false;
        this.cloud.lastError = errText(err);
        if (auth && !this.cloud.authFailed) {
          this.log('error', "Token bekor qilingan yoki boshqa agent ulangan — relelarga tegilmaydi");
        }
        this.cloud.authFailed = auth;
        this.log(auth ? 'debug' : 'error',
          `Server bilan aloqa xatosi: ${errText(err)} — ${Math.round(wait / 1000)} s dan keyin qayta urinamiz`);
        this.emitStatus();
        // Aloqa yo'q — lokal model bo'yicha ishlashda davom etamiz
        if (!auth) this.scheduleReconcile(0);
        // eslint-disable-next-line no-await-in-loop
        await this.sleep(wait);
      }
    }
  }

  async fetchState(version) {
    const hold = this.failed.size
      ? `&hold=${FAILED_RETRY_HOLD_MS[Math.min(this.failedRounds, FAILED_RETRY_HOLD_MS.length - 1)]}`
      : '';
    const url = `${this.serverUrl}/api/bridge/state?v=${encodeURIComponent(version || '')}${hold}`;
    const res = await fetchWithTimeout(url, {
      method: 'GET',
      headers: { 'X-Bridge-Token': this.token, Accept: 'application/json', 'X-Bridge-Kind': this.kind },
    }, POLL_TIMEOUT_MS, this.controller.signal);
    if (res.status === 401 || res.status === 403) {
      const error = new Error("token noto'g'ri yoki bekor qilingan (401/403)");
      error.authFailed = true;
      throw error;
    }
    if (!res.ok) throw new Error(`/api/bridge/state javobi: HTTP ${res.status}`);
    const json = await res.json();
    if (!json || json.success !== true || !json.data) throw new Error('/api/bridge/state javob formati kutilganidek emas');
    return json.data;
  }

  /** Bulutdan kelgan suratni lokal modelga yozadi */
  applyCloudData(data) {
    const serverNow = toMs(data.serverNow);
    if (serverNow !== null) this.clockOffsetMs = serverNow - this.nowFn();
    const at = serverNow ?? this.now();

    if (Number.isFinite(data.forceSyncMs) && data.forceSyncMs >= 5000) this.forceSyncMs = data.forceSyncMs;
    this.verify = data.verify === true;
    this.rules = data.rules && typeof data.rules === 'object' ? normalizeRules(data.rules) : null;

    const list = Array.isArray(data.devices) ? data.devices : [];
    const nextDevices = new Map();
    const nextModel = new Map();
    for (const device of list) {
      const tableId = Number(device && device.tableId);
      if (!Number.isInteger(tableId) || tableId <= 0) continue;
      const { model, desired, ...config } = device;
      nextDevices.set(tableId, { ...config, tableId });
      const previous = this.cloudModel.get(tableId);
      const overrideOn = model && typeof model.overrideOn === 'boolean' ? model.overrideOn : null;
      const overrideUntil = model ? toMs(model.overrideUntil) : null;
      const overrideKey = `${overrideOn}|${overrideUntil}`;
      nextModel.set(tableId, {
        hasModel: Boolean(model),
        desired: desired === true,
        session: model ? toSession(model.session) : null,
        lastEndAt: model ? toMs(model.lastEndAt) : null,
        overrideOn,
        overrideUntil,
        overrideKey,
        // Server o'rnatilgan vaqtni yubormaydi — birinchi ko'rilgan payt dalil vaqti
        overrideSeenAt: previous && previous.overrideKey === overrideKey ? previous.overrideSeenAt : at,
        reservations: model && Array.isArray(model.reservations)
          ? model.reservations.map(toMs).filter((value) => value !== null).slice(0, 50)
          : [],
        at,
      });
    }
    this.devices = nextDevices;
    this.cloudModel = nextModel;
    this.cloudAt = at;
    const versionChanged = typeof data.version === 'string' && data.version !== this.cloudVersion;
    if (versionChanged) {
      this.log('info', `Yangi holat versiyasi: ${data.version}`);
      this.cloudVersion = data.version;
      this.ensureSubscriptions();
      this.persistNow();
    } else {
      this.schedulePersist();
    }
  }

  async sendReport(results) {
    if (!results.length || this.stopping) return;
    const payload = results.map((item) => ({
      tableId: item.tableId,
      ...(item.commandRevision ? { commandRevision: item.commandRevision } : {}),
      ok: item.ok,
      on: item.on,
      actual: item.actual,
      attempts: clampInt(item.attempts, 0, 10, 0),
      latencyMs: clampInt(item.latencyMs, 0, 60_000, 0),
      error: item.error,
    }));
    for (let offset = 0; offset < payload.length; offset += MAX_REPORT_ITEMS) {
      if (this.stopping) return;
      const chunk = payload.slice(offset, offset + MAX_REPORT_ITEMS);
      try {
        // eslint-disable-next-line no-await-in-loop
        const res = await fetchWithTimeout(`${this.serverUrl}/api/bridge/report`, {
          method: 'POST',
          headers: { 'X-Bridge-Token': this.token, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ agentVersion: this.agentVersion, results: chunk }),
        }, this.requestTimeoutMs, this.controller.signal);
        if (!res.ok) {
          // Hisobot yetmadi — bu stollar keyingi siklda qayta qo'llanib, qayta
          // hisobot qilinadi (aks holda panelda rele holati eskirib qolardi)
          for (const item of chunk) this.applied.delete(item.tableId);
          this.log('error', `Hisobot yuborilmadi: HTTP ${res.status}`);
          if (res.status === 401 || res.status === 403) return;
          continue;
        }
        await res.json().catch(() => null);
      } catch (err) {
        for (const item of chunk) this.applied.delete(item.tableId);
        this.log('error', `Hisobot yuborishda xato: ${errText(err)}`);
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Bulutdan kelgan vazifalar (LAN qidiruvi)                         */
  /* ---------------------------------------------------------------- */

  handleTasks(tasks) {
    if (!tasks.length) return false;
    let idle = true;
    for (const task of tasks) {
      if (!task || typeof task.id !== 'string' || !task.id) continue;
      if (this.doneTasks.has(task.id) || this.runningTaskId === task.id) continue;
      if (this.taskQueue.some((item) => item.id === task.id)) continue;
      if (task.type !== 'discover') {
        this.rememberTask(task.id);
        continue;
      }
      this.taskQueue.push(task);
      idle = false;
    }
    void this.pumpTasks();
    return idle;
  }

  rememberTask(id) {
    if (this.doneTasks.size >= MAX_DONE_TASKS) this.doneTasks.clear();
    this.doneTasks.add(id);
  }

  async pumpTasks() {
    if (this.discoverRunning) return;
    if (this.stopping) {
      this.taskQueue.length = 0;
      return;
    }
    const task = this.taskQueue.shift();
    if (!task) return;
    this.discoverRunning = true;
    this.runningTaskId = task.id;
    try {
      await this.runDiscoverTask(task);
    } finally {
      this.discoverRunning = false;
      this.runningTaskId = null;
    }
    void this.pumpTasks();
  }

  async runDiscoverTask(task) {
    try {
      let found = this.unsentDiscover && this.unsentDiscover.taskId === task.id ? this.unsentDiscover : null;
      if (!found) {
        const scan = await this.discoverLocal({ subnet: task.subnet });
        found = { taskId: task.id, devices: scan.devices.slice(0, 256), subnet: scan.subnet };
      }
      this.unsentDiscover = found;
      if (await this.sendDiscovered(task.id, found.devices, found.subnet)) {
        this.unsentDiscover = null;
        this.rememberTask(task.id);
      }
    } catch (err) {
      this.log('error', `Qurilmalarni qidirishda xato: ${errText(err)}`);
    }
  }

  async sendDiscovered(taskId, devices, subnet) {
    if (this.stopping) return false;
    try {
      const res = await fetchWithTimeout(`${this.serverUrl}/api/bridge/discovered`, {
        method: 'POST',
        headers: { 'X-Bridge-Token': this.token, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          taskId,
          ...(subnet ? { subnet } : {}),
          // Server faqat tanish maydonlarni qabul qiladi (uzunliklar server DTO si bilan bir xil).
          // Tarmoqdagi rele (host) ham, kompyuterga ulangan USB/COM plata ham yuboriladi
          devices: devices
            .filter((item) => item && (item.host || item.serialPort || item.serialNumber || item.driver === 'usb_hid'))
            .slice(0, 256)
            .map(discoveredForServer),
        }),
      }, this.requestTimeoutMs, this.controller.signal);
      if (!res.ok) {
        this.log('error', `Qidiruv natijasi yuborilmadi: HTTP ${res.status}`);
        return false;
      }
      return true;
    } catch (err) {
      this.log('error', `Qidiruv natijasini yuborishda xato: ${errText(err)}`);
      return false;
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Diskdagi holat                                                   */
  /* ---------------------------------------------------------------- */

  /** Parolni diskka yozish uchun tayyorlaydi: shifrlangan, ochiq yoki umuman yozilmaydi */
  sealDevice(device) {
    if (!device || device.auth === null || device.auth === undefined || device.auth === '') return device;
    if (this.secretCodec) {
      try {
        return { ...device, auth: null, authSealed: this.secretCodec.seal(String(device.auth)) };
      } catch {
        return { ...device, auth: null, authOmitted: true };
      }
    }
    if (this.cacheSecrets) return device;
    return { ...device, auth: null, authOmitted: true };
  }

  openDevice(device) {
    if (!device || typeof device !== 'object') return null;
    if (device.authSealed && this.secretCodec) {
      try {
        const { authSealed, ...rest } = device;
        return { ...rest, auth: this.secretCodec.open(String(authSealed)), authOmitted: false };
      } catch {
        return { ...device, auth: null, authSealed: undefined, authOmitted: true };
      }
    }
    if (device.authSealed) return { ...device, auth: null, authOmitted: true };
    return device;
  }

  snapshot() {
    return {
      format: STATE_FORMAT,
      savedAt: new Date().toISOString(),
      kind: this.kind,
      version: this.cloudVersion,
      forceSyncMs: this.forceSyncMs,
      verify: this.verify,
      rules: this.rules,
      clockOffsetMs: this.clockOffsetMs,
      cloudAt: this.cloudAt,
      secrets: this.secretCodec ? 'sealed' : this.cacheSecrets,
      devices: Array.from(this.devices.values()).map((device) => this.sealDevice(device)),
      cloudModel: Array.from(this.cloudModel.entries()).map(([tableId, model]) => ({ tableId, ...model })),
      view: this.view ? {
        fetchedAt: this.view.fetchedAt,
        tables: Array.from(this.view.tables.entries()).map(([tableId, entry]) => ({ tableId, ...entry })),
      } : null,
      localOverrides: Array.from(this.localOverrides.entries()).map(([tableId, entry]) => ({ tableId, ...entry })),
    };
  }

  loadState() {
    if (!this.stateFile) return;
    let data;
    try {
      data = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
    } catch {
      return; // birinchi ishga tushish
    }
    if (!data || !Array.isArray(data.devices)) return;
    if (Number.isFinite(data.forceSyncMs) && data.forceSyncMs >= 5000) this.forceSyncMs = data.forceSyncMs;
    if (typeof data.verify === 'boolean') this.verify = data.verify;
    if (Number.isFinite(data.clockOffsetMs)) this.clockOffsetMs = data.clockOffsetMs;

    this.devices = new Map();
    for (const raw of data.devices) {
      const device = this.openDevice(raw);
      if (device && Number.isInteger(device.tableId)) this.devices.set(device.tableId, device);
    }
    const omitted = Array.from(this.devices.values()).filter((item) => item.authOmitted).length;
    if (omitted && !this.authSkipWarned) {
      this.authSkipWarned = true;
      this.log('info', `${omitted} ta rele paroli diskda saqlanmagan — internet qaytguncha ular boshqarilmaydi`);
    }

    if (data.format === STATE_FORMAT) {
      this.cloudVersion = typeof data.version === 'string' ? data.version : '';
      this.cloudAt = Number.isFinite(data.cloudAt) ? data.cloudAt : 0;
      this.rules = data.rules ? normalizeRules(data.rules) : null;
      this.cloudModel = new Map();
      for (const entry of Array.isArray(data.cloudModel) ? data.cloudModel : []) {
        if (entry && Number.isInteger(entry.tableId)) {
          const { tableId, ...model } = entry;
          this.cloudModel.set(tableId, model);
        }
      }
      if (data.view && Array.isArray(data.view.tables)) {
        this.view = {
          fetchedAt: Number(data.view.fetchedAt) || 0,
          receivedAt: 0,
          tables: new Map(data.view.tables
            .filter((entry) => entry && Number.isInteger(entry.tableId))
            .map(({ tableId, ...entry }) => [tableId, entry])),
        };
      }
      this.localOverrides = new Map((Array.isArray(data.localOverrides) ? data.localOverrides : [])
        .filter((entry) => entry && Number.isInteger(entry.tableId))
        .map(({ tableId, ...entry }) => [tableId, entry]));
    } else {
      // Eski (v2.x) kesh: faqat tayyor `desired` ro'yxati — avvalgidek qo'llanadi
      const savedAt = toMs(data.savedAt) ?? 0;
      this.cloudAt = savedAt;
      this.cloudModel = new Map(data.devices
        .filter((device) => device && Number.isInteger(device.tableId))
        .map((device) => [device.tableId, {
          hasModel: false, desired: device.desired === true, session: null, lastEndAt: null,
          overrideOn: null, overrideUntil: null, overrideKey: 'null|null', overrideSeenAt: 0,
          reservations: [], at: savedAt,
        }]));
    }
    this.log('info', `Disk keshi o'qildi: ${this.devices.size} ta stol (${data.savedAt || "vaqti noma'lum"})`);
  }

  schedulePersist() {
    if (!this.stateFile || this.persistTimer) return;
    const wait = Math.max(0, PERSIST_THROTTLE_MS - (this.nowFn() - this.lastPersistAt));
    this.persistTimer = this.setTimer(() => {
      this.persistTimer = null;
      this.persistNow();
    }, wait);
  }

  /** Holatni diskka XAVFSIZ yozadi (vaqtinchalik fayl orqali almashtirish) */
  persistNow() {
    if (!this.stateFile) return;
    this.lastPersistAt = this.nowFn();
    const tmp = `${this.stateFile}.tmp`;
    let fd = null;
    try {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* yo'q */
      }
      fd = fs.openSync(tmp, 'wx', 0o600);
      fs.writeFileSync(fd, JSON.stringify(this.snapshot()));
      fs.closeSync(fd);
      fd = null;
      fs.renameSync(tmp, this.stateFile);
      if (process.platform !== 'win32') {
        try {
          fs.chmodSync(this.stateFile, 0o600);
        } catch {
          /* e'tiborsiz */
        }
      }
    } catch (err) {
      if (fd !== null) {
        try {
          fs.closeSync(fd);
        } catch {
          /* e'tiborsiz */
        }
      }
      this.log('debug', `Holat keshini saqlab bo'lmadi: ${errText(err)}`);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Holat (UI uchun)                                                 */
  /* ---------------------------------------------------------------- */

  status() {
    const now = this.now();
    const tables = Array.from(this.devices.values()).map((device) => {
      const computed = this.lastDesired.get(device.tableId) || this.computeDesired(device.tableId, now);
      const result = this.lastResults.get(device.tableId) || null;
      return {
        tableId: device.tableId,
        tableNumber: device.tableNumber ?? null,
        tableName: device.tableName ?? null,
        driver: device.driver,
        desired: computed.desired,
        source: computed.source,
        ok: result ? result.ok : null,
        actual: result ? result.actual : null,
        error: result ? result.error : null,
        at: result ? result.at : null,
        authMissing: device.authOmitted === true,
      };
    });
    return {
      running: this.running,
      kind: this.kind,
      agentVersion: this.agentVersion,
      cloud: { ...this.cloud },
      rulesKnown: this.rules !== null,
      serverNow: new Date(now).toISOString(),
      evidenceAt: this.latestEvidenceAt() ? new Date(this.latestEvidenceAt()).toISOString() : null,
      tables,
    };
  }

  emitStatus(immediate = false) {
    if (immediate || this.nowFn() - this.lastStatusAt >= STATUS_THROTTLE_MS) {
      this.lastStatusAt = this.nowFn();
      this.clearTimer(this.statusTimer);
      this.statusTimer = null;
      this.emit('status', this.status());
      return;
    }
    if (this.statusTimer) return;
    this.statusTimer = this.setTimer(() => {
      this.statusTimer = null;
      this.lastStatusAt = this.nowFn();
      this.emit('status', this.status());
    }, STATUS_THROTTLE_MS);
  }
}

module.exports = {
  LightHub,
  MAX_EVIDENCE_AGE_MS,
  MAX_PENDING_AGE_MS,
  discoveredForServer,
};
