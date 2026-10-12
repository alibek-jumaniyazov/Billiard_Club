import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as db from './db';
const state = vi.hoisted(() => ({ scope: 'u11|c1', allowed: true, request: vi.fn() }));
vi.mock('../api/client', () => ({ default: { request: state.request } }));
vi.mock('./cache', () => ({ fullScope: () => state.scope }));
vi.mock('./license', () => ({ effectiveNow: () => Date.now(), requireOfflineLease: async () => { if (!state.allowed) throw Error('OFFLINE_LICENSE_REQUIRED'); } }));
import { enqueue, flushQueue, queueList } from './queue';

const action = { scope: 'u11|c1', method: 'post' as const, url: '/sessions/start', labelKey: 'offline.actStart', idempotencyKey: 'original-request-key' };

describe('offline queue data integrity', () => {
  beforeEach(async () => {
    vi.restoreAllMocks(); state.scope = action.scope; state.allowed = true; state.request.mockReset();
    await db.idbClear(db.STORE_QUEUE); await db.idbClear(db.STORE_META);
  });
  it('does not accept a mutation without a valid offline lease', async () => {
    state.allowed = false;
    await expect(enqueue(action)).rejects.toThrow('OFFLINE_LICENSE_REQUIRED');
    expect(await queueList()).toHaveLength(0);
  });
  it('storage failure never reports a successful save', async () => {
    vi.spyOn(db, 'idbPut').mockResolvedValueOnce(null);
    await expect(enqueue(action)).rejects.toThrow('OFFLINE_QUEUE_WRITE_FAILED');
    expect(await queueList()).toHaveLength(0);
  });
  it('an acknowledgement disk failure preserves the original idempotency key for recovery', async () => {
    await enqueue(action);
    state.request.mockResolvedValue({ data: { data: { id: 42 } } });
    vi.spyOn(db, 'completeQueueEntry').mockResolvedValueOnce(false);
    expect(await flushQueue(action.scope)).toMatchObject({ sent: 0, blocked: true });
    expect(await queueList()).toHaveLength(1);
    expect(await flushQueue(action.scope)).toMatchObject({ sent: 1, blocked: false });
    expect(state.request.mock.calls.map(([config]) => config.headers['Idempotency-Key'])).toEqual(['original-request-key', 'original-request-key']);
    expect(await queueList()).toHaveLength(0);
  });
  it('dependent operations receive the committed server ID', async () => {
    const id = await enqueue(action);
    await enqueue({ ...action, method: 'put', url: `/sessions/$local:${id}/pause`, body: { sessionId: `$local:${id}` } });
    state.request.mockResolvedValueOnce({ data: { data: { id: 42 } } }).mockResolvedValueOnce({ data: { data: {} } });
    expect(await flushQueue(action.scope)).toMatchObject({ sent: 2 });
    expect(state.request.mock.calls[1][0]).toMatchObject({ url: '/sessions/42/pause', data: { sessionId: 42 } });
  });
  it('changing accounts stops replay before the next operation', async () => {
    await enqueue(action); await enqueue(action);
    state.request.mockImplementationOnce(async () => { state.scope = 'u22|c2'; return { data: { data: { id: 42 } } }; });
    expect(await flushQueue(action.scope)).toMatchObject({ sent: 1, blocked: true });
    expect(state.request).toHaveBeenCalledTimes(1);
    expect(await queueList()).toHaveLength(1);
  });
});
