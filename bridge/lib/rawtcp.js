'use strict';

/**
 * Billiard Club — bridge agenti: XOM TCP drayveri.
 *
 * Ba'zi arzon rele platalari (masalan ESP8266 asosidagi "TCP relay board")
 * hech qanday protokolsiz, oddiy baytlar ketma-ketligini kutadi:
 *   yoqish  -> A0 01 01 A2
 *   o'chirish -> A0 01 00 A1
 *
 * Baytlar stol sozlamalarida `onHex`/`offHex` yoki `onAscii`/`offAscii`
 * ko'rinishida kiritiladi. `expectHex` berilsa — javobning bosh baytlari
 * tekshiriladi (qurilma tasdiqlaganini bilish uchun).
 *
 * npm bog'liqligi YO'Q — faqat node:net.
 */

const net = require('node:net');
const { errText, splitHostPort } = require('./common');

/** Port ko'rsatilmagan bo'lsa ishlatiladigan standart port */
const DEFAULT_PORT = 8080;

/**
 * Baytlarni yuboradi va (kerak bo'lsa) javobni tekshiradi.
 * @param {object} options { host, data: Buffer, expect: Buffer|null, timeoutMs, signal }
 */
function send(options) {
  const { host: hostname, port } = splitHostPort(options.host, DEFAULT_PORT);
  if (!hostname) return Promise.reject(new Error("tcp: qurilma manzili ko'rsatilmagan"));

  const data = options.data;
  if (!Buffer.isBuffer(data) || !data.length) {
    return Promise.reject(new Error('tcp: yuboriladigan baytlar tayyorlanmagan'));
  }

  const expect = Buffer.isBuffer(options.expect) && options.expect.length ? options.expect : null;
  const timeoutMs = Number(options.timeoutMs) || 3000;

  return new Promise((resolve, reject) => {
    let settled = false;
    let received = Buffer.alloc(0);
    /** Baytlar HAQIQATAN chiqib ketdimi (yozuv callbacki xatosiz tugadimi) */
    let wrote = false;

    const socket = net.connect({ host: hostname, port });
    const signal = options.signal;

    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      try {
        socket.destroy();
      } catch {
        /* e'tiborsiz */
      }
      if (err) reject(err);
      else resolve();
    };

    const timer = setTimeout(
      () => finish(new Error(expect ? 'tcp: javob kelmadi (timeout)' : 'tcp: ulanish timeouti')),
      timeoutMs,
    );
    const onAbort = () => finish(new Error("tcp: so'rov to'xtatildi"));

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    socket.setNoDelay(true);
    socket.on('connect', () => {
      socket.write(data, (err) => {
        if (err) {
          finish(new Error(`tcp: ${errText(err)}`));
          return;
        }
        wrote = true;
        // Javob kutilmasa — baytlar chiqib ketishi bilan tugatamiz
        if (!expect) {
          try {
            socket.end();
          } catch {
            /* e'tiborsiz */
          }
          finish(null);
        }
      });
    });

    socket.on('data', (chunk) => {
      if (!expect) return;
      received = received.length ? Buffer.concat([received, chunk]) : chunk;
      if (received.length < expect.length) return;
      if (received.subarray(0, expect.length).equals(expect)) finish(null);
      else finish(new Error('tcp: qurilma kutilgan javobni qaytarmadi'));
    });

    socket.on('error', (err) => finish(new Error(`tcp: ${errText(err)}`)));
    socket.on('close', () => {
      if (expect) {
        finish(new Error('tcp: ulanish javobsiz yopildi'));
        return;
      }
      // Yozuv tugallanmagan bo'lsa yopilish MUVAFFAQIYAT emas: aks holda qurilma
      // ulanishni darhol uzganda "chiroq yondi" deb hisoblab qo'yardik
      finish(wrote ? null : new Error("tcp: ulanish baytlar yuborilmasdan yopildi"));
    });
  });
}

module.exports = { send, DEFAULT_PORT };
