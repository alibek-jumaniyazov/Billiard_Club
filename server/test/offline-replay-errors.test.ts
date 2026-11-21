import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ForbiddenException, HttpException } from '@nestjs/common';
import type { PlanTiersService } from '../src/common/plan-tiers/plan-tiers.service';
import { UserRole } from '../src/entities/enums';
import type { Club } from '../src/entities/club.entity';
import type { User } from '../src/entities/user.entity';
import type { EndSessionDto } from '../src/modules/sessions/dto/sessions.dto';
import { SessionsController } from '../src/modules/sessions/sessions.controller';
import type { SessionsService } from '../src/modules/sessions/sessions.service';

/**
 * OFLAYN NAVBATDAN KELGAN QARZ — tarif rad etsa 400 (403 emas).
 *
 * Klient navbati 401/403 ni vaqtinchalik (token muddati) deb qayta-qayta
 * yuboradi va urinishlar tugagach butun navbatni to'xtatadi. Tarif cheklovi
 * esa doimiy sabab: oflayn amal darhol "xato" bo'lib ko'rinishi va faqat
 * o'ziga bog'liq amallarni ushlashi kerak. Onlayn javob o'zgarmaydi.
 */

const locked = new ForbiddenException({
  key: 'subscription.featureLocked',
  code: 'FEATURE_LOCKED',
  args: { tier: 'Pro', tierRu: 'Pro' },
});
let ended = 0;
const controller = new SessionsController(
  { end: async () => { ended += 1; return { isDebt: true }; } } as unknown as SessionsService,
  { assertFeature: async () => { throw locked; } } as unknown as PlanTiersService,
);
const kassir = { id: 1, role: UserRole.KASSIR } as User;
const club = { id: 1, tier: 'standard' } as Club;
const debtBody = { isDebt: true, isTableDebt: true, customerId: 5, payments: [] } as unknown as EndSessionDto;

const status = (error: unknown) => (error as HttpException).getStatus();

test('oflayn qarz tarifda yopiq bo‘lsa — 400, javob (kalit va kod) o‘zgarmaydi', async () => {
  await assert.rejects(
    () => controller.end(1, kassir, club, 7, { ...debtBody, offlineAt: new Date().toISOString() }, 'uz'),
    (error) => {
      assert.equal(status(error), 400);
      assert.deepEqual((error as HttpException).getResponse(), locked.getResponse());
      return true;
    },
  );
  assert.equal(ended, 0, 'hisob-kitob bajarilmadi');
});

test('onlayn qarz tarifda yopiq bo‘lsa — avvalgidek 403', async () => {
  await assert.rejects(() => controller.end(1, kassir, club, 7, debtBody, 'uz'), (error) => status(error) === 403);
  assert.equal(ended, 0);
});
