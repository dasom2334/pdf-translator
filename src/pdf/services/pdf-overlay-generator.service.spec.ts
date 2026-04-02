import { Test, TestingModule } from '@nestjs/testing';
import { PdfOverlayGeneratorService } from './pdf-overlay-generator.service';

describe('PdfOverlayGeneratorService', () => {
  let service: PdfOverlayGeneratorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PdfOverlayGeneratorService],
    }).compile();

    service = module.get<PdfOverlayGeneratorService>(PdfOverlayGeneratorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
