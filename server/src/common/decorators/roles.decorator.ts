import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../entities/enums';

export const ROLES_KEY = 'roles';
/** Endpointga kirish uchun ruxsat etilgan rollar */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
