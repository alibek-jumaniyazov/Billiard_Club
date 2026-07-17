import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
/** Autentifikatsiyasiz kirish mumkin bo'lgan endpointlar (login, refresh, health) */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
