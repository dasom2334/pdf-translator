/**
 * 동시 실행 수를 limit으로 제한하면서 배열을 병렬 처리.
 * 입력 순서와 동일한 순서로 결과를 반환한다.
 *
 * Worker-pool 방식으로 구현: JS 이벤트루프 단일스레드 보장으로
 * nextIndex 공유가 안전하며, 세마포어 방식보다 구현이 단순하다.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  if (limit <= 0) throw new RangeError('concurrency limit must be > 0');

  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await fn(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}
