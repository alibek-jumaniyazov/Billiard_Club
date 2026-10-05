'use strict';

const path = require('node:path');
const { isIP } = require('node:net');

class SetupError extends Error {}

function webhookUrl(origin) {
  let url;
  try {
    url = new URL(origin);
  } catch {
    throw new SetupError('Saytning HTTPS manzilini kiriting: npm run trial:telegram:setup -- https://sizning-domen.uz');
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
  return `${url.origin}/api/public/trial-verification/telegram/webhook`;
}

function configuration(env) {
  const token = env.TRIAL_TELEGRAM_BOT_TOKEN?.trim() || env.TELEGRAM_BOT_TOKEN?.trim();
  const username = env.TRIAL_TELEGRAM_BOT_USERNAME || '';
  const secret = env.TRIAL_TELEGRAM_WEBHOOK_SECRET || '';
  if (!token || !/^[0-9]+:[A-Za-z0-9_-]{20,}$/.test(token)) {
    throw new SetupError('server/.env ga TRIAL_TELEGRAM_BOT_TOKEN (yoki TELEGRAM_BOT_TOKEN) kiriting.');
  }
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(secret)) {
    throw new SetupError('TRIAL_TELEGRAM_WEBHOOK_SECRET 32–256 ta A-Z, a-z, 0-9, _ yoki - belgisidan iborat bo‘lsin.');
  }
  if (username && !/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username)) {
    throw new SetupError('TRIAL_TELEGRAM_BOT_USERNAME ga botning haqiqiy username qiymatini kiriting.');
  }
  return { token, username, secret };
}

async function setupTelegramWebhook(origin, env = process.env, fetchImpl = fetch) {
  const url = webhookUrl(origin);
  const { token, username, secret } = configuration(env);

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
      // Fetch errors can contain the request URL, which includes the bot token.
      throw new SetupError(`${method}: Telegram bilan bog‘lanib bo‘lmadi. Tarmoqni tekshiring va qayta urinib ko‘ring.`);
    }
    if (!response.ok || body?.ok !== true) {
      // Do not dump provider responses: they may echo URLs or secret values.
      throw new SetupError(`${method}: Telegram so‘rovni rad etdi. Bot tokeni va server sozlamalarini tekshiring.`);
    }
    return body.result;
  }

  const previous = await telegram('getWebhookInfo');
  if (!previous || typeof previous.url !== 'string') {
    throw new SetupError('getWebhookInfo: Telegram javobi kutilgan formatda emas.');
  }
  if (previous.url && previous.url !== url) {
    throw new SetupError('Bu botda boshqa webhook bor. U o‘zgartirilmadi. Ro‘yxatdan o‘tish uchun BotFather orqali alohida bot yarating.');
  }

  const bot = await telegram('getMe');
  if (bot?.is_bot !== true || typeof bot.username !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(bot.username)) {
    throw new SetupError('getMe: Telegram bot username qiymatini qaytarmadi.');
  }
  if (!username || username.toLowerCase() !== bot.username.toLowerCase()) {
    throw new SetupError(`server/.env da TRIAL_TELEGRAM_BOT_USERNAME=${bot.username} qilib saqlang, serverni qayta ishga tushiring va buyruqni takrorlang. Webhook o‘zgartirilmadi.`);
  }

  // Check the deployed route and matching secret before changing the bot.
  // An empty update is acknowledged without storing data or sending messages.
  try {
    const probe = await fetchImpl(url, {
      method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret },
      body: '{}', signal: AbortSignal.timeout(15_000),
    });
    const result = await probe.json();
    if (!probe.ok || result?.ok !== true) throw new Error('Not ready');
  } catch {
    throw new SetupError('Server webhooki tayyor emas. HTTPS, proxy, bot sozlamalari va webhook sirini tekshiring. Telegram webhooki o‘zgartirilmadi.');
  }

  const configured = await telegram('setWebhook', {
    url,
    secret_token: secret,
    allowed_updates: ['message'],
    max_connections: 10,
  });
  if (configured !== true) {
    throw new SetupError('setWebhook: Telegram o‘rnatishni tasdiqlamadi.');
  }
  const current = await telegram('getWebhookInfo');
  if (current?.url !== url) {
    throw new SetupError('Webhook o‘rnatilgandan keyingi tekshiruv mos kelmadi. Sozlamalarni tekshiring.');
  }
  return { username: bot.username, url };
}

async function main() {
  require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
  if (process.argv.length !== 3) {
    throw new SetupError('Foydalanish: npm run trial:telegram:setup -- https://sizning-domen.uz');
  }
  const result = await setupTelegramWebhook(process.argv[2]);
  console.log(`@${result.username} uchun webhook o‘rnatildi va Telegram orqali tekshirildi.`);
  console.log(`Manzil: ${result.url}`);
  console.log('Endi saytda yangi ro‘yxatdan o‘tish oqimini tekshiring; bu buyruq to‘liq foydalanuvchi oqimini sinamaydi.');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof SetupError ? error.message : 'Sozlash yakunlanmadi. Muhit va bog‘liqliklarni tekshiring.');
    process.exitCode = 1;
  });
}

module.exports = { setupTelegramWebhook, webhookUrl, configuration };
