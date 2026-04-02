import { Test, TestingModule } from '@nestjs/testing';
import { GeminiTranslationService } from './gemini-translation.service';

describe('GeminiTranslationService', () => {
  let service: GeminiTranslationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GeminiTranslationService],
    }).compile();

    service = module.get<GeminiTranslationService>(GeminiTranslationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
