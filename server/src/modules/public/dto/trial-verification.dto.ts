import { IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class StartTrialVerificationDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}

export class TrialVerificationStatusDto {
  @IsUUID('4')
  id: string;

  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  token: string;
}
