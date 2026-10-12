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

module.exports = { resolveAppUrl, sameOrigin, safeExternal, trustedSender };
