/**
 * 터미널에 진행률 바를 출력한다.
 * 예: [===>    ] 3/10 pages
 */
export function renderProgressBar(
  current: number,
  total: number,
  label: string,
  width = 20,
): string {
  const ratio = total === 0 ? 1 : Math.min(current / total, 1);
  const filled = Math.floor(ratio * width);
  const arrow = filled < width ? '>' : '';
  const empty = width - filled - (arrow ? 1 : 0);

  const bar =
    '='.repeat(filled) +
    arrow +
    ' '.repeat(Math.max(0, empty));

  return `[${bar}] ${current}/${total} ${label}`;
}

export function printProgress(current: number, total: number, label: string): void {
  process.stdout.write(`\r${renderProgressBar(current, total, label)}`);
  if (current >= total) {
    process.stdout.write('\n');
  }
}
