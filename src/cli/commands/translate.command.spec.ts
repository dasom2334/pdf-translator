import { Test } from '@nestjs/testing';
import { CliModule } from '../cli.module';
import { TranslateCommand } from './translate.command';

describe('TranslateCommand', () => {
  it('should resolve TranslateCommand', async () => {
    const module = await Test.createTestingModule({
      imports: [CliModule],
    }).compile();
    const command = module.get(TranslateCommand);
    expect(command).toBeDefined();
  });
});
