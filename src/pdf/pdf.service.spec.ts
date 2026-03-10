import { Test, TestingModule } from '@nestjs/testing';
import { PdfService } from './pdf.service';
import { TranslationServiceFactory } from '../translation/factories/translation-service.factory';

const mockTranslationServiceFactory = {
  getService: jest.fn(),
};

describe('PdfService', () => {
  let service: PdfService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdfService,
        {
          provide: TranslationServiceFactory,
          useValue: mockTranslationServiceFactory,
        },
      ],
    }).compile();

    service = module.get<PdfService>(PdfService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
