import { describe, expect, it, vi } from 'vitest';
import { MIN_CHUNK_BYTES, uploadInChunks, type ChunkedUploadApi } from './chunkedUpload';

const MB = 1024 * 1024;
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { response: { status } });

/** Server o'rnini bosuvchi: bo'laklarni yig'adi, offset qoidalari serverdagidek */
const fakeServer = (opts: { maxBody?: number; failFirst?: number[] } = {}) => {
  let stored = new Uint8Array(0);
  const failing = new Set(opts.failFirst ?? []);
  const api: ChunkedUploadApi<{ size: number }> = {
    start: vi.fn(async () => ({ uploadId: 'u1', chunkSize: 4 * MB })),
    chunk: vi.fn(async (_id: string, offset: number, blob: Blob) => {
      if (opts.maxBody && blob.size > opts.maxBody) throw httpError(413);
      if (failing.has(offset)) {
        failing.delete(offset);
        throw httpError(502);
      }
      if (offset === stored.length) {
        const next = new Uint8Array(stored.length + blob.size);
        next.set(stored);
        next.set(new Uint8Array(await blob.arrayBuffer()), stored.length);
        stored = next;
      }
      return { received: stored.length };
    }),
    complete: vi.fn(async () => ({ size: stored.length })),
    abort: vi.fn(async () => undefined),
  };
  return { api, stored: () => stored };
};

const fileOf = (size: number) => {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) bytes[i] = i % 251;
  return new Blob([bytes]);
};
const noWait = () => Promise.resolve();

describe('uploadInChunks', () => {
  it('sends a large file in server-sized chunks and reports progress up to 100', async () => {
    const { api, stored } = fakeServer();
    const file = fileOf(9 * MB + 7);
    const progress: number[] = [];
    const result = await uploadInChunks(file, api, { onProgress: (p) => progress.push(p), wait: noWait });
    expect(result.size).toBe(file.size);
    expect(api.chunk).toHaveBeenCalledTimes(3);
    expect(Array.from(stored().slice(0, 5))).toEqual([0, 1, 2, 3, 4]);
    expect(progress.at(-1)).toBe(100);
    expect(Math.max(...progress.slice(0, -1))).toBeLessThanOrEqual(99);
  });

  it('halves the chunk when a proxy answers 413 and still finishes', async () => {
    const { api } = fakeServer({ maxBody: 1 * MB });
    const result = await uploadInChunks(fileOf(3 * MB), api, { wait: noWait });
    expect(result.size).toBe(3 * MB);
    const sizes = vi.mocked(api.chunk).mock.calls.map(([, , blob]) => blob.size);
    // 3 MB lik fayl: butun fayl (413) -> 2 MB (413) -> 1 MB bo'laklar o'tadi
    expect(sizes.slice(0, 3)).toEqual([3 * MB, 2 * MB, 1 * MB]);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(MIN_CHUNK_BYTES);
  });

  it('retries a chunk after a gateway error without duplicating bytes', async () => {
    const { api, stored } = fakeServer({ failFirst: [4 * MB] });
    const file = fileOf(6 * MB);
    await uploadInChunks(file, api, { wait: noWait });
    expect(stored().length).toBe(file.size);
  });

  it('cleans the server copy when the upload fails for good', async () => {
    const api: ChunkedUploadApi<unknown> = {
      start: async () => ({ uploadId: 'u2', chunkSize: 4 * MB }),
      chunk: async () => {
        throw httpError(404);
      },
      complete: async () => undefined,
      abort: vi.fn(async () => undefined),
    };
    await expect(uploadInChunks(fileOf(MB), api, { wait: noWait })).rejects.toThrow('HTTP 404');
    expect(api.abort).toHaveBeenCalledWith('u2');
  });

  it('stops and cleans up when the user cancels', async () => {
    const controller = new AbortController();
    const { api } = fakeServer();
    vi.mocked(api.chunk).mockImplementationOnce(async () => {
      controller.abort();
      return { received: 4 * MB };
    });
    await expect(uploadInChunks(fileOf(9 * MB), api, { signal: controller.signal, wait: noWait })).rejects.toThrow();
    expect(api.abort).toHaveBeenCalledWith('u1');
    expect(api.complete).not.toHaveBeenCalled();
  });
});
