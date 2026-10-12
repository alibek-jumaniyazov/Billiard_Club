import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { completeQueueEntry, idbClear, idbGet, idbPut, metaGet, STORE_META, STORE_QUEUE } from './db';

describe('durable queue acknowledgement', () => {
  beforeEach(async () => { await idbClear(STORE_QUEUE); await idbClear(STORE_META); });
  it('stores server references and removes the acknowledged action in one commit', async () => {
    const seq = await idbPut(STORE_QUEUE, { localId: 'session-a', body: {} });
    expect(await completeQueueEntry(Number(seq), 'session-a', 42)).toBe(true);
    expect(await idbGet(STORE_QUEUE, seq!)).toBeUndefined();
    expect(await metaGet('localIdMap')).toEqual({ 'session-a': 42 });
  });
  it('concurrent acknowledgements retain both mappings', async () => {
    const a = await idbPut(STORE_QUEUE, { localId: 'a' });
    const b = await idbPut(STORE_QUEUE, { localId: 'b' });
    expect(await Promise.all([completeQueueEntry(Number(a), 'a', 1), completeQueueEntry(Number(b), 'b', 2)])).toEqual([true, true]);
    expect(await metaGet('localIdMap')).toEqual({ a: 1, b: 2 });
  });
});
