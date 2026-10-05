import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalTelegramTrialPhone, canonicalTrialPhone } from '../src/modules/public/trial-phone';

test('the same Uzbek number always consumes the same trial claim', () => {
  const variants = [
    '998901234567',
    '+998901234567',
    '+998 (90) 123-45-67',
    '00998901234567',
    '00 998 90 123 45 67',
    '90 123 45 67',
    '(90)123-45-67',
    '90.123.45.67',
    '  +998 90 123 45 67  ',
  ];
  for (const value of variants) {
    assert.equal(canonicalTrialPhone(value), '998901234567', value);
  }
});

test('other international phones keep their own identity', () => {
  assert.equal(canonicalTrialPhone('+1 (202) 555-0123'), '12025550123');
  assert.equal(canonicalTrialPhone('00442079460958'), '442079460958');
  assert.equal(canonicalTrialPhone('1234567'), '1234567');
  assert.equal(canonicalTrialPhone('+123456789012345'), '123456789012345');
  assert.notEqual(canonicalTrialPhone('901234567'), canonicalTrialPhone('901234568'));
});

test('explicit international nine-digit phones do not collide with Uzbek local numbers', () => {
  assert.equal(canonicalTrialPhone('+677123456'), '677123456');
  assert.equal(canonicalTrialPhone('00677123456'), '677123456');
  assert.equal(canonicalTrialPhone('677123456'), '998677123456');
  assert.notEqual(canonicalTrialPhone('+677123456'), canonicalTrialPhone('677123456'));
});

test('Telegram phones are international even when the plus prefix is absent', () => {
  assert.equal(canonicalTelegramTrialPhone('677123456'), '677123456');
  assert.equal(canonicalTelegramTrialPhone('+677123456'), '677123456');
  assert.equal(canonicalTelegramTrialPhone('998901234567'), '998901234567');
  assert.equal(canonicalTelegramTrialPhone(null), null);
  assert.equal(canonicalTelegramTrialPhone('not a phone'), null);
});

test('malformed phones cannot produce a trial claim or a truncated identity', () => {
  const invalid = [
    undefined, null, '', ' ', '-------', '+ () .', '00', '0000000',
    '123456', '+1234567890123456', '0099812345678901234567',
    'phone: 998901234567', '998901234567 ext 1', '++998901234567',
    '998+901234567', '998/90/1234567', '９９８９０１２３４５６７',
  ];
  for (const value of invalid) {
    assert.equal(canonicalTrialPhone(value), null, String(value));
  }
});
