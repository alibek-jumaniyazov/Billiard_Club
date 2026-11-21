import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as db from './db';
const state = vi.hoisted(() => ({ scope: 'u11|c1', allowed: true, request: vi.fn() }));
vi.mock('../api/client', () => ({ default: { request: state.request } }));
vi.mock('./cache', () => ({ fullScope: () => state.scope }));
vi.mock('./license', () => ({ effectiveNow: () => Date.now(), requireOfflineLease: async () => { if (!state.allowed) throw Error('OFFLINE_LICENSE_REQUIRED'); } }));
import { enqueue, flushQueue, queueList, queueRetry } from './queue';

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

/** Server rad javobi — axios xatosi shaklida */
const rejection = (status: number, message: string) =>
  Object.assign(new Error(message), { response: { status, data: { message } } });

/** Soxta server: `rejected` dagi URL lar 400 bilan rad etiladi, qolganlari 101, 102, ... ID bilan o'tadi */
const serve = (rejected: string[] = []) => {
  let nextId = 100;
  state.request.mockReset();
  state.request.mockImplementation(async (config: { url: string }) => {
    if (rejected.includes(config.url)) throw rejection(400, 'rad etildi');
    nextId += 1;
    return { data: { data: { id: nextId } } };
  });
};
const sentUrls = () => state.request.mock.calls.map(([config]) => config.url);
const snapshot = async () =>
  (await queueList()).map(({ url, status, attempts, lastError }) => ({ url, status, attempts, lastError }));

