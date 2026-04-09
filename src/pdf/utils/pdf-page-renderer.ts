import { createCanvas } from 'canvas';
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
 * Canvas factory for pdfjs-dist in Node.js.
 *
 * pdfjs's getDocument() accepts a `CanvasFactory` class (constructor).
 * All canvas objects — main render canvas and pdfjs internal sub-canvases
 * (transparency groups, patterns) — are created through this factory,
 * ensuring type consistency when drawImage is called across them.
 */
class NodeCanvasFactory {
  create(width: number, height: number) {
    const canvas = createCanvas(width, height);
    return { canvas, context: canvas.getContext('2d') };
  }

  reset(
    cac: { canvas: ReturnType<typeof createCanvas>; context: unknown },
    width: number,
    height: number,
  ) {
    cac.canvas.width = width;
    cac.canvas.height = height;
    cac.context = cac.canvas.getContext('2d');
  }

  destroy(cac: { canvas: ReturnType<typeof createCanvas> | null; context: unknown }) {
    if (cac.canvas) {
      cac.canvas.width = 0;
      cac.canvas.height = 0;
    }
    cac.canvas = null;
    cac.context = null;
  }
}

/**
 * Renders every page of a PDF to a PNG buffer using pdfjs-dist + node-canvas.
 *
 * Each PNG is rendered at RENDER_SCALE (144 dpi) for acceptable quality while
 * keeping the returned RenderedPage.width/height at the original PDF-point
 * dimensions so callers can place the image at 1:1 in a new pdf-lib document.
 */
export async function renderPdfPages(pdfBuffer: Buffer): Promise<RenderedPage[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs') as {
    getDocument: (params: { data: Uint8Array; CanvasFactory: typeof NodeCanvasFactory }) => {
      promise: Promise<PdfjsDocument>;
    };
  };

  let pdfDoc: PdfjsDocument;
  try {
    // Pass CanvasFactory as a class (constructor), not an instance.
    // pdfjs uses it to create all internal canvases (transparency groups, etc.)
    // so they are the same type as our main render canvas — no drawImage conflicts.
    pdfDoc = await pdfjs.getDocument({
      data: new Uint8Array(pdfBuffer),
      CanvasFactory: NodeCanvasFactory,
    }).promise;
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
      pngBuffer: canvas.toBuffer('image/png'),
      width: viewport.width,
      height: viewport.height,
    });

    page.cleanup();
  }

  await pdfDoc.destroy();
  return pages;
}

// ---------------------------------------------------------------------------
// Minimal pdfjs type stubs
// ---------------------------------------------------------------------------

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
