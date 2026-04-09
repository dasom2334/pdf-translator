/**
 * 페이지 범위 문자열을 페이지 번호 배열로 변환한다.
 * 예: '1-5,10,15-20' → [1,2,3,4,5,10,15,16,17,18,19,20]
 */
export function parsePageRange(range: string): number[] {
  const pages = new Set<number>();

  const segments = range.split(',').map((s) => s.trim()).filter(Boolean);

  for (const segment of segments) {
    if (segment.includes('-')) {
      const parts = segment.split('-');
      if (parts.length !== 2) {
        throw new Error(`Invalid page range segment: "${segment}"`);
      }
      const start = parseInt(parts[0], 10);
      const end = parseInt(parts[1], 10);
      if (isNaN(start) || isNaN(end) || start < 1 || end < start) {
        throw new Error(`Invalid page range segment: "${segment}"`);
      }
      for (let i = start; i <= end; i++) {
        pages.add(i);
      }
    } else {
      const page = parseInt(segment, 10);
      if (isNaN(page) || page < 1) {
        throw new Error(`Invalid page number: "${segment}"`);
      }
      pages.add(page);
    }
  }

  return Array.from(pages).sort((a, b) => a - b);
}
