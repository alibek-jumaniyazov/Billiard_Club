import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang, Language } from '../../common/decorators/lang.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { SkipSubscription } from '../../common/decorators/skip-subscription.decorator';
import { t } from '../../common/i18n/messages';
import { User } from '../../entities/user.entity';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** Brute-force himoyasi: 1 daqiqada 10 ta urinish */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  async login(@Body() dto: LoginDto, @Lang() lang: Language) {
    const data = await this.authService.login(dto.username, dto.password);
    return { success: true, message: t(lang, 'auth.loginSuccess'), data };
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post('refresh')
  async refresh(@Body() dto: RefreshDto) {
    const data = await this.authService.refresh(dto.refreshToken);
    return { success: true, data };
  }

  /** Obuna tugagan bo'lsa ham ishlaydi — blok ekrani klub holatini shu yerdan oladi */
  @SkipSubscription()
  @Get('me')
  async me(@CurrentUser() user: User) {
    const data = await this.authService.me(user);
    return { success: true, data };
  }

  @SkipSubscription()
  @HttpCode(200)
  @Post('logout')
  logout(@Lang() lang: Language) {
    return { success: true, message: t(lang, 'auth.logoutSuccess') };
  }
}
