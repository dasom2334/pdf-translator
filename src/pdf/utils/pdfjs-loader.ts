/**
 * Lazy loader for pdfjs-dist.
 * pdfjs-dist v4+ is ESM-only; we use the legacy build which is compatible with CJS.
 * Wrapping in a function allows Jest to mock this module easily.
 */

export const getPdfjs = (): { getDocument: (params: { data: Uint8Array }) => { promise: Promise<unknown> } } => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('pdfjs-dist/legacy/build/pdf.mjs');
};
