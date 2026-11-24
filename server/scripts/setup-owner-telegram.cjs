'use strict';

/**
 * Klub egalari botini sozlash: webhook, buyruqlar menyusi (uz/ru) va bot tavsifi.
 *   npm run owner:telegram:setup -- https://sizning-domen.uz
 *
 * STANDART — MAVJUD BOT: OWNER_TELEGRAM_* bo'sh bo'lsa, ro'yxatdan o'tishda telefonni
 * tasdiqlaydigan bot (TRIAL_TELEGRAM_*, u ham bo'lmasa TELEGRAM_BOT_TOKEN) sozlanadi:
 * webhook o'sha marshrutda qoladi, unga buyruqlar menyusi va umumiy tavsif qo'shiladi.
 * ALOHIDA BOT: OWNER_TELEGRAM_* to'ldirilsa (boshqa token) — o'z webhooki o'rnatiladi.
 * Avval server deploy qilingan va migratsiya bajarilgan bo'lishi kerak.
 */
const path = require('node:path');
const { isIP } = require('node:net');

class SetupError extends Error {}

const TRIAL_PATH = '/api/public/trial-verification/telegram/webhook';
const OWNER_PATH = '/api/public/owner-telegram/webhook';

const COMMANDS = {
  uz: [
    { command: 'hisobot', description: 'Kechagi kunlik hisobot' },
    { command: 'bugun', description: 'Bugun hozirgacha' },
    { command: 'hozir', description: 'Hozir qaysi stollar band' },
    { command: 'hafta', description: "So'nggi 7 kun" },
    { command: 'stop', description: "Xabarlarni to'xtatish" },
    { command: 'yordam', description: 'Yordam' },
  ],
  ru: [
    { command: 'hisobot', description: 'Отчёт за вчера' },
    { command: 'bugun', description: 'Сегодня до текущего момента' },
    { command: 'hozir', description: 'Какие столы заняты сейчас' },
    { command: 'hafta', description: 'Последние 7 дней' },
    { command: 'stop', description: 'Остановить уведомления' },
    { command: 'yordam', description: 'Помощь' },
  ],
};

const DESCRIPTION = {
  shared: {
    uz: "Billiard Club boti: saytda ro'yxatdan o'tishda telefonni tasdiqlaydi va klub egasiga har kuni hisobot yuboradi — tushum, o'yinlar, kassa, qarzlar; bekor qilingan o'yin, chegirma va smena yakuni haqida darhol xabar beradi.",
    ru: 'Бот Billiard Club: подтверждает номер при регистрации на сайте и каждый день присылает владельцу клуба отчёт — выручка, игры, касса, долги; мгновенно сообщает об отменах игр, скидках и закрытии смены.',
  },
  separate: {
    uz: "Billiard Club — klub egasi uchun hisobot boti: har kuni tushum, o'yinlar, kassa va qarzlar; bekor qilingan o'yin, chegirma va smena yakuni haqida darhol xabar. Ulash: ilovadagi «Telegram bot» bo'limi.",
    ru: 'Billiard Club — бот отчётов для владельца клуба: ежедневно выручка, игры, касса и долги; мгновенно об отменах игр, скидках и закрытии смены. Подключение: раздел «Telegram-бот» в приложении.',
  },
};
const SHORT = {
  uz: 'Klubingiz hisobotlari va muhim hodisalar — telefoningizda.',
  ru: 'Отчёты клуба и важные события — у вас в телефоне.',
};

function originOf(origin) {
  let url;
  try {
    url = new URL(origin);
  } catch {
    throw new SetupError('Saytning HTTPS manzilini kiriting: npm run owner:telegram:setup -- https://sizning-domen.uz');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new SetupError('Faqat HTTPS origin kiriting: login/parol, path, query va hash bo‘lmasin.');
  }
  const hostname = url.hostname.replace(/\.$/, '').toLowerCase();
  if (
    isIP(hostname.replace(/^\[|\]$/g, '')) ||
    !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*$/.test(hostname) ||
    /(?:^|\.)(?:localhost|local|internal|test|invalid|example)$/.test(hostname)
  ) {
    throw new SetupError('Internetdan ochiladigan ommaviy domen kerak; localhost, ichki domen va IP manzil mos emas.');
  }
  if (!['', '443', '80', '88', '8443'].includes(url.port)) {
    throw new SetupError('Telegram webhook uchun 443, 80, 88 yoki 8443 portini ishlating.');
  }
  return url.origin;
}

/** Umumiy botda — ro'yxatdan o'tish marshruti, alohida botda — egalar marshruti */
function webhookUrl(origin, shared = true) {
  return `${originOf(origin)}${shared ? TRIAL_PATH : OWNER_PATH}`;
}

function configuration(env) {
  const trialToken = env.TRIAL_TELEGRAM_BOT_TOKEN?.trim() || env.TELEGRAM_BOT_TOKEN?.trim() || '';
  const ownToken = env.OWNER_TELEGRAM_BOT_TOKEN?.trim() || '';
  const shared = !ownToken || ownToken === trialToken;
  const token = shared ? trialToken : ownToken;
  const prefix = shared ? 'TRIAL_TELEGRAM' : 'OWNER_TELEGRAM';
  const username = (env[`${prefix}_BOT_USERNAME`] || '').trim().replace(/^@/, '');
  const secret = (env[`${prefix}_WEBHOOK_SECRET`] || '').trim();
  if (!/^[0-9]+:[A-Za-z0-9_-]{20,}$/.test(token)) {
    throw new SetupError(shared
      ? 'server/.env ga ro‘yxatdan o‘tish botining tokenini kiriting: TRIAL_TELEGRAM_BOT_TOKEN (yoki TELEGRAM_BOT_TOKEN).'
      : 'server/.env ga OWNER_TELEGRAM_BOT_TOKEN kiriting (BotFather bergan token).');
  }
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(secret)) {
    throw new SetupError(`${prefix}_WEBHOOK_SECRET 32–256 ta A-Z, a-z, 0-9, _ yoki - belgisidan iborat bo‘lsin.`);
  }
  if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username)) {
    throw new SetupError(`${prefix}_BOT_USERNAME ga botning username qiymatini kiriting (@ belgisiz).`);
  }
  return { token, username, secret, shared, prefix };
}

