'use strict';

/**
 * CHIROQ QOIDALARI — stol chirog'i hozir yonishi kerakmi.
 *
 * Bu serverdagi `resolveDesired` va uning SQL shartlarining AYNAN nusxasi
 * (server/src/modules/lights/lights.service.ts: desiredRows + resolveDesired).
 * Bulut bilan aloqa uzilganda chiroq markazi (bridge agenti yoki kompyuter
 * dasturining o'zi) chiroqni shu qoida bilan O'ZI boshqaradi — shuning uchun
 * ikkala joyda natija bir xil bo'lishi SHART. Birini o'zgartirsangiz ikkinchisini
 * ham o'zgartiring (test: bridge/test/rules.test.cjs).
 *
 * Ustuvorlik (yuqoridan pastga, birinchi mos kelgani g'olib):
 *   1. Qo'lda boshqaruv (override) muddati tugamagan bo'lsa — o'sha qiymat
 *   2. O'yin faol — yoniq
 *   3. O'yin pauzada — yoniq (klubda "pauzada o'chsin" yoqilmagan bo'lsa)
 *   4. O'yin tugaganiga `offDelaySec` soniyadan kam vaqt o'tgan — yoniq (grace)
 *   5. `preOnMinutes` daqiqa ichida bron boshlanadi — yoniq
 *   6. Aks holda — o'chiq
 *
 * Barcha vaqtlar millisekundda (epoch) va SERVER soatida beriladi.
 */

const DEFAULT_RULES = Object.freeze({ offOnPause: false, offDelaySec: 0, preOnMinutes: 0 });

/** Serverdagi chegaralar bilan bir xil: grace 0..3600 s, bron oldidan 0..120 daq */
function normalizeRules(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_RULES };
  const int = (value, min, max) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.min(max, Math.max(min, Math.round(num)));
  };
  return {
    offOnPause: raw.offOnPause === true,
    offDelaySec: int(raw.offDelaySec, 0, 3600),
    preOnMinutes: int(raw.preOnMinutes, 0, 120),
  };
}

/** Qo'lda boshqaruv hozir kuchdami */
function overrideActive(override, now) {
  return Boolean(
    override
      && typeof override.on === 'boolean'
      && Number.isFinite(override.until)
      && override.until > now,
  );
}

/**
 * Kerakli holat.
 *
 * @param {object} input
 * @param {{on: boolean|null, until: number|null}|null} input.override
 * @param {'active'|'paused'|null} input.session  stoldagi ochiq o'yin holati
 * @param {number|null} input.lastEndAt           oxirgi o'yin tugagan vaqt
 * @param {number[]} input.reservations           kutilayotgan bronlarning boshlanish vaqtlari
 * @param {object} rules                          { offOnPause, offDelaySec, preOnMinutes }
 * @param {number} now
 * @returns {boolean}
 */
function resolveDesired(input, rules, now) {
  const r = normalizeRules(rules);
  if (overrideActive(input.override, now)) return input.override.on;
  if (input.session === 'active') return true;
  if (input.session === 'paused') return !r.offOnPause;
  // Server: fin."endTime" > now() - offDelaySec (qat'iy katta)
  if (r.offDelaySec > 0 && Number.isFinite(input.lastEndAt)
    && input.lastEndAt > now - r.offDelaySec * 1000) {
    return true;
  }
  // Server: r."startsAt" > now() AND r."startsAt" <= now() + preOnMinutes
  if (r.preOnMinutes > 0 && Array.isArray(input.reservations)) {
    const horizon = now + r.preOnMinutes * 60_000;
    if (input.reservations.some((at) => Number.isFinite(at) && at > now && at <= horizon)) return true;
  }
  return false;
}

/**
 * Natija VAQT o'tishi bilan o'zgarishi mumkin bo'lgan eng yaqin kelajak vaqti
 * (override muddati tugashi, grace tugashi, bron oynasining ochilishi/yopilishi).
 * Chiroq markazi shu vaqtga taymer qo'yadi — internet bo'lmasa ham o'yin
 * tugagach kechikish va bron oldidan yoqish o'z vaqtida ishlaydi.
 *
 * @returns {number|null} keyingi o'zgarish vaqti yoki null (kutilmaydi)
 */
function nextChangeAt(input, rules, now) {
  const r = normalizeRules(rules);
  const candidates = [];
  if (overrideActive(input.override, now)) candidates.push(input.override.until);
  if (r.offDelaySec > 0 && Number.isFinite(input.lastEndAt)) {
    const end = input.lastEndAt + r.offDelaySec * 1000;
    if (end > now) candidates.push(end);
  }
  if (r.preOnMinutes > 0 && Array.isArray(input.reservations)) {
    for (const at of input.reservations) {
      if (!Number.isFinite(at)) continue;
      const opens = at - r.preOnMinutes * 60_000;
      if (opens > now) candidates.push(opens);
      if (at > now) candidates.push(at);
    }
  }
  return candidates.length ? Math.min(...candidates) : null;
}

module.exports = { DEFAULT_RULES, normalizeRules, overrideActive, resolveDesired, nextChangeAt };
