import { IsEnum, IsOptional, IsString, MaxLength, Matches } from 'class-validator';
import { ReleasePlatform } from '../../../entities/enums';

export class CreateReleaseDto {
  /**
   * Semver. Regex DTO darajasida ham turadi (servisda ham tekshiriladi):
   * bu qiymat diskdagi fayl nomiga tushadi, shuning uchun u yerga faqat
   * raqam, nuqta va defis o'tishi kerak.
   */
  @IsString()
  @MaxLength(30)
  @Matches(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, {
    message: 'version semver bo\'lishi kerak, masalan 1.0.1',
  })
  version: string;

  @IsEnum(ReleasePlatform)
  platform: ReleasePlatform;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notesUz?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notesRu?: string;
}
