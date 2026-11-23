import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ROLES_KEY } from '../src/common/decorators/roles.decorator';
import { UserRole } from '../src/entities/enums';
import { LightsController } from '../src/modules/lights/lights.controller';
import { SessionsController } from '../src/modules/sessions/sessions.controller';

/**
 * Operator chiroqqa umuman tegmaydi (klub egasi talabi): ko'rish, qo'lda yoqish/o'chirish,
 * "hammasini" boshqaruvi, jurnal, sozlash va sinov — hammasi yopiq. Chiroq esa operator
 * boshlagan o'yin bilan avtomatik yonadi: o'yinni boshlash/yakunlash operatorga ochiq qoladi.
 */
type LightMethod = keyof LightsController & string;

const rolesOf = (method: LightMethod): UserRole[] =>
  (Reflect.getMetadata(ROLES_KEY, LightsController.prototype[method]) as UserRole[] | undefined) ?? [];

const ALL_METHODS: LightMethod[] = [
  'overview',
  'updateSettings',
  'updateTables',
  'updateTable',
  'test',
  'override',
  'overrideAll',
  'events',
];

test('operator chiroq API laridan birortasiga ham kira olmaydi', () => {
  for (const method of ALL_METHODS) {
    const roles = rolesOf(method);
    assert.ok(roles.length > 0, `${method}: rollar belgilanmagan`);
    assert.equal(roles.includes(UserRole.OPERATOR), false, `${method}: operatorga yopiq bo'lishi kerak`);
    assert.ok(roles.includes(UserRole.ADMIN), `${method}: admin ruxsat etilishi kerak`);
  }
});

test('kassir zalni ko‘radi va qo‘lda boshqaradi, lekin sozlay olmaydi', () => {
  for (const method of ['overview', 'override', 'overrideAll', 'events'] as const) {
    assert.ok(rolesOf(method).includes(UserRole.KASSIR), `${method}: kassir ruxsat etilishi kerak`);
  }
  for (const method of ['updateSettings', 'updateTables', 'updateTable', 'test'] as const) {
    assert.equal(rolesOf(method).includes(UserRole.KASSIR), false, `${method}: kassirga yopiq`);
  }
});

test('operator o‘yinni boshlay oladi — chiroq o‘yin bilan avtomatik yonadi', () => {
  const start = Reflect.getMetadata(ROLES_KEY, SessionsController.prototype.start) as UserRole[];
  assert.ok(start.includes(UserRole.OPERATOR));
});
