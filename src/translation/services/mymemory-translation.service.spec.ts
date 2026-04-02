import { Test, TestingModule } from '@nestjs/testing';
import { MyMemoryTranslationService } from './mymemory-translation.service';

describe('MyMemoryTranslationService', () => {
  let service: MyMemoryTranslationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MyMemoryTranslationService],
    }).compile();

    service = module.get<MyMemoryTranslationService>(MyMemoryTranslationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
