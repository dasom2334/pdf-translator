import { describe, it, expect, vi } from 'vitest';
import { mapWithConcurrency } from './concurrency';

describe('mapWithConcurrency', () => {
  it('should return empty array for empty input', async () => {
    const result = await mapWithConcurrency([], 5, async (x) => x);
    expect(result).toEqual([]);
  });

  it('should return results in input order', async () => {
    const result = await mapWithConcurrency(
      [3, 1, 2],
      2,
      async (x) => x * 10,
    );
    expect(result).toEqual([30, 10, 20]);
  });

  it('should not exceed concurrency limit', async () => {
    const limit = 3;
    let maxConcurrent = 0;
    let current = 0;

    await mapWithConcurrency(
      Array.from({ length: 10 }, (_, i) => i),
      limit,
      async () => {
        current++;
        maxConcurrent = Math.max(maxConcurrent, current);
        await new Promise((r) => setTimeout(r, 10));
        current--;
        return 0;
      },
    );

    expect(maxConcurrent).toBeLessThanOrEqual(limit);
  });

  it('should run sequentially when limit=1', async () => {
    const order: number[] = [];

    await mapWithConcurrency(
      [1, 2, 3],
      1,
      async (x) => {
        order.push(x);
        return x;
      },
    );

    expect(order).toEqual([1, 2, 3]);
  });

  it('should throw RangeError for limit <= 0', async () => {
    await expect(
      mapWithConcurrency([1, 2], 0, async (x) => x),
    ).rejects.toThrow(RangeError);

    await expect(
      mapWithConcurrency([1, 2], -1, async (x) => x),
    ).rejects.toThrow(RangeError);
  });

  it('should propagate errors from fn', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('test error'));
    await expect(mapWithConcurrency([1], 2, fn)).rejects.toThrow('test error');
  });

  it('should handle limit larger than items length', async () => {
    const result = await mapWithConcurrency(
      [1, 2],
      100,
      async (x) => x * 2,
    );
    expect(result).toEqual([2, 4]);
  });
});
