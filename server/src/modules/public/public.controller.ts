import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Lang, Language } from '../../common/decorators/lang.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { t } from '../../common/i18n/messages';
import { RegisterDto } from './dto/register.dto';
import { PublicService } from './public.service';

@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  /** Landing dan ro'yxatdan o'tish — spam himoyasi: soatiga 5 ta urinish */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  @HttpCode(201)
  @Post('register')
  async register(@Body() dto: RegisterDto, @Lang() lang: Language) {
    const data = await this.publicService.register(dto);
    return { success: true, message: t(lang, 'clubs.created'), data };
  }
}
