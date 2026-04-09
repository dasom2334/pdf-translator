import { InternalServerErrorException } from '@nestjs/common';

/** Render scale for page rasterization (2.0 = 144 dpi). */
const RENDER_SCALE = 2.0;

export interface RenderedPage {
  /** PNG-encoded image of the page at RENDER_SCALE. */
  pngBuffer: Buffer;
  /** Original page width in PDF points (1/72 inch). */
  width: number;
  /** Original page height in PDF points (1/72 inch). */
  height: number;
}

/**
 * Renders every page of a PDF to a PNG buffer using pdfjs-dist + @napi-rs/canvas.
 *
 * pdfjs-dist v4's built-in NodeCanvasFactory uses @napi-rs/canvas internally.
 * We use the same package for the main render canvas so that drawImage calls
 * between the main context and pdfjs sub-canvases are type-compatible.
 *
 * Each PNG is rendered at RENDER_SCALE (144 dpi) for acceptable quality while
 * keeping the returned RenderedPage.width/height at the original PDF-point
 * dimensions so callers can place the image at 1:1 in a new pdf-lib document.
 */
export async function renderPdfPages(pdfBuffer: Buffer): Promise<RenderedPage[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs') as {
    getDocument: (params: { data: Uint8Array }) => { promise: Promise<PdfjsDocument> };
  };

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createCanvas } = require('@napi-rs/canvas') as {
    createCanvas: (width: number, height: number) => NapiCanvas;
  };

  let pdfDoc: PdfjsDocument;
  try {
    // Do not pass a custom canvasFactory — pdfjs's built-in NodeCanvasFactory
    // also uses @napi-rs/canvas, keeping all canvas objects type-compatible.
    pdfDoc = await pdfjs.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
  } catch (err) {
    throw new InternalServerErrorException(
      `PDF 페이지 렌더링 실패: ${(err as Error).message}`,
    );
  }

  const pages: RenderedPage[] = [];

  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const renderViewport = page.getViewport({ scale: RENDER_SCALE });

    const canvas = createCanvas(
      Math.ceil(renderViewport.width),
      Math.ceil(renderViewport.height),
    );
    const ctx = canvas.getContext('2d');

    await page.render({
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport: renderViewport,
    }).promise;

    pages.push({
      pngBuffer: canvas.toBuffer('image/png') as Buffer,
      width: viewport.width,
      height: viewport.height,
    });

    page.cleanup();
  }

  await pdfDoc.destroy();
  return pages;
}

// ---------------------------------------------------------------------------
// Minimal type stubs
// ---------------------------------------------------------------------------

interface NapiCanvas {
  getContext(type: '2d'): CanvasRenderingContext2D;
  toBuffer(format: 'image/png'): Buffer | Uint8Array;
}

interface PdfjsDocument {
  numPages: number;
  getPage(pageNum: number): Promise<PdfjsPage>;
  destroy(): Promise<void>;
}

interface PdfjsPage {
  getViewport(params: { scale: number }): PdfjsViewport;
  render(params: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfjsViewport;
  }): { promise: Promise<void> };
  cleanup(): void;
}

interface PdfjsViewport {
  width: number;
  height: number;
}
