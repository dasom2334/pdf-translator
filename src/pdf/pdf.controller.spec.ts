import { Test, TestingModule } from '@nestjs/testing';
import { PdfController } from './pdf.controller';
import { PdfService } from './pdf.service';
import { TranslationServiceFactory } from '../translation/factories/translation-service.factory';

const mockTranslationServiceFactory = {
  getService: jest.fn(),
};

describe('PdfController', () => {
  let controller: PdfController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PdfController],
      providers: [
        PdfService,
        {
          provide: TranslationServiceFactory,
          useValue: mockTranslationServiceFactory,
        },
      ],
    }).compile();

    controller = module.get<PdfController>(PdfController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
