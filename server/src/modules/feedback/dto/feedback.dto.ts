import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { FeedbackPriority, FeedbackStatus, FeedbackType } from '../../../entities/enums';

export class CreateFeedbackDto {
  @IsEnum(FeedbackType)
  type: FeedbackType;

  @IsEnum(FeedbackPriority)
  priority: FeedbackPriority;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  message: string;

  /**
   * Biriktirilgan rasmlar — base64 data-URL lar
   * (data:image/png;base64,...). Eng ko'pi 3 ta, har biri 500KB gacha.
   * 800000 belgi ≈ 500KB * 4/3 (base64 kengayishi) zahira bilan.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @MaxLength(800000, { each: true })
  attachments?: string[];
}

export class ListFeedbackQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number;
}

export class AdminListFeedbackQueryDto extends ListFeedbackQueryDto {
  @IsOptional()
  @IsEnum(FeedbackStatus)
  status?: FeedbackStatus;

  @IsOptional()
  @IsEnum(FeedbackType)
  type?: FeedbackType;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  clubId?: number;
}

export class UpdateFeedbackStatusDto {
  @IsEnum(FeedbackStatus)
  status: FeedbackStatus;
}

export class ReplyFeedbackDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  reply: string;
}
