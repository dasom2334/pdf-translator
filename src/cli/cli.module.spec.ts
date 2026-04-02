import { Test } from '@nestjs/testing';
import { CliModule } from './cli.module';

describe('CliModule', () => {
  it('should compile', async () => {
    const module = await Test.createTestingModule({
      imports: [CliModule],
    }).compile();
    expect(module).toBeDefined();
  });
});
