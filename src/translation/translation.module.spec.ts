import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { TranslationModule } from './translation.module';
import { TranslationServiceFactory } from './factories/translation-service.factory';

jest.mock('deepl-node', () => ({
  Translator: jest.fn().mockImplementation(() => ({
    translateText: jest.fn(),
    getTargetLanguages: jest.fn(),
  })),
}));

describe('TranslationModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        TranslationModule,
      ],
    })
      .overrideProvider('DeepLTranslationService')
      .useValue({
        translate: jest.fn(),
        translateBatch: jest.fn(),
        getSupportedLanguages: jest.fn(),
      })
      .compile();
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
