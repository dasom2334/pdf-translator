/**
 * Post-process a translated text result:
 * - Collapse multiple consecutive blank lines into a single blank line
 * - Remove HTML/XML-like tags that may be injected by translation APIs
 * - Trim leading/trailing whitespace
 */
export function postProcessTranslation(text: string): string {
  return text
    // Remove HTML/XML tags (e.g., <b>, </p>, <br/>) that some APIs inject
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    // Collapse 3+ consecutive newlines into 2
    .replace(/\n{3,}/g, '\n\n')
    // Collapse multiple spaces (but not newlines) into one
    .replace(/[^\S\n]{2,}/g, ' ')
    // Trim
    .trim();
}

/**
 * Split text into chunks with optional sentence-level overlap for context preservation.
 *
 * @param text - Input text
 * @param maxChunkSize - Maximum characters per chunk
 * @param overlapSentences - Number of sentences to carry over as leading context (default 1)
 */
export function splitIntoChunksWithOverlap(
  text: string,
  maxChunkSize: number,
  overlapSentences = 1,
): string[] {
  if (text.length <= maxChunkSize) {
    return [text];
  }

  // Split into paragraphs first
  const paragraphs = text.split(/\n\n+/);
  const allSentences: string[] = [];

  for (const paragraph of paragraphs) {
    const sentences = paragraph
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (sentences.length === 0) continue;
    allSentences.push(...sentences);
    // Paragraph boundary marker (empty string signals paragraph break)
    allSentences.push('');
  }

  // Remove trailing empty marker if any
  while (allSentences.length > 0 && allSentences[allSentences.length - 1] === '') {
    allSentences.pop();
  }

  const chunks: string[] = [];
  let chunkSentences: string[] = [];
  let chunkLength = 0;
  let overlapBuffer: string[] = [];

  const flushChunk = () => {
    if (chunkSentences.length === 0) return;

    // Build chunk text, respecting paragraph markers
    const chunkText = buildChunkText(chunkSentences);
    if (chunkText.trim()) {
      chunks.push(chunkText.trim());
    }

    // Carry over the last N non-empty sentences as overlap for next chunk
    const nonEmptySentences = chunkSentences.filter((s) => s !== '');
    overlapBuffer = overlapSentences > 0 ? nonEmptySentences.slice(-overlapSentences) : [];

    chunkSentences = [...overlapBuffer];
    chunkLength = chunkSentences.reduce((sum, s) => sum + s.length + 1, 0);
  };

  for (const sentence of allSentences) {
    const addedLength = sentence === '' ? 2 : sentence.length + 1;

    if (chunkLength + addedLength > maxChunkSize && chunkSentences.length > 0) {
      flushChunk();
    }

    // If a single sentence is still too long, truncate
    if (sentence !== '' && sentence.length > maxChunkSize) {
      chunkSentences.push(sentence.slice(0, maxChunkSize));
      chunkLength += maxChunkSize + 1;
      flushChunk();
    } else {
      chunkSentences.push(sentence);
      chunkLength += addedLength;
    }
  }

  if (chunkSentences.length > 0) {
    const chunkText = buildChunkText(chunkSentences);
    if (chunkText.trim()) {
      chunks.push(chunkText.trim());
    }
  }

  return chunks.length > 0 ? chunks : [text];
}

function buildChunkText(sentences: string[]): string {
  const parts: string[] = [];
  let current: string[] = [];

  for (const s of sentences) {
    if (s === '') {
      // Paragraph break
      if (current.length > 0) {
        parts.push(current.join(' '));
        current = [];
      }
    } else {
      current.push(s);
    }
  }

  if (current.length > 0) {
    parts.push(current.join(' '));
  }

  return parts.join('\n\n');
}
