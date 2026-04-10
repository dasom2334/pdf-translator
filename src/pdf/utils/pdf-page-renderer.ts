import { createCanvas } from '@napi-rs/canvas';
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
 * Renders selected pages of a PDF to PNG buffers using pdfjs-dist + @napi-rs/canvas.
 *
 * @param pdfBuffer  Raw PDF bytes.
 * @param pageNumbers  1-based page numbers to render. When omitted, all pages are rendered.
 * @returns Map keyed by 1-based page number.
 *
 * pdfjs-dist already depends on @napi-rs/canvas for its internal NodeCanvasFactory,
 * so using the same package here ensures all canvases are the same type.
 * No custom CanvasFactory injection needed.
 */
export async function renderPdfPages(
  pdfBuffer: Buffer,
  pageNumbers?: Set<number>,
): Promise<Map<number, RenderedPage>> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs') as {
    getDocument: (params: { data: Uint8Array }) => {
      promise: Promise<PdfjsDocument>;
    };
  };

  let pdfDoc: PdfjsDocument;
  try {
    // CanvasFactory를 따로 주입하지 않는다.
    // pdfjs는 내부 서브 캔버스 생성에 기본 NodeCanvasFactory(@napi-rs/canvas)를 사용하고,
    // 우리 메인 캔버스도 같은 패키지를 쓰므로 drawImage 타입 충돌이 없다.
    pdfDoc = await pdfjs.getDocument({
      data: new Uint8Array(pdfBuffer),
    }).promise;
  } catch (err) {
    throw new InternalServerErrorException(
      `PDF 페이지 렌더링 실패: ${(err as Error).message}`,
    );
  }

  const pages = new Map<number, RenderedPage>();

  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    // pageNumbers가 지정된 경우 해당 페이지만 렌더링 (성능 최적화)
    if (pageNumbers && !pageNumbers.has(pageNum)) continue;

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

    pages.set(pageNum, {
      // @napi-rs/canvas의 toBuffer()는 Node.js Buffer와 호환되나 타입이 다르므로 캐스팅
      pngBuffer: canvas.toBuffer('image/png') as unknown as Buffer,
      // 원본 PDF 포인트 단위 크기 (1 point = 1/72 inch) — overlay 시 1:1 매핑용
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
