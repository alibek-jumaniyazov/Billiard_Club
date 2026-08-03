'use strict';

/**
 * Billiard Club — bridge agenti: MINIMAL MQTT 3.1.1 KLIENTI.
 *
 * npm paketsiz — TCP soket (node:net) yoki TLS (node:tls) ustida MQTT paketlari
 * qo'lda yig'iladi/o'qiladi. Qo'llab-quvvatlanadi:
 *   CONNECT / CONNACK, PUBLISH (QoS 0 va 1) / PUBACK, SUBSCRIBE / SUBACK,
 *   PINGREQ / PINGRESP, DISCONNECT va avtomatik qayta ulanish.
 *
 * Bitta doimiy ulanish ishlatiladi. Uzilsa 1s -> 2s -> 5s -> 10s -> 30s bo'yicha
 * qayta ulanadi va barcha obunalar tiklanadi.
 *
 * Parol HECH QACHON logga chiqmaydi.
 */

const net = require('node:net');
const tls = require('node:tls');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { errText } = require('./common');

/** MQTT paket turlari */
const PACKET = {
  CONNECT: 1,
  CONNACK: 2,
  PUBLISH: 3,
  PUBACK: 4,
  SUBSCRIBE: 8,
  SUBACK: 9,
  PINGREQ: 12,
  PINGRESP: 13,
  DISCONNECT: 14,
};

/** Qayta ulanish bosqichlari (ms) */
const RECONNECT_MS = [1000, 2000, 5000, 10000, 30000];

/** CONNACK kutish muddati */
const CONNACK_TIMEOUT_MS = 10000;

/**
 * Eslab qolinadigan holat mavzulari soni.
 * Broker `#` ga o'xshash keng obunada juda ko'p mavzu yuborishi mumkin —
 * xotira cheksiz o'smasin, eng eski yozuv chiqarib tashlanadi.
 */
const MAX_STATES = 500;

const EMPTY = Buffer.alloc(0);

/* ------------------------------------------------------------------ */
/*  Paketlarni yig'ish                                                 */
/* ------------------------------------------------------------------ */

/** MQTT "remaining length" (o'zgaruvchan uzunlik) kodlash */
function encodeLength(length) {
  const bytes = [];
  let value = length;
  do {
    let byte = value % 128;
    value = Math.floor(value / 128);
    if (value > 0) byte |= 128;
    bytes.push(byte);
  } while (value > 0);
  return Buffer.from(bytes);
}

/** UTF-8 satr: 2 bayt uzunlik + matn */
function encodeString(text) {
  const body = Buffer.from(String(text), 'utf8');
  const head = Buffer.allocUnsafe(2);
  head.writeUInt16BE(body.length, 0);
  return Buffer.concat([head, body]);
}

function uint16(value) {
  const buffer = Buffer.allocUnsafe(2);
  buffer.writeUInt16BE(value & 0xffff, 0);
  return buffer;
}

function packet(type, flags, body) {
  return Buffer.concat([Buffer.from([(type << 4) | (flags & 0x0f)]), encodeLength(body.length), body]);
}

/** CONNACK qaytargan xato kodini o'zbekcha izohlaydi */
function connackText(code) {
  switch (code) {
    case 1:
      return "protokol versiyasi qo'llab-quvvatlanmaydi";
    case 2:
      return 'clientId rad etildi';
    case 3:
      return 'broker hozir mavjud emas';
    case 4:
      return "login yoki parol noto'g'ri";
    case 5:
      return 'ruxsat berilmadi';
    default:
      return `xato kodi ${code}`;
  }
}

