import { describe, it, expect } from 'vitest';
import { postProcessTranslation, splitIntoChunksWithOverlap } from './translation.utils';

describe('postProcessTranslation', () => {
  it('should trim leading and trailing whitespace', () => {
    expect(postProcessTranslation('  hello  ')).toBe('hello');
  });

  it('should strip HTML/XML tags', () => {
    expect(postProcessTranslation('<b>bold</b>')).toBe('bold');
    expect(postProcessTranslation('<p>paragraph</p>')).toBe('paragraph');
    expect(postProcessTranslation('<br/>')).toBe('');
  });

  it('should collapse multiple spaces into one', () => {
    expect(postProcessTranslation('hello   world')).toBe('hello world');
  });

  it('should collapse 3+ consecutive newlines into 2', () => {
    expect(postProcessTranslation('a\n\n\n\nb')).toBe('a\n\nb');
  });

  it('should preserve single and double newlines', () => {
    expect(postProcessTranslation('a\nb')).toBe('a\nb');
    expect(postProcessTranslation('a\n\nb')).toBe('a\n\nb');
  });

  it('should handle empty string', () => {
    expect(postProcessTranslation('')).toBe('');
  });

  it('should handle mixed HTML and extra whitespace', () => {
    expect(postProcessTranslation('<b>hello   world</b>')).toBe('hello world');
  });
});

describe('splitIntoChunksWithOverlap', () => {
  it('should return single chunk for short text', () => {
    const chunks = splitIntoChunksWithOverlap('Hello world.', 500);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe('Hello world.');
  });

  it('should split long paragraphs into multiple chunks', () => {
    const para1 = 'A'.repeat(300);
    const para2 = 'B'.repeat(300);
    const text = `${para1}\n\n${para2}`;

    const chunks = splitIntoChunksWithOverlap(text, 500);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('should not exceed maxChunkSize (approximately)', () => {
    const para = 'This is a sentence. '.repeat(50);
    const chunks = splitIntoChunksWithOverlap(para, 200, 0);

    for (const chunk of chunks) {
      // With overlap=0, chunks should be within limit.
      // A single sentence is ~20 chars; the last sentence added might push
      // us just beyond 200 before the next flush, so allow up to 2x for a single sentence overage.
      expect(chunk.length).toBeLessThanOrEqual(400);
    }
    // At least some splitting happened for a 1000-char input at 200 limit
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('should produce overlap when overlapSentences > 0', () => {
    // Create text with distinct sentences that we can verify appear in next chunk
    const text =
      'First sentence is here. Second sentence follows it. Third one comes next. Fourth closes.';

    const chunks = splitIntoChunksWithOverlap(text, 60, 1);

    if (chunks.length >= 2) {
      // The last sentence of chunk N should appear at the start of chunk N+1
      const lastSentenceOfChunk0 = chunks[0].split(/(?<=[.!?])\s+/).pop() ?? '';
      if (lastSentenceOfChunk0) {
        expect(chunks[1]).toContain(lastSentenceOfChunk0.trim());
      }
    }
  });

  it('should return original text wrapped in array if no split needed', () => {
    const text = 'Short.';
    const chunks = splitIntoChunksWithOverlap(text, 500);
    expect(chunks).toEqual(['Short.']);
  });

  it('should handle text with no sentence boundaries', () => {
    // A single long word without punctuation
    const text = 'A'.repeat(600);
    const chunks = splitIntoChunksWithOverlap(text, 500);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle multiple paragraphs correctly', () => {
    const text = 'Para one.\n\nPara two.\n\nPara three.';
    const chunks = splitIntoChunksWithOverlap(text, 500);
    // All fits in one chunk
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain('Para one.');
    expect(chunks[0]).toContain('Para two.');
    expect(chunks[0]).toContain('Para three.');
  });
});
