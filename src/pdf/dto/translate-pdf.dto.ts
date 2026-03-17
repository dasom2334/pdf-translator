import { IsString, IsOptional } from 'class-validator';

export class TranslatePdfDto {
  @IsString()
  targetLang!: string;

  @IsOptional()
  @IsString()
  sourceLang?: string;

  @IsOptional()
  @IsString()
  provider?: string;
}
