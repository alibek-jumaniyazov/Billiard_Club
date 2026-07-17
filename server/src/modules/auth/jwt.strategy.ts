import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';

export interface JwtPayload {
  sub: number;
  username: string;
  role: string;
  clubId: number | null;
  /** Token versiyasi — parol almashtirilganda eski tokenlar bekor bo'ladi */
  tv: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET')!,
    });
  }

  /**
   * Har so'rovda foydalanuvchi DB dan tekshiriladi — isActive=false qilingan
   * xodimning tokeni darhol ishlamay qoladi (bloklash kechikmaydi).
   * tokenVersion mos kelmasa (parol almashtirilgan) — token bekor.
   */
  async validate(payload: JwtPayload): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException({ key: 'auth.userNotFoundOrBlocked' });
    }
    if ((payload.tv ?? -1) !== user.tokenVersion) {
      throw new UnauthorizedException({ key: 'auth.invalidToken' });
    }
    return user;
  }
}
