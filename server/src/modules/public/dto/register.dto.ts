import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Landing sahifadan o'zini-o'zi ro'yxatdan o'tkazish — HAMMA maydonlar majburiy */
export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(150)
  clubName: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  ownerName: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[\d\s()-]{7,20}$/, { message: "Telefon raqam noto'g'ri formatda" })
  phone: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(300)
  address: string;

  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9_.-]+$/, {
    message: 'Login faqat lotin harflari, raqam va _ . - dan iborat bo\'lishi kerak',
  })
  username: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password: string;

  /**
   * Honeypot — odam ko'rmaydigan yashirin maydon. Botlar to'ldiradi;
   * qiymat kelsa so'rov jimgina rad etiladi.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}
