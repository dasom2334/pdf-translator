import { Test, TestingModule } from '@nestjs/testing';
import { TranslationModule } from './translation.module';
import { TranslationServiceFactory } from './factories/translation-service.factory';

describe('TranslationModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [TranslationModule],
    }).compile();
  });

  it('should compile the module', () => {
    expect(module).toBeDefined();
  });

  it('should provide TranslationServiceFactory', () => {
    const factory = module.get<TranslationServiceFactory>(
      TranslationServiceFactory,
    );
    expect(factory).toBeDefined();
  });
});
