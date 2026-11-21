import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { LightDriver } from '../src/entities/enums';
import { applyLight, readLight, type LightTarget } from '../src/modules/lights/drivers/light-driver';

/**
 * Tasmota (to'g'ridan-to'g'ri rejim): eski proshivkalar sarlavhadagi Basic auth ni
 * tekshirmaydi — parol /cm so'rovida user/password parametrlari bilan ham borishi
 * kerak (bridge agenti bilan bir xil qoida).
 */
test('Tasmota: parol URL da ham yuboriladi, holat o‘qiladi', async (t) => {
  const seen: Array<{ url: string; authorization: string | undefined }> = [];
  const server = createServer((req, res) => {
    seen.push({ url: req.url ?? '', authorization: req.headers.authorization });
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ POWER2: 'ON' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const { port } = server.address() as AddressInfo;

  const target = {
    driver: LightDriver.TASMOTA, host: `127.0.0.1:${port}`, channel: 1, inverted: false,
    auth: 'admin:p@ss w0rd', onUrl: null, offUrl: null, config: null,
  } as LightTarget;

  await applyLight(target, true);
  assert.equal(seen[0].url, '/cm?user=admin&password=p%40ss%20w0rd&cmnd=Power2%20ON');
  assert.match(seen[0].authorization ?? '', /^Basic /, 'yangi proshivkalar uchun sarlavha ham qoladi');

  assert.equal(await readLight(target), true);
  assert.equal(seen[1].url, '/cm?user=admin&password=p%40ss%20w0rd&cmnd=Power2');

  // Faqat parol kiritilgan bo'lsa foydalanuvchi "admin"; parolsiz — parametr yo'q
  await applyLight({ ...target, auth: 'secret' }, false);
  assert.equal(seen[2].url, '/cm?user=admin&password=secret&cmnd=Power2%20OFF');
  await applyLight({ ...target, auth: null }, false);
  assert.equal(seen[3].url, '/cm?cmnd=Power2%20OFF');
});
