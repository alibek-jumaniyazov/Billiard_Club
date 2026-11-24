import { IsBoolean, IsIn, IsObject, IsOptional, Matches } from 'class-validator';

export class UpdateOwnerChatDto {
  @IsOptional()
  @IsBoolean()
  dailyReport?: boolean;

  /** Klub vaqti bo'yicha 'HH:MM' */
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  reportTime?: string;

  /** Dushanba — hafta yakuni, oyning 1-kuni — oy yakuni */
  @IsOptional()
  @IsBoolean()
  periodReports?: boolean;

  @IsOptional()
  @IsIn(['uz', 'ru'])
  lang?: 'uz' | 'ru';

  /** { cancel, discount, shift, debt, prices, stock }: boolean — noma'lum kalitlar e'tiborsiz */
  @IsOptional()
  @IsObject()
  alerts?: Record<string, unknown>;
}

export class SendOwnerReportDto {
  @IsIn(['yesterday', 'today', 'week', 'live'])
  kind!: 'yesterday' | 'today' | 'week' | 'live';
}

export class OwnerReportPreviewDto {
  @IsOptional()
  @IsIn(['yesterday', 'today', 'week', 'live'])
  kind?: 'yesterday' | 'today' | 'week' | 'live';

  @IsOptional()
  @IsIn(['uz', 'ru'])
  lang?: 'uz' | 'ru';
}
