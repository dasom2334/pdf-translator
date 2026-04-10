import { describe, it, expect } from 'vitest';
import { parsePageRange } from './page-range.parser';

describe('parsePageRange', () => {
  it('단일 페이지 번호 파싱', () => {
    expect(parsePageRange('5')).toEqual([5]);
  });

  it('단순 범위 파싱', () => {
    expect(parsePageRange('1-5')).toEqual([1, 2, 3, 4, 5]);
  });

  it('복합 범위 파싱: 1-5,10', () => {
    expect(parsePageRange('1-5,10')).toEqual([1, 2, 3, 4, 5, 10]);
  });

  it('복합 범위 파싱: 1-3,7-9,15', () => {
    expect(parsePageRange('1-3,7-9,15')).toEqual([1, 2, 3, 7, 8, 9, 15]);
  });

  it('복합 범위 파싱: 1-5,10,15-20', () => {
    expect(parsePageRange('1-5,10,15-20')).toEqual([
      1, 2, 3, 4, 5, 10, 15, 16, 17, 18, 19, 20,
    ]);
  });

  it('중복 페이지는 하나만 포함', () => {
    expect(parsePageRange('1-3,2-4')).toEqual([1, 2, 3, 4]);
  });

  it('결과는 오름차순 정렬', () => {
    expect(parsePageRange('10,1-3')).toEqual([1, 2, 3, 10]);
  });

  it('공백이 포함되어도 파싱 성공', () => {
    expect(parsePageRange('1-3, 5, 7-9')).toEqual([1, 2, 3, 5, 7, 8, 9]);
  });

  it('잘못된 범위(start > end) 시 에러 발생', () => {
    expect(() => parsePageRange('5-3')).toThrow();
  });

  it('0 이하 페이지 번호 시 에러 발생', () => {
    expect(() => parsePageRange('0')).toThrow();
  });

  it('숫자가 아닌 값 시 에러 발생', () => {
    expect(() => parsePageRange('abc')).toThrow();
  });
});
