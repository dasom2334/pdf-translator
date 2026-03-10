import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { TranslationServiceFactory } from './translation-service.factory';
import { DeepLTranslationService } from '../services/deepl-translation.service';
import { GoogleTranslationService } from '../services/google-translation.service';
import { LlmTranslationService } from '../services/llm-translation.service';
import { TranslationProvider } from '../../common/enums/translation-provider.enum';

const mockDeepL = {
  translate: jest.fn(),
  translateBatch: jest.fn(),
  getSupportedLanguages: jest.fn(),
};
const mockGoogle = {
  translate: jest.fn(),
  translateBatch: jest.fn(),
  getSupportedLanguages: jest.fn(),
};
const mockLlm = {
  translate: jest.fn(),
  translateBatch: jest.fn(),
  getSupportedLanguages: jest.fn(),
};

describe('TranslationServiceFactory', () => {
  let factory: TranslationServiceFactory;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TranslationServiceFactory,
        { provide: DeepLTranslationService, useValue: mockDeepL },
        { provide: GoogleTranslationService, useValue: mockGoogle },
        { provide: LlmTranslationService, useValue: mockLlm },
      ],
    }).compile();

    factory = module.get<TranslationServiceFactory>(TranslationServiceFactory);
  });

  it('should return DeepLTranslationService for DEEPL provider', () => {
    expect(factory.getService(TranslationProvider.DEEPL)).toBe(mockDeepL);
  });

  it('should return GoogleTranslationService for GOOGLE provider', () => {
    expect(factory.getService(TranslationProvider.GOOGLE)).toBe(mockGoogle);
  });

  it('should return LlmTranslationService for LLM provider', () => {
    expect(factory.getService(TranslationProvider.LLM)).toBe(mockLlm);
  });

  it('should throw BadRequestException for invalid provider', () => {
    expect(() => factory.getService('invalid' as TranslationProvider)).toThrow(
      BadRequestException,
    );
  });
});
