const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { offlineFallbackHtml } = require('../offline');

const HOSTILE = 'https://x.uz/"></script><script>alert(1)</script>';

test('offline page escapes the app URL in markup, attributes and the retry script', () => {
  const html = offlineFallbackHtml({ url: HOSTILE, reason: '<img src=x onerror=alert(1)>' });
  assert.equal(/<script>alert/.test(html), false);
  assert.equal(html.includes('<img src=x'), false);
  // Avtomatik qayta urinish skriptidagi qiymat asl manzilga aynan qaytadi
  const literal = html.match(/var target = (.*);/)[1];
  assert.equal(vm.runInNewContext(literal), HOSTILE);
});

test('offline page retries automatically and listens for the network coming back', () => {
  const html = offlineFallbackHtml({ url: 'https://billiardclub.uz' });
  assert.match(html, /addEventListener\('online'/);
  assert.match(html, /var left = \d+;/);
});
