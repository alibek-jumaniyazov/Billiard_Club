'use strict';

// A successful write means delivery; only a complete readback confirms state.
function supportsReadback(device) {
  return ['shelly_gen1', 'shelly_gen2', 'tasmota', 'esphome', 'home_assistant', 'modbus_tcp'].includes(device.driver)
    || (device.driver === 'mqtt' && Boolean(device.config?.stateTopic?.trim()));
}

function logicalState(values, inverted, desired) {
  if (!values.length || values.some((value) => typeof value !== 'boolean')) return null;
  const states = values.map((value) => inverted ? !value : value);
  // A mixed bank is a mismatch, never confirmation that every lamp is on/off.
  return states.every((value) => value === states[0]) ? states[0] : !desired;
}

/** Bounded write + readback cycle. Dependencies keep real-device tests optional. */
async function executeDevice(device, { verify, forced, write, read, sleep, now = Date.now }) {
  const desired = device.desired === true;
  const physical = device.inverted === true ? !desired : desired;
  const shouldVerify = verify && supportsReadback(device);
  let actual = null;
  let attempts = 0;
  let error = null;
  const readSafely = async (options) => {
    try { return await read(options); } catch { return null; }
  };

  if (forced && shouldVerify) actual = await readSafely();
  if (actual === desired) return { ok: true, on: desired, actual, attempts, error: null };

  for (const delay of [0, 400, 1200]) {
    if (delay) await sleep(delay);
    attempts += 1;
    actual = null;
    try {
      const since = now();
      await write(physical);
      if (!shouldVerify) return { ok: true, on: desired, actual: null, attempts, error: null };
      actual = await readSafely({ since });
      // Some relays acknowledge before their output settles. Read once more
      // before repeating the idempotent ON/OFF command (never use TOGGLE).
      if (actual !== desired) {
        await sleep(200);
        actual = await readSafely({ since });
      }
      if (actual === desired) return { ok: true, on: desired, actual, attempts, error: null };
      error = actual === null ? 'Rele holatini tasdiqlab bo‘lmadi' : 'Rele holati buyruqqa mos kelmadi';
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }
  return { ok: false, on: desired, actual, attempts, error };
}

module.exports = { supportsReadback, logicalState, executeDevice };