async function setupOwnerTelegram(origin, env = process.env, fetchImpl = fetch) {
  const { token, username, secret, shared, prefix } = configuration(env);
  const url = webhookUrl(origin, shared);

  async function telegram(method, payload = {}) {
    let response;
    let body;
    try {
      response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        redirect: 'error',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });
      body = await response.json();
    } catch {
      // Fetch xatosida URL (token bilan) bo'lishi mumkin — chiqarmaymiz
      throw new SetupError(`${method}: Telegram bilan bog‘lanib bo‘lmadi. Tarmoqni tekshiring va qayta urinib ko‘ring.`);
    }
    if (!response.ok || body?.ok !== true) {
      throw new SetupError(`${method}: Telegram so‘rovni rad etdi. Bot tokeni va server sozlamalarini tekshiring.`);
    }
    return body.result;
  }

  const previous = await telegram('getWebhookInfo');
  if (!previous || typeof previous.url !== 'string') {
    throw new SetupError('getWebhookInfo: Telegram javobi kutilgan formatda emas.');
  }
  if (previous.url && previous.url !== url) {
    throw new SetupError(shared
      ? 'Bu botda boshqa webhook bor. U o‘zgartirilmadi. Avval ro‘yxatdan o‘tish botini sozlang: npm run trial:telegram:setup -- https://DOMEN'
      : 'Bu botda boshqa webhook bor. U o‘zgartirilmadi. Klub egalari uchun BotFather orqali alohida bot yarating.');
  }

  const bot = await telegram('getMe');
  if (bot?.is_bot !== true || typeof bot.username !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(bot.username)) {
    throw new SetupError('getMe: Telegram bot username qiymatini qaytarmadi.');
  }
  if (username.toLowerCase() !== bot.username.toLowerCase()) {
    throw new SetupError(`server/.env da ${prefix}_BOT_USERNAME=${bot.username} qilib saqlang, serverni qayta ishga tushiring va buyruqni takrorlang. Webhook o‘zgartirilmadi.`);
  }

  // Deploy qilingan marshrut va sir mosligini bot o'zgartirilishidan OLDIN tekshiramiz.
  // Bo'sh yangilanish hech narsa yozmaydi va hech kimga xabar yubormaydi.
  try {
    const probe = await fetchImpl(url, {
      method: 'POST',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret },
      body: '{}',
      signal: AbortSignal.timeout(15_000),
    });
    const result = await probe.json();
    if (!probe.ok || result?.ok !== true) throw new Error('Not ready');
  } catch {
    throw new SetupError(`Server webhooki tayyor emas. Deploy, migratsiya, HTTPS/proxy va ${prefix}_* sozlamalarini tekshiring. Telegram webhooki o‘zgartirilmadi.`);
  }

  const configured = await telegram('setWebhook', {
    url,
    secret_token: secret,
    allowed_updates: ['message', 'my_chat_member'],
    max_connections: 10,
  });
  if (configured !== true) throw new SetupError('setWebhook: Telegram o‘rnatishni tasdiqlamadi.');

  const description = shared ? DESCRIPTION.shared : DESCRIPTION.separate;
  await telegram('setMyCommands', { commands: COMMANDS.uz });
  await telegram('setMyCommands', { commands: COMMANDS.ru, language_code: 'ru' });
  await telegram('setMyDescription', { description: description.uz });
  await telegram('setMyDescription', { description: description.ru, language_code: 'ru' });
  await telegram('setMyShortDescription', { short_description: SHORT.uz });
  await telegram('setMyShortDescription', { short_description: SHORT.ru, language_code: 'ru' });

  const current = await telegram('getWebhookInfo');
  if (current?.url !== url) {
    throw new SetupError('Webhook o‘rnatilgandan keyingi tekshiruv mos kelmadi. Sozlamalarni tekshiring.');
  }
  return { username: bot.username, url, shared };
}

async function main() {
  require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
  if (process.argv.length !== 3) {
    throw new SetupError('Foydalanish: npm run owner:telegram:setup -- https://sizning-domen.uz');
  }
  const result = await setupOwnerTelegram(process.argv[2]);
  console.log(`@${result.username} uchun webhook, buyruqlar menyusi va tavsif o‘rnatildi.`);
  console.log(`Manzil: ${result.url}`);
  console.log(result.shared
    ? 'Rejim: mavjud bot (ro‘yxatdan o‘tish boti bilan bitta). Yangi egalar ro‘yxatdan o‘tishi bilan avtomatik ulanadi.'
    : 'Rejim: alohida bot. Egalar ilovadagi «Telegram bot» bo‘limidan QR orqali ulanadi.');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof SetupError ? error.message : 'Sozlash yakunlanmadi. Muhit va bog‘liqliklarni tekshiring.');
    process.exitCode = 1;
  });
}

module.exports = { setupOwnerTelegram, webhookUrl, configuration, COMMANDS };
