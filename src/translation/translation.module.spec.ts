import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { TranslationModule } from './translation.module';
import { TranslationServiceFactory } from './factories/translation-service.factory';

describe('TranslationModule', () => {
  it('should resolve TranslationServiceFactory', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TranslationModule],
    }).compile();
    const factory = moduleRef.get(TranslationServiceFactory);
    expect(factory).toBeDefined();
  });
});
