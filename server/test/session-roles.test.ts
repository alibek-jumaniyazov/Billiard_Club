import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ROLES_KEY } from '../src/common/decorators/roles.decorator';
import { UserRole } from '../src/entities/enums';
import { SessionsController } from '../src/modules/sessions/sessions.controller';

/**
 * Xodim rollari: operator o'yinni boshlaydi, boshqaradi va HISOB-KITOB qiladi
 * (o'yinni yakunlaydi). Bekor qilish — faqat admin va kassir (pul izi o'chadi).
 */
const rolesOf = (method: 'start' | 'end' | 'pause' | 'transfer' | 'cancel'): UserRole[] =>
  Reflect.getMetadata(ROLES_KEY, SessionsController.prototype[method]) as UserRole[];

test('operator o‘yinni yakunlay oladi (hisob-kitob), lekin bekor qila olmaydi', () => {
  for (const method of ['start', 'end', 'pause', 'transfer'] as const) {
    assert.ok(rolesOf(method).includes(UserRole.OPERATOR), `${method}: operator ruxsat etilishi kerak`);
    assert.ok(rolesOf(method).includes(UserRole.KASSIR), `${method}: kassir ruxsat etilishi kerak`);
  }
  assert.equal(rolesOf('cancel').includes(UserRole.OPERATOR), false, 'bekor qilish operatorga yopiq');
  assert.ok(rolesOf('cancel').includes(UserRole.KASSIR));
});