/** mqtt://host:1883 | mqtts://host:8883 | host:1883 -> ulanish parametrlari */
function parseUrl(raw) {
  const text = String(raw || '').trim();
  if (!text) throw new Error("MQTT_URL ko'rsatilmagan");

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `mqtt://${text}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error("MQTT_URL noto'g'ri formatda");
  }

  const scheme = url.protocol.replace(':', '').toLowerCase();
  if (!['mqtt', 'mqtts', 'tcp', 'ssl', 'tls'].includes(scheme)) {
    throw new Error(`MQTT_URL sxemasi qo'llab-quvvatlanmaydi: ${scheme}://`);
  }
  const secure = scheme === 'mqtts' || scheme === 'ssl' || scheme === 'tls';
  const port = url.port ? Number(url.port) : secure ? 8883 : 1883;
  if (!url.hostname) throw new Error("MQTT_URL da broker manzili yo'q");

  return {
    host: url.hostname,
    port,
    secure,
    username: url.username ? decodeURIComponent(url.username) : '',
    password: url.password ? decodeURIComponent(url.password) : '',
  };
}

/* ------------------------------------------------------------------ */
/*  Klient                                                             */
/* ------------------------------------------------------------------ */

class MqttClient {
  /**
   * @param {object} options { url, username, password, clientId, keepaliveSec, log }
   */
  constructor(options) {
    const parsed = parseUrl(options.url);

    this.host = parsed.host;
    this.port = parsed.port;
    this.secure = parsed.secure;
    this.username = String(options.username || parsed.username || '');
    this.password = String(options.password || parsed.password || '');
    this.keepaliveSec = Math.max(10, Math.min(300, Number(options.keepaliveSec) || 30));
    this.clientId = String(
      options.clientId || `bcbridge-${crypto.randomBytes(4).toString('hex')}`,
    ).slice(0, 60);
    this.log = typeof options.log === 'function' ? options.log : () => {};

    // TLS: standart holatda sertifikat TEKSHIRILADI (_tlsOptions ga qarang)
    this.tlsInsecure = options.tlsInsecure === true;
    this.tlsWarned = false;
    this.tlsCa = null;
    if (options.caFile) {
      try {
        this.tlsCa = fs.readFileSync(String(options.caFile));
      } catch (err) {
        throw new Error(`MQTT_CA faylini o'qib bo'lmadi (${options.caFile}) — ${errText(err)}`);
      }
    }

    this.socket = null;
    this.connected = false;
    this.closed = false;
    this.buffer = EMPTY;
    this.packetId = 0;
    this.reconnectIndex = 0;
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.connackTimer = null;
    /** Brokerdan oxirgi paket KELGAN vaqt (broker tirikligini tekshirish uchun) */
    this.lastPacketAt = 0;
    /**
     * Brokerga oxirgi paket YUBORILGAN vaqt.
     * Keepalive standart bo'yicha CHIQUVCHI trafik bo'yicha hisoblanadi: broker
     * faol bo'lsa ham biz jim tursak, u klientni 1.5×keepalive dan keyin uzadi.
     */
    this.lastSentAt = 0;

    /** packetId -> { resolve, reject, timer } */
    this.pending = new Map();
    /** Obunalar (qayta ulanishda tiklanadi) */
    this.subscriptions = new Set();
    /** topic -> { payload, at } — oxirgi kelgan holat xabarlari */
    this.states = new Map();
    /** Ulanishni kutayotganlar */
    this.waiters = new Set();
    /** topic -> Set<{ resolve, timer }> — YANGI xabar kelishini kutayotganlar */
    this.messageWaiters = new Map();
  }

  /** Ulanishni boshlaydi (avtomatik qayta ulanish bilan) */
  start() {
    if (this.closed) return;
    this._open();
  }

  /** Broker manzili — logga chiqarish uchun (parolsiz) */
  get address() {
    return `${this.secure ? 'mqtts' : 'mqtt'}://${this.host}:${this.port}`;
  }

