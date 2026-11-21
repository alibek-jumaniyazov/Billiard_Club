const assert = require('node:assert/strict');
const { test } = require('node:test');
const { resolveDesired, nextChangeAt, normalizeRules } = require('../lib/rules');

/**
 * Chiroq qoidalari serverdagi resolveDesired + SQL shartlarining nusxasi
 * (server/src/modules/lights/lights.service.ts). Bu testlar ikkalasining
 * umumiy shartnomasi — server qoidasi o'zgarsa shu yer ham o'zgarishi kerak.
 */

const T = Date.parse('2026-11-21T18:00:00Z');
const MIN = 60_000;
const base = { override: null, session: null, lastEndAt: null, reservations: [] };

test('ustuvorlik: override -> faol -> pauza -> grace -> bron -> o‘chiq', () => {
  const rules = { offOnPause: true, offDelaySec: 120, preOnMinutes: 10 };
  // Qo'lda o'chirish faol o'yindan ustun
  assert.equal(resolveDesired({ ...base, session: 'active', override: { on: false, until: T + MIN } }, rules, T), false);
  // Muddati tugagan override hisobga olinmaydi
  assert.equal(resolveDesired({ ...base, session: 'active', override: { on: false, until: T } }, rules, T), true);
  assert.equal(resolveDesired({ ...base, session: 'active' }, rules, T), true);
  // Pauzada o'chsin yoqilgan
  assert.equal(resolveDesired({ ...base, session: 'paused' }, rules, T), false);
  assert.equal(resolveDesired({ ...base, session: 'paused' }, { ...rules, offOnPause: false }, T), true);
  assert.equal(resolveDesired({ ...base }, rules, T), false);
});

test('o‘yin tugagach kechikish (grace) serverdagidek qat’iy chegara bilan', () => {
  const rules = { offDelaySec: 60 };
  const ended = T - 30_000;
  assert.equal(resolveDesired({ ...base, lastEndAt: ended }, rules, T), true);
  // Server: endTime > now - delay (qat'iy): aynan 60 s da o'chadi
  assert.equal(resolveDesired({ ...base, lastEndAt: ended }, rules, ended + 60_000), false);
  assert.equal(resolveDesired({ ...base, lastEndAt: ended }, rules, ended + 59_999), true);
  // Grace o'chiq bo'lsa (0) darhol o'chadi
  assert.equal(resolveDesired({ ...base, lastEndAt: ended }, { offDelaySec: 0 }, T), false);
});

test('bron oldidan yoqish: oyna ochilgach yonadi, bron boshlanishi bilan qoidadan chiqadi', () => {
  const rules = { preOnMinutes: 15 };
  const startsAt = T + 20 * MIN;
  assert.equal(resolveDesired({ ...base, reservations: [startsAt] }, rules, T), false);
  assert.equal(resolveDesired({ ...base, reservations: [startsAt] }, rules, startsAt - 15 * MIN), true);
  assert.equal(resolveDesired({ ...base, reservations: [startsAt] }, rules, startsAt - 1), true);
  // Server: startsAt > now — bron boshlangan zahoti bu qoida tugaydi (o'yinni kassir boshlaydi)
  assert.equal(resolveDesired({ ...base, reservations: [startsAt] }, rules, startsAt), false);
});

test('keyingi o‘zgarish vaqti — taymer shu vaqtga qo‘yiladi', () => {
  const rules = { offDelaySec: 120, preOnMinutes: 10 };
  const input = {
    override: { on: true, until: T + 30 * MIN },
    session: null,
    lastEndAt: T - 60_000,
    reservations: [T + 60 * MIN],
  };
  // grace T+60s da, override T+30 daq da, bron oynasi T+50 daq da ochiladi
  assert.equal(nextChangeAt(input, rules, T), T + 60_000);
  assert.equal(nextChangeAt({ ...base }, rules, T), null);
  assert.equal(nextChangeAt({ ...base, reservations: [T + 60 * MIN] }, rules, T), T + 50 * MIN);
  assert.equal(nextChangeAt({ ...base, reservations: [T + 60 * MIN] }, rules, T + 55 * MIN), T + 60 * MIN);
});

test('qoidalar chegaraga keltiriladi', () => {
  assert.deepEqual(normalizeRules(null), { offOnPause: false, offDelaySec: 0, preOnMinutes: 0 });
  assert.deepEqual(normalizeRules({ offOnPause: 'yes', offDelaySec: 99999, preOnMinutes: -5 }),
    { offOnPause: false, offDelaySec: 3600, preOnMinutes: 0 });
});
