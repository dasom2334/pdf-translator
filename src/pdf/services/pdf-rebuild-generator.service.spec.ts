import { Test, TestingModule } from '@nestjs/testing';
import { PdfRebuildGeneratorService } from './pdf-rebuild-generator.service';

describe('PdfRebuildGeneratorService', () => {
  let service: PdfRebuildGeneratorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PdfRebuildGeneratorService],
    }).compile();

    service = module.get<PdfRebuildGeneratorService>(PdfRebuildGeneratorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