describe('offline queue dependencies', () => {
  beforeEach(async () => {
    vi.restoreAllMocks(); state.scope = action.scope; state.allowed = true; state.request.mockReset();
    await db.idbClear(db.STORE_QUEUE); await db.idbClear(db.STORE_META);
  });
  it('a rejected action does not hold back an unrelated later action', async () => {
    await enqueue({ ...action, url: '/orders', meta: { kind: 'order.create', sessionRef: '42', tableId: 1 } });
    await enqueue({ ...action, url: '/sessions/start', meta: { kind: 'session.start', tableId: 2 } });
    serve(['/orders']);
    expect(await flushQueue(action.scope)).toMatchObject({ sent: 1, blocked: true });
    expect(sentUrls()).toEqual(['/orders', '/sessions/start']);
    expect(await snapshot()).toEqual([{ url: '/orders', status: 'failed', attempts: 1, lastError: 'rad etildi' }]);
  });
  it('an action sharing a table or session with a rejected one waits, then follows it after retry', async () => {
    await enqueue({ ...action, url: '/orders', meta: { kind: 'order.create', sessionRef: '42', tableId: 1 } });
    await enqueue({ ...action, method: 'put', url: '/sessions/42/end', meta: { kind: 'session.end', sessionRef: '42', tableId: 1 } });
    await enqueue({ ...action, url: '/sessions/start', meta: { kind: 'session.start', tableId: 2 } });
    serve(['/orders']);
    expect(await flushQueue(action.scope)).toMatchObject({ sent: 1, blocked: true });
    expect(sentUrls()).toEqual(['/orders', '/sessions/start']);
    // Kutayotgan amal xato deb belgilanmaydi va urinishi sarflanmaydi
    expect(await snapshot()).toEqual([
      { url: '/orders', status: 'failed', attempts: 1, lastError: 'rad etildi' },
      { url: '/sessions/42/end', status: 'pending', attempts: 0, lastError: undefined },
    ]);
    serve(['/orders']);
    expect(await flushQueue(action.scope)).toMatchObject({ sent: 0, blocked: true });
    expect(state.request).not.toHaveBeenCalled();
    // Xato amal qayta urinilib o'tsa — kutgan amal undan KEYIN ketadi
    const [failed] = await queueList();
    await queueRetry(failed.seq!);
    serve();
    expect(await flushQueue(action.scope)).toMatchObject({ sent: 2, blocked: false });
    expect(sentUrls()).toEqual(['/orders', '/sessions/42/end']);
    expect(await queueList()).toHaveLength(0);
  });
  it('a $local chain waits for the unsent object instead of failing with an unresolved reference', async () => {
    await enqueue({ ...action, localId: 'cust-1', url: '/customers', body: { name: 'Ali' }, meta: { deps: ['customer:$local:cust-1'] } });
    // Kalitlari mos emas — faqat tanadagi havola bog'laydi
    await enqueue({ ...action, localId: 'res-1', url: '/reservations', body: { customerId: '$local:cust-1', tableId: 3 }, meta: { deps: ['reservation:$local:res-1', 'table:3'] } });
    // Ataylab mustaqil (deps: []), lekin URL kutayotgan bronga havola qiladi — zanjir
    await enqueue({ ...action, method: 'put', url: '/reservations/$local:res-1', body: { status: 'confirmed' }, meta: { deps: [] } });
    await enqueue({ ...action, url: '/sessions/start', meta: { kind: 'session.start', tableId: 4 } });
    serve(['/customers']);
    expect(await flushQueue(action.scope)).toMatchObject({ sent: 1, blocked: true });
    expect(sentUrls()).toEqual(['/customers', '/sessions/start']);
    expect(await snapshot()).toEqual([
      { url: '/customers', status: 'failed', attempts: 1, lastError: 'rad etildi' },
      { url: '/reservations', status: 'pending', attempts: 0, lastError: undefined },
      { url: '/reservations/$local:res-1', status: 'pending', attempts: 0, lastError: undefined },
    ]);
  });
  it('a synced $local reference and the server ID are the same dependency key', async () => {
    const start = await enqueue({ ...action, url: '/sessions/start', meta: { kind: 'session.start', tableId: 1 } });
    await enqueue({ ...action, method: 'put', url: `/sessions/$local:${start}/pause`, meta: { kind: 'session.pause', sessionRef: `$local:${start}`, tableId: 1 } });
    // Sessiya serverga yetgach (ID 101) yozilgan amal — boshqa stol, lekin o'sha sessiya
    await enqueue({ ...action, url: '/orders', meta: { deps: ['session:101'] } });
    await enqueue({ ...action, url: '/sessions/start', meta: { kind: 'session.start', tableId: 2 } });
    serve(['/sessions/101/pause']);
    expect(await flushQueue(action.scope)).toMatchObject({ sent: 2, blocked: true });
    expect(sentUrls()).toEqual(['/sessions/start', '/sessions/101/pause', '/sessions/start']);
    expect((await snapshot()).map(({ url, status }) => [url, status])).toEqual([
      [`/sessions/$local:${start}/pause`, 'failed'],
      ['/orders', 'pending'],
    ]);
  });
  it('legacy entries derive deps from meta; entries with unknown deps wait for everything before them', async () => {
    await enqueue({ ...action, method: 'put', url: '/sessions/42/pause', meta: { kind: 'session.pause', sessionRef: '42', tableId: 1 } });
    // Ko'chirish: maqsad stoli (toTableId) rad etilgan amal stoli bilan bir xil
    await enqueue({ ...action, url: '/sessions/77/transfer', meta: { sessionRef: '77', tableId: 2, toTableId: 1 } });
    await enqueue({ ...action, url: '/orders', meta: { kind: 'order.create', sessionRef: '55', tableId: 3 } });
    // Meta umuman yo'q — bog'liqligi noma'lum, oldingi hamma narsaga bog'liq
    await enqueue({ ...action, url: '/legacy/unknown' });
    // Noma'lum amal ushlab turilgani uchun undan keyingi kalitli amal ham kutadi
    await enqueue({ ...action, url: '/sessions/start', meta: { kind: 'session.start', tableId: 4 } });
    serve(['/sessions/42/pause']);
    expect(await flushQueue(action.scope)).toMatchObject({ sent: 1, blocked: true });
    expect(sentUrls()).toEqual(['/sessions/42/pause', '/orders']);
    expect((await snapshot()).map(({ url, status }) => [url, status])).toEqual([
      ['/sessions/42/pause', 'failed'],
      ['/sessions/77/transfer', 'pending'],
      ['/legacy/unknown', 'pending'],
      ['/sessions/start', 'pending'],
    ]);
  });
  it('a transient error that exhausts its retries still stops the whole queue', async () => {
    await enqueue({ ...action, url: '/orders', meta: { kind: 'order.create', sessionRef: '42', tableId: 1 } });
    await enqueue({ ...action, url: '/sessions/start', meta: { kind: 'session.start', tableId: 2 } });
    // Masalan obuna tugagan: server HAR BIR so'rovga 403 qaytaradi
    state.request.mockRejectedValue(rejection(403, 'SUBSCRIPTION_EXPIRED'));
    for (let i = 0; i < 25; i += 1) await flushQueue(action.scope);
    expect(new Set(sentUrls())).toEqual(new Set(['/orders']));
    const [first, second] = await queueList();
    expect(first).toMatchObject({ status: 'failed', failure: 'exhausted', attempts: 20 });
    expect(second).toMatchObject({ status: 'pending', attempts: 0 });
    expect(await flushQueue(action.scope)).toMatchObject({ sent: 0, blocked: true });
  });
});
