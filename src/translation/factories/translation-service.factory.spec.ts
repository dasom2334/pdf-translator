import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { TranslationServiceFactory } from './translation-service.factory';
import { TranslationProvider } from '../../common/enums/translation-provider.enum';
import { MyMemoryTranslationService } from '../services/mymemory-translation.service';
import { GeminiTranslationService } from '../services/gemini-translation.service';

jest.mock('@google/generative-ai', () => {
  const MockGoogleGenerativeAI = jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({ generateContent: jest.fn() }),
  }));
  return { GoogleGenerativeAI: MockGoogleGenerativeAI };
});

describe('TranslationServiceFactory', () => {
  let factory: TranslationServiceFactory;
  let myMemoryService: MyMemoryTranslationService;
  let geminiService: GeminiTranslationService;

  beforeEach(async () => {
    process.env.GEMINI_API_KEY = 'test-key';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TranslationServiceFactory,
        MyMemoryTranslationService,
        GeminiTranslationService,
      ],
    }).compile();

    factory = module.get<TranslationServiceFactory>(TranslationServiceFactory);
    myMemoryService = module.get<MyMemoryTranslationService>(MyMemoryTranslationService);
    geminiService = module.get<GeminiTranslationService>(GeminiTranslationService);

    // Initialize Gemini service
    geminiService.onModuleInit();
  });

  it('should be defined', () => {
    expect(factory).toBeDefined();
  });

  describe('getService', () => {
    it('should return MyMemoryTranslationService for MYMEMORY provider', () => {
      const service = factory.getService(TranslationProvider.MYMEMORY);
      expect(service).toBe(myMemoryService);
    });

    it('should return GeminiTranslationService for GEMINI provider', () => {
      const service = factory.getService(TranslationProvider.GEMINI);
      expect(service).toBe(geminiService);
    });

    it('should throw BadRequestException for unknown provider', () => {
      expect(() => factory.getService('unknown' as TranslationProvider)).toThrow(
        BadRequestException,
      );
    });
  });
});