  /**
   * Xabar yuboradi. QoS 1 da PUBACK kutiladi.
   * Ulanish yo'q bo'lsa `timeoutMs` gacha kutadi, keyin xato beradi.
   */
  async publish(topic, payload, options = {}) {
    const qos = options.qos === 1 ? 1 : 0;
    const retain = options.retain === true;
    const timeoutMs = Number(options.timeoutMs) || 5000;

    await this.waitConnected(timeoutMs);

    const packetId = qos > 0 ? this._nextPacketId() : 0;
    const parts = [encodeString(topic)];
    if (qos > 0) parts.push(uint16(packetId));
    parts.push(Buffer.from(String(payload), 'utf8'));

    const flags = (qos << 1) | (retain ? 1 : 0);
    await this._write(packet(PACKET.PUBLISH, flags, Buffer.concat(parts)));

    if (qos === 0) return;

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(packetId);
        reject(new Error('MQTT: broker PUBACK yubormadi (timeout)'));
      }, timeoutMs);
      this.pending.set(packetId, { resolve, reject, timer });
    });
  }

  /** Holat mavzusiga obuna bo'ladi (takroriy chaqiruv zararsiz) */
  subscribe(topic) {
    const name = String(topic || '').trim();
    if (!name || this.subscriptions.has(name)) return;
    this.subscriptions.add(name);
    if (this.connected) this._sendSubscribe(name);
  }

  /**
   * Oxirgi kelgan holat xabari (topic bo'yicha) yoki null.
   *
   * `maxAgeMs` berilsa — undan ESKI qiymat qaytarilmaydi: bir necha soat oldingi
   * xabarni "haqiqiy holat" deb qabul qilsak, majburiy sinxronizatsiya buyruq
   * yubormay qo'yadi va stol butun kech qorong'i qolishi mumkin.
   */
  lastMessage(topic, maxAgeMs) {
    const entry = this.states.get(String(topic || '').trim());
    if (!entry) return null;
    const limit = Number(maxAgeMs);
    if (Number.isFinite(limit) && limit > 0 && Date.now() - entry.at > limit) return null;
    return entry.payload;
  }

  /**
   * `since` (Date.now() belgisi) dan KEYIN kelgan holat xabarini qaytaradi.
   * Bunday xabar hali kelmagan bo'lsa `waitMs` gacha kutadi, kelmasa null.
   *
   * Bu publishdan darhol keyin holatni o'qishda kerak: aks holda ESKI (buyruqdan
   * oldingi) qiymat `actual` bo'lib serverga ketadi — panelda chiroq "o'chiq"
   * ko'rinadi va soxta 'drift' yoziladi.
   */
  waitMessage(topic, since, waitMs) {
    const name = String(topic || '').trim();
    if (!name) return Promise.resolve(null);

    const sinceAt = Number.isFinite(Number(since)) ? Number(since) : 0;
    const entry = this.states.get(name);
    if (entry && entry.at >= sinceAt) return Promise.resolve(entry.payload);

    const ms = Number(waitMs) || 0;
    if (ms <= 0) return Promise.resolve(null);

    return new Promise((resolve) => {
      const record = { resolve, timer: null };
      record.timer = setTimeout(() => {
        const list = this.messageWaiters.get(name);
        if (list) {
          list.delete(record);
          if (!list.size) this.messageWaiters.delete(name);
        }
        resolve(null);
      }, ms);
      if (typeof record.timer.unref === 'function') record.timer.unref();

      const list = this.messageWaiters.get(name) || new Set();
      list.add(record);
      this.messageWaiters.set(name, list);
    });
  }

  /** Ulanishni `ms` gacha kutadi; ulanmasa xato beradi */
  waitConnected(ms) {
    if (this.connected) return Promise.resolve();
    if (this.closed) return Promise.reject(new Error('MQTT klienti yopilgan'));

    return new Promise((resolve, reject) => {
      const entry = {
        resolve,
        reject,
        timer: setTimeout(() => {
          this.waiters.delete(entry);
          reject(new Error(`MQTT brokerga ulanmagan (${this.address})`));
        }, ms),
      };
      this.waiters.add(entry);
    });
  }

  /** Toza to'xtatish: DISCONNECT yuboriladi va soket yopiladi */
  close() {
    if (this.closed) return;
    this.closed = true;
    this._clearTimers();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this._rejectPending('MQTT klienti yopildi');
    this._clearStates();

    if (this.socket) {
      try {
        if (this.connected) this.socket.write(packet(PACKET.DISCONNECT, 0, EMPTY));
        this.socket.end();
        this.socket.destroy();
      } catch {
        /* e'tiborsiz */
      }
      this.socket = null;
    }
    this.connected = false;
  }

  /* ---------------------------------------------------------------- */
  /*  Ichki: ulanish                                                   */
  /* ---------------------------------------------------------------- */

  /**
   * TLS (mqtts://) parametrlari.
   *
   * Sertifikat tekshiruvi STANDART holatda YOQILGAN: aks holda klub tarmog'idagi
   * soxta broker o'zini haqiqiy broker deb ko'rsatib CONNECT paketidagi
   * MQTT_USER/MQTT_PASS ni ochiq o'qib olardi va TLS ning ma'nosi qolmasdi.
   * O'z-o'zidan imzolangan sertifikat ishlatilsa — `MQTT_CA` da CA faylini
   * ko'rsating; oxirgi chora sifatida `MQTT_TLS_INSECURE=1` (bir marta
   * ogohlantirish logga yoziladi).
   */
  _tlsOptions() {
    const options = {
      host: this.host,
      port: this.port,
      servername: this.host,
      rejectUnauthorized: !this.tlsInsecure,
    };
    if (this.tlsCa) options.ca = this.tlsCa;
    if (this.tlsInsecure && !this.tlsWarned) {
      this.tlsWarned = true;
      this.log(
        'error',
        'MQTT: TLS sertifikati TEKSHIRILMAYDI (MQTT_TLS_INSECURE=1) — broker paroli xavf ostida',
      );
    }
    return options;
  }

  _open() {
    if (this.closed || this.socket) return;

    const onReady = () => this._sendConnect();
    let socket;
    try {
      socket = this.secure ? tls.connect(this._tlsOptions(), onReady) : net.connect({ host: this.host, port: this.port }, onReady);
    } catch (err) {
      this._onSocketDown(errText(err));
      return;
    }

    this.socket = socket;
    this.buffer = EMPTY;
    socket.setNoDelay(true);
    socket.on('data', (chunk) => this._onData(chunk));
    socket.on('error', (err) => this._onSocketDown(errText(err)));
    socket.on('close', () => this._onSocketDown('ulanish yopildi'));
  }

  _sendConnect() {
    let flags = 0x02; // clean session
    if (this.username) flags |= 0x80;
    if (this.username && this.password) flags |= 0x40;

    const parts = [
      encodeString('MQTT'),
      Buffer.from([4, flags]),
      uint16(this.keepaliveSec),
      encodeString(this.clientId),
    ];
    if (this.username) parts.push(encodeString(this.username));
    if (this.username && this.password) parts.push(encodeString(this.password));

    try {
      this._rawWrite(packet(PACKET.CONNECT, 0, Buffer.concat(parts)));
    } catch (err) {
      this._onSocketDown(errText(err));
      return;
    }

    this.connackTimer = setTimeout(() => {
      this._onSocketDown('CONNACK kelmadi');
    }, CONNACK_TIMEOUT_MS);
  }

  _onConnected() {
    if (this.connackTimer) {
      clearTimeout(this.connackTimer);
      this.connackTimer = null;
    }
    this.connected = true;
    this.reconnectIndex = 0;
    this.lastPacketAt = Date.now();
    if (!this.lastSentAt) this.lastSentAt = Date.now();
    this.log('info', `MQTT: brokerga ulandi (${this.address})`);

    // Obunalarni tiklaymiz
    for (const topic of this.subscriptions) this._sendSubscribe(topic);

    // Keepalive: tekshiruv keepalive/4 da, PINGREQ esa keepalive/2 jimlikda yuboriladi.
    // (Tekshiruv ham keepalive/2 bo'lsa, fazasi mos kelmay qolganda ikki PINGREQ orasi
    //  keepalive gacha cho'ziladi va broker chegarasiga xavfli darajada yaqinlashadi.)
    this.pingTimer = setInterval(() => this._keepalive(), Math.max(1000, (this.keepaliveSec * 1000) / 4));
    if (typeof this.pingTimer.unref === 'function') this.pingTimer.unref();

    for (const entry of this.waiters) {
      clearTimeout(entry.timer);
      entry.resolve();
    }
    this.waiters.clear();
  }

  _keepalive() {
    if (!this.connected || !this.socket) return;
    const now = Date.now();

    // 1) Broker tirikmi — bu KELGAN paketlar bo'yicha alohida tekshiriladi
    if (now - this.lastPacketAt > this.keepaliveSec * 2000) {
      this._onSocketDown('broker javob bermayapti (keepalive)');
      return;
    }

    // 2) PINGREQ esa CHIQUVCHI paketlar bo'yicha: broker faol bo'lsa ham biz jim
    //    tursak, u klientni 1.5×keepalive dan keyin uzib yuboradi
    if (now - this.lastSentAt < (this.keepaliveSec * 1000) / 2) return;

    try {
      this._rawWrite(packet(PACKET.PINGREQ, 0, EMPTY));
    } catch (err) {
      this._onSocketDown(errText(err));
    }
  }

  _sendSubscribe(topic) {
    try {
      const body = Buffer.concat([uint16(this._nextPacketId()), encodeString(topic), Buffer.from([0])]);
      this._rawWrite(packet(PACKET.SUBSCRIBE, 0x02, body));
      this.log('debug', `MQTT: obuna — ${topic}`);
    } catch (err) {
      this.log('debug', `MQTT: obuna bo'lmadi (${topic}) — ${errText(err)}`);
    }
  }

  /** Soketga yozadi va chiquvchi keepalive belgisini yangilaydi (PINGREQ shu bo'yicha) */
  _rawWrite(data) {
    if (!this.socket) throw new Error('MQTT: soket yopilgan');
    this.socket.write(data);
    this.lastSentAt = Date.now();
  }

  _onSocketDown(reason) {
    if (this.closed) return;

    const wasConnected = this.connected;
    this.connected = false;
    this._clearTimers();

    if (this.socket) {
      try {
        this.socket.removeAllListeners();
        this.socket.destroy();
      } catch {
        /* e'tiborsiz */
      }
      this.socket = null;
    }
    this.buffer = EMPTY;
    this._rejectPending(`MQTT ulanishi uzildi (${reason})`);
    // Uzilish paytida kelgan holat xabarlari eskiradi (qayta ulanishda retain
    // qiymatlar baribir yangidan keladi) — eskisiga tayanib qolmaymiz
    this._clearStates();

    for (const entry of this.waiters) {
      clearTimeout(entry.timer);
      entry.reject(new Error(`MQTT brokerga ulanmagan — ${reason}`));
    }
    this.waiters.clear();

    if (wasConnected) this.log('error', `MQTT: ${reason}`);
    this._scheduleReconnect();
  }

  _scheduleReconnect() {
    if (this.closed || this.reconnectTimer) return;
    const wait = RECONNECT_MS[Math.min(this.reconnectIndex, RECONNECT_MS.length - 1)];
    this.reconnectIndex += 1;

    this.log('debug', `MQTT: ${Math.round(wait / 1000)}s dan keyin qayta ulanamiz`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this._open();
    }, wait);
    if (typeof this.reconnectTimer.unref === 'function') this.reconnectTimer.unref();
  }

  _clearTimers() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.connackTimer) {
      clearTimeout(this.connackTimer);
      this.connackTimer = null;
    }
  }

  _rejectPending(message) {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error(message));
    }
    this.pending.clear();
  }

  /** Holat keshini va xabar kutayotganlarni tozalaydi (uzilish/yopilishda) */
  _clearStates() {
    this.states.clear();
    for (const [, list] of this.messageWaiters) {
      for (const record of list) {
        clearTimeout(record.timer);
        record.resolve(null); // holat noma'lum — bu "o'chiq" degani EMAS
      }
    }
    this.messageWaiters.clear();
  }

  _nextPacketId() {
    this.packetId = (this.packetId % 65535) + 1;
    return this.packetId;
  }

  _write(data) {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.connected) {
        reject(new Error('MQTT brokerga ulanmagan'));
        return;
      }
      this.lastSentAt = Date.now(); // chiquvchi paket — keepalive hisobi shu bo'yicha
      this.socket.write(data, (err) => {
        if (err) reject(new Error(`MQTT: yozib bo'lmadi — ${errText(err)}`));
        else resolve();
      });
    });
  }

  /** Shu mavzuni kutayotganlarni uyg'otadi (publishdan keyingi holatni o'qish uchun) */
  _notifyMessage(topic, payload) {
    const list = this.messageWaiters.get(topic);
    if (!list) return;
    this.messageWaiters.delete(topic);
    for (const record of list) {
      clearTimeout(record.timer);
      record.resolve(payload);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Ichki: kelgan baytlarni o'qish                                   */
  /* ---------------------------------------------------------------- */

  _onData(chunk) {
    this.lastPacketAt = Date.now();
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;

    // Bufferda nechta to'liq paket bo'lsa — hammasini qayta ishlaymiz
    for (;;) {
      if (this.buffer.length < 2) return;

      let multiplier = 1;
      let length = 0;
      let index = 1;
      let byte = 0;
      do {
        if (index >= this.buffer.length) return; // paket hali to'liq emas
        byte = this.buffer[index];
        index += 1;
        length += (byte & 127) * multiplier;
        multiplier *= 128;
        if (multiplier > 128 * 128 * 128) {
          this._onSocketDown("paket uzunligi noto'g'ri");
          return;
        }
      } while ((byte & 128) !== 0);

      const total = index + length;
      if (this.buffer.length < total) return;

      const header = this.buffer[0];
      const body = this.buffer.subarray(index, total);
      this.buffer = this.buffer.subarray(total);

      try {
        this._handlePacket(header >> 4, header & 0x0f, body);
      } catch (err) {
        this.log('debug', `MQTT: paketni o'qishda xato — ${errText(err)}`);
      }
    }
  }

  _handlePacket(type, flags, body) {
    switch (type) {
      case PACKET.CONNACK: {
        const code = body.length >= 2 ? body[1] : 255;
        if (code !== 0) {
          this.log('error', `MQTT: brokerga ulanib bo'lmadi — ${connackText(code)}`);
          this._onSocketDown(connackText(code));
          return;
        }
        this._onConnected();
        return;
      }

      case PACKET.PUBLISH: {
        const qos = (flags >> 1) & 3;
        if (body.length < 2) return;
        const topicLength = body.readUInt16BE(0);
        let offset = 2 + topicLength;
        if (body.length < offset) return;
        const topic = body.subarray(2, offset).toString('utf8');

        let packetId = 0;
        if (qos > 0) {
          if (body.length < offset + 2) return;
          packetId = body.readUInt16BE(offset);
          offset += 2;
        }
        const payload = body.subarray(offset).toString('utf8');
        // Yangi qiymat oxirga tushsin: hajm chegarasida eng ESKI yozuv chiqariladi
        this.states.delete(topic);
        this.states.set(topic, { payload, at: Date.now() });
        if (this.states.size > MAX_STATES) {
          const oldest = this.states.keys().next();
          if (!oldest.done) this.states.delete(oldest.value);
        }
        this._notifyMessage(topic, payload);
        this.log('debug', `MQTT: holat keldi — ${topic} = ${payload.slice(0, 60)}`);

        if (qos === 1 && this.socket) {
          try {
            this._rawWrite(packet(PACKET.PUBACK, 0, uint16(packetId)));
          } catch {
            /* e'tiborsiz */
          }
        }
        return;
      }

      case PACKET.PUBACK: {
        if (body.length < 2) return;
        const packetId = body.readUInt16BE(0);
        const entry = this.pending.get(packetId);
        if (entry) {
          clearTimeout(entry.timer);
          this.pending.delete(packetId);
          entry.resolve();
        }
        return;
      }

      case PACKET.SUBACK:
      case PACKET.PINGRESP:
        // Qo'shimcha ish talab qilinmaydi — lastPacketAt yangilandi
        return;

      default:
        return;
    }
  }
}

module.exports = { MqttClient, parseUrl };
