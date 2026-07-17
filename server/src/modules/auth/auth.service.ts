import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { Club } from '../../entities/club.entity';
import { User } from '../../entities/user.entity';
import { JwtPayload } from './jwt.strategy';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Club) private readonly clubRepo: Repository<Club>,
  ) {}

  generateTokens(user: User): AuthTokens {
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      clubId: user.clubId,
      tv: user.tokenVersion,
    };
    const accessToken = this.jwtService.sign(payload, {
      secret: this.config.get<string>('JWT_SECRET'),
      expiresIn: (this.config.get<string>('JWT_EXPIRES_IN') ??
        '8h') as JwtSignOptions['expiresIn'],
    });
    const refreshToken = this.jwtService.sign(
      { sub: user.id, tv: user.tokenVersion },
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: (this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ??
          '7d') as JwtSignOptions['expiresIn'],
      },
    );
    return { accessToken, refreshToken };
  }

  async login(username: string, password: string) {
    // password select:false — login uchun alohida so'raladi
    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.username = :username', { username })
      .andWhere('user.isActive = true')
      .getOne();

    if (!user) {
      throw new UnauthorizedException({ key: 'auth.invalidCredentials' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException({ key: 'auth.invalidCredentials' });
    }

    await this.userRepo.update(user.id, { lastLogin: new Date() });
    const club = user.clubId
      ? await this.clubRepo.findOne({ where: { id: user.clubId } })
      : null;

    const tokens = this.generateTokens(user);
    return { user: this.sanitize(user), club: this.clubInfo(club), ...tokens };
  }

  async refresh(refreshToken: string) {
    let payload: { sub: number; tv?: number };
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException({ key: 'auth.invalidToken' });
    }

    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException({ key: 'auth.invalidToken' });
    }
    // Parol almashtirilgan bo'lsa eski refresh token ham bekor
    if ((payload.tv ?? -1) !== user.tokenVersion) {
      throw new UnauthorizedException({ key: 'auth.invalidToken' });
    }

    const club = user.clubId
      ? await this.clubRepo.findOne({ where: { id: user.clubId } })
      : null;
    const tokens = this.generateTokens(user);
    return { user: this.sanitize(user), club: this.clubInfo(club), ...tokens };
  }

  async me(user: User) {
    const club = user.clubId
      ? await this.clubRepo.findOne({ where: { id: user.clubId } })
      : null;
    return { user: this.sanitize(user), club: this.clubInfo(club) };
  }

  /** Klientga kerakli klub obuna ma'lumotlari (blok ekrani uchun ham) */
  private clubInfo(club: Club | null) {
    if (!club) return null;
    return {
      id: club.id,
      name: club.name,
      status: club.status,
      trialEndsAt: club.trialEndsAt,
      subscriptionEndsAt: club.subscriptionEndsAt,
      effectiveEndsAt: club.effectiveEndsAt,
      isExpired: club.isExpired,
    };
  }

  private sanitize(user: User) {
    const { password: _password, ...safe } = user as User & { password?: string };
    return safe;
  }
}
