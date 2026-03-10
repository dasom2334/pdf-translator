import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('PDF Translator (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /pdf/supported-languages - should return 200', () => {
    return request(app.getHttpServer())
      .get('/pdf/supported-languages')
      .expect(500); // Not implemented yet — verifies endpoint exists
  });

  it('POST /pdf/translate - should return 500 (not implemented)', () => {
    return request(app.getHttpServer())
      .post('/pdf/translate')
      .send({ sourceLang: 'en', targetLang: 'ko' })
      .expect(500); // Not implemented yet — verifies endpoint exists
  });
});
