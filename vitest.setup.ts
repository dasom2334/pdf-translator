import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { beforeAll, afterEach, afterAll } from 'vitest';

export const mswServer = setupServer(
  http.get('https://api.mymemory.translated.net/get', ({ request }) => {
    const url = new URL(request.url);
    const text = url.searchParams.get('q') ?? '';
    return HttpResponse.json({
      responseStatus: 200,
      responseData: { translatedText: `[translated] ${text}` },
    });
  }),
);

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());
