import assert from 'node:assert/strict';
import { test } from 'node:test';
import { returningRows } from '../src/common/db/returning-rows';

test('UPDATE/DELETE ... RETURNING pairs are unwrapped to their rows', () => {
  assert.deepEqual(returningRows([[{ id: 1 }, { id: 2 }], 2]), [{ id: 1 }, { id: 2 }]);
  assert.deepEqual(returningRows([[], 0]), []);
});

test('plain row arrays (INSERT/SELECT) pass through unchanged', () => {
  assert.deepEqual(returningRows([{ id: 7 }]), [{ id: 7 }]);
  assert.deepEqual(returningRows([]), []);
  // Ikki elementli oddiy qatorlar ro'yxati juftlik deb adashtirilmaydi
  assert.deepEqual(returningRows([{ id: 1 }, { id: 2 }]), [{ id: 1 }, { id: 2 }]);
});

test('unexpected values never throw and yield no rows', () => {
  assert.deepEqual(returningRows(undefined), []);
  assert.deepEqual(returningRows(null), []);
  assert.deepEqual(returningRows({ rows: [] }), []);
});
