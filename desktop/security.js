'use strict';

const resolveAppUrl = (value, packaged) => {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && local && !packaged))) {
    throw new Error('Server manzili HTTPS bo‘lishi kerak (HTTP faqat lokal development uchun).');
  }
  return url.href.replace(/\/+$/, '');
};

const sameOrigin = (value, origin) => {
  try { return new URL(value).origin === origin && ['https:', 'http:'].includes(new URL(value).protocol); }
  catch { return false; }
};

const safeExternal = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch { return false; }
};

const trustedSender = (event, win, origin) => !!event && !!win && !win.isDestroyed() &&
  event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame &&
  sameOrigin(event.senderFrame?.url, origin);

/**
 * Yorliq (.lnk) yoki buyruq qatori orqali dasturga "kirib olish" kalitlari:
 * masofadan disk raskadka (sahifani boshqarish, tokenlarni o'qish), sertifikat
 * tekshiruvini o'chirish, proksi/DNS bilan trafikni soxta serverga burish,
 * boshqa profil papkasi, kengaytma yuklash, sandbox'ni o'chirish.
 * Node darajasidagi `--inspect` va NODE_OPTIONS ni Electron fuses yopadi.
 */
const DANGEROUS_SWITCHES = [
  'remote-debugging-port',
  'remote-debugging-pipe',
  'remote-debugging-address',
  'remote-allow-origins',
  'inspect',
  'inspect-brk',
  'inspect-port',
  'js-flags',
  'disable-web-security',
  'ignore-certificate-errors',
  'ignore-certificate-errors-spki-list',
  'allow-insecure-localhost',
  'unsafely-treat-insecure-origin-as-secure',
  'proxy-server',
  'proxy-pac-url',
  'host-resolver-rules',
  'host-rules',
  'user-data-dir',
  'load-extension',
  'no-sandbox',
  'disable-site-isolation-trials',
];

/** Birinchi topilgan xavfli kalit yoki null — `hasSwitch` = app.commandLine.hasSwitch */
const findDangerousSwitch = (hasSwitch) => DANGEROUS_SWITCHES.find((name) => hasSwitch(name)) ?? null;

module.exports = { DANGEROUS_SWITCHES, findDangerousSwitch, resolveAppUrl, sameOrigin, safeExternal, trustedSender };
