const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveAppUrl, safeExternal, sameOrigin, trustedSender } = require('../security');

test('packaged applications require HTTPS, including localhost', () => {
  for (const url of ['http://billiardclub.uz', 'file:///C:/app.html', 'javascript:alert(1)', 'https://user:pass@billiardclub.uz', 'http://localhost:5173']) {
    assert.throws(() => resolveAppUrl(url, true));
  }
  assert.equal(resolveAppUrl('https://billiardclub.uz/', true), 'https://billiardclub.uz');
  assert.equal(resolveAppUrl('http://localhost:5173', false), 'http://localhost:5173');
  assert.throws(() => resolveAppUrl('http://192.168.1.2', false));
});

test('external links cannot execute OS schemes, files, or embedded credentials', () => {
  for (const url of ['file:///C:/test.exe', 'javascript:alert(1)', 'ms-settings:display', 'https://user:pass@example.com', 'data:text/html,hello']) assert.equal(safeExternal(url), false);
  assert.equal(safeExternal('https://t.me/alibek_jumaniyazov'), true);
  assert.equal(sameOrigin('https://billiardclub.uz.evil.test', 'https://billiardclub.uz'), false);
});

test('IPC is restricted to the trusted main frame in the application window', () => {
  const frame = { url: 'https://billiardclub.uz/tables' };
  const contents = { mainFrame: frame };
  const win = { isDestroyed: () => false, webContents: contents };
  const event = { sender: contents, senderFrame: frame };
  const origin = 'https://billiardclub.uz';
  assert.equal(trustedSender(event, win, origin), true);
  assert.equal(trustedSender({ ...event, senderFrame: { ...frame } }, win, origin), false);
  assert.equal(trustedSender({ ...event, sender: {} }, win, origin), false);
  frame.url = 'https://evil.test';
  assert.equal(trustedSender(event, win, origin), false);
  assert.equal(trustedSender(undefined, win, origin), false);
});
