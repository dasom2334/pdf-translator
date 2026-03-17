import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { TranslationServiceFactory } from './translation-service.factory';
import { MyMemoryTranslationService } from '../services/mymemory-translation.service';
import { TranslationProvider } from '../../common/enums/translation-provider.enum';

describe('TranslationServiceFactory', () => {
  let factory: TranslationServiceFactory;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TranslationServiceFactory,
        { provide: MyMemoryTranslationService, useValue: {} },
      ],
    }).compile();
    factory = moduleRef.get(TranslationServiceFactory);
  });

  it('should return MyMemoryTranslationService for MYMEMORY provider', () => {
    const service = factory.getService(TranslationProvider.MYMEMORY);
    expect(service).toBeDefined();
  });

  it('should throw Error for GEMINI provider (Phase 2)', () => {
    expect(() => factory.getService(TranslationProvider.GEMINI)).toThrow('Phase 2');
  });

  it('should throw BadRequestException for unknown provider', () => {
    expect(() => factory.getService('unknown' as TranslationProvider)).toThrow(BadRequestException);
  });
});
