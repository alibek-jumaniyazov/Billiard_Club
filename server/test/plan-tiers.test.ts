import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Club } from '../src/entities/club.entity';
import { ClubStatus, UserRole } from '../src/entities/enums';
import { SubscriptionGuard } from '../src/common/guards/subscription.guard';
import { REQUIRE_FEATURE_KEY } from '../src/common/decorators/require-feature.decorator';
import { PlanTiersService } from '../src/common/plan-tiers/plan-tiers.service';
import { OrdersController } from '../src/modules/orders/orders.controller';
import {
  DEFAULT_TIERS,
  DEFAULT_TIER_PRICES,
  FEATURE_KEYS,
  OWNER_ONLY,
  PLAN_DURATIONS,
  entitlementsFor,
  minTierFor,
  minTierForLimit,
  normalizeTiers,
  shapeTiers,
  tierViolations,
} from '../src/common/plan-tiers/tiers';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** platform_settings o'rnida xotiradagi ombor */
const memoryRepo = (initial?: unknown) => {
  let row: { key: string; value: unknown } | null = initial === undefined ? null : { key: 'plan_tiers', value: initial };
  return {
    findOne: async () => row,
    upsert: async (value: { key: string; value: unknown }) => {
      row = value;
    },
  } as never;
};

const status = (error: unknown) => (error as HttpException).getStatus();
const body = (error: unknown) => (error as HttpException).getResponse() as Record<string, unknown>;

test('standart sozlama qoidaga mos: VIP ⊇ Pro ⊇ Standart', () => {
  assert.deepEqual(tierViolations(DEFAULT_TIERS), []);
  assert.equal(DEFAULT_TIERS.vip.limits.tables, null);
  for (const key of FEATURE_KEYS) assert.equal(DEFAULT_TIERS.vip.features[key], true);
  // Buyurtmachi bergan Standart narxlari
  assert.deepEqual([...DEFAULT_TIER_PRICES.standard], [179000, 499000, 949000, 1790000]);
  assert.deepEqual(PLAN_DURATIONS.map((d) => d.months), [1, 3, 6, 12]);
});

test("bar va buyurtmalar alohida; xodim qo'shish faqat VIP da", async () => {
  // Standart: bar bor (stolga mahsulot), «Buyurtmalar» bo'limi yo'q
  assert.equal(DEFAULT_TIERS.standard.features.bar, true);
  assert.equal(DEFAULT_TIERS.standard.features.orders, false);
  assert.equal(DEFAULT_TIERS.pro.features.orders, true);
  assert.equal(minTierFor(DEFAULT_TIERS, 'orders'), 'pro');
  assert.equal(minTierFor(DEFAULT_TIERS, 'staff'), 'vip');

  // Xodim qo'shish o'chiq darajada amaldagi chegara — faqat egasi
  assert.equal(entitlementsFor(DEFAULT_TIERS, 'standard').limits.staff, OWNER_ONLY);
  assert.equal(entitlementsFor(DEFAULT_TIERS, 'pro').limits.staff, OWNER_ONLY);
  assert.equal(entitlementsFor(DEFAULT_TIERS, 'vip').limits.staff, null);

  const service = new PlanTiersService(memoryRepo(DEFAULT_TIERS));
  await assert.rejects(service.assertFeature({ tier: 'pro' } as Club, 'staff'), (e) => {
    assert.equal(body(e).code, 'FEATURE_LOCKED');
    assert.deepEqual(body(e).args, { tier: 'VIP', tierRu: 'VIP' });
    return true;
  });

  // «Buyurtmalar» bar'siz bo'lmaydi: panel rad etadi, bazadagisi tuzatiladi
  const orphan = clone(DEFAULT_TIERS) as Record<string, any>;
  orphan.pro.features.bar = false;
  orphan.vip.features.bar = false;
  orphan.standard.features.bar = false;
  assert.ok(tierViolations(shapeTiers(orphan)).includes('pro.features.orders'));
  await assert.rejects(service.update(orphan), (e) => status(e) === 400);
  assert.equal(normalizeTiers(orphan).pro.features.bar, true);

  // Eski (yangi kalitlarsiz) sozlama — standart qiymatlar bilan to'ldiriladi
  const legacy = clone(DEFAULT_TIERS) as Record<string, any>;
  for (const code of ['standard', 'pro', 'vip']) {
    delete legacy[code].features.orders;
    delete legacy[code].features.staff;
  }
  const filled = normalizeTiers(legacy);
  assert.deepEqual(
    [filled.standard, filled.pro, filled.vip].map((tier) => [tier.features.orders, tier.features.staff]),
    [
      [false, false],
      [true, false],
      [true, true],
    ],
  );
});

test("stol oynasi (qo'shish, ko'rish, xatoni bekor qilish) — bar; «Buyurtmalar» ro'yxati — orders", () => {
  const reflector = new Reflector();
  const feature = (method: 'create' | 'cancel' | 'openForSession' | 'findAll' | 'todayStats') =>
    reflector.getAllAndOverride(REQUIRE_FEATURE_KEY, [OrdersController.prototype[method], OrdersController]);
  assert.equal(feature('create'), 'bar');
  assert.equal(feature('openForSession'), 'bar');
  assert.equal(feature('cancel'), 'bar');
  assert.equal(feature('findAll'), 'orders');
  assert.equal(feature('todayStats'), 'orders');
});

test("bazadagi buzilgan sozlama o'qishda qoidaga keltiriladi", () => {
  const broken = clone(DEFAULT_TIERS) as Record<string, any>;
  broken.standard.features.reservations = true; // quyida bor…
  broken.pro.features.reservations = false; // …yuqorida yo'q
  broken.vip.limits.tables = 3; // VIP Standartdan kam
  broken.pro.limits.staff = 'ko‘p'; // yaroqsiz qiymat
  const fixed = normalizeTiers(broken);
  assert.equal(fixed.pro.features.reservations, true);
  assert.equal(fixed.vip.features.reservations, true);
  assert.equal(fixed.vip.limits.tables, fixed.pro.limits.tables);
  assert.equal(fixed.pro.limits.staff, DEFAULT_TIERS.pro.limits.staff);
  assert.deepEqual(tierViolations(fixed), []);
  // Bo'sh yoki eski yozuv — standart
  assert.deepEqual(normalizeTiers(null), normalizeTiers(DEFAULT_TIERS));
});

test('panel kiritmasi qoidaga zid bo‘lsa jimgina tuzatilmaydi — rad etiladi', async () => {
  const service = new PlanTiersService(memoryRepo());
  const bad = clone(DEFAULT_TIERS) as Record<string, any>;
  bad.standard.features.lights = true;
  bad.pro.features.lights = false;
  assert.ok(tierViolations(shapeTiers(bad)).length > 0);
  await assert.rejects(service.update(bad), (e) => status(e) === 400);
  await assert.rejects(service.update({ standard: {} }), (e) => status(e) === 400);

  const good = clone(DEFAULT_TIERS) as Record<string, any>;
  good.standard.limits.tables = 4;
  good.standard.features.bar = false;
  good.pro.nameUz = 'Biznes';
  const saved = await service.update(good);
  assert.equal(saved.standard.limits.tables, 4);
  assert.equal(saved.standard.features.bar, false);
  assert.equal(saved.pro.nameUz, 'Biznes');
  assert.equal((await service.get()).standard.limits.tables, 4);
});

test('imkoniyat va cheklov tekshiruvi: 403 FEATURE_LOCKED / LIMIT_REACHED, null — cheksiz', async () => {
  const service = new PlanTiersService(memoryRepo(DEFAULT_TIERS));
  const standard = { tier: 'standard' } as Club;
  const vip = { tier: 'vip' } as Club;

  await service.assertFeature(standard, 'bar');
  await assert.rejects(service.assertFeature(standard, 'reservations'), (e) => {
    assert.equal(status(e), 403);
    assert.equal(body(e).code, 'FEATURE_LOCKED');
    assert.deepEqual(body(e).args, { tier: 'Pro', tierRu: 'Pro' });
    return true;
  });
  assert.equal(minTierFor(DEFAULT_TIERS, 'lights'), 'vip');

  const max = DEFAULT_TIERS.standard.limits.tables!;
  await service.assertLimit(standard, 'tables', max - 1);
  await assert.rejects(service.assertLimit(standard, 'tables', max), (e) => {
    assert.equal(body(e).code, 'LIMIT_REACHED');
    assert.equal(body(e).key, 'subscription.tableLimit');
    return true;
  });
  await service.assertLimit(vip, 'tables', 10_000);
  assert.equal(minTierForLimit(DEFAULT_TIERS, 'tables', max + 1), 'pro');

  // Eng yuqori darajada ham cheklov bo'lsa — "bog'laning" xabari
  const capped = clone(DEFAULT_TIERS) as Record<string, any>;
  capped.vip.limits.tables = 50;
  const cappedService = new PlanTiersService(memoryRepo(capped));
  await assert.rejects(cappedService.assertLimit(vip, 'tables', 50), (e) => body(e).key === 'subscription.tableLimitTop');

  // Noma'lum daraja (masalan qo'lda buzilgan qator) — VIP, ish to'xtamaydi
  await service.assertFeature({ tier: 'nimadir' } as unknown as Club, 'lights');
});

test('SubscriptionGuard: @RequireFeature tarifda yo‘q bo‘lsa 403, superadmin cheklanmaydi', async () => {
  const club = Object.assign(new Club(), {
    id: 3,
    status: ClubStatus.ACTIVE,
    tier: 'standard',
    subscriptionEndsAt: new Date(Date.now() + 86_400_000),
  });
  const reflector = new Reflector();
  const tiers = new PlanTiersService(memoryRepo(DEFAULT_TIERS));
  const guard = new SubscriptionGuard(
    reflector,
    { log: () => undefined } as never,
    { findOne: async () => club } as never,
    tiers,
  );
  const handler = () => undefined;
  Reflect.defineMetadata(REQUIRE_FEATURE_KEY, 'reservations', handler);
  const context = (user: Record<string, unknown>, headers: Record<string, string> = {}) =>
    ({
      getHandler: () => handler,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => ({ user, headers }) }),
    }) as never;

  await assert.rejects(guard.canActivate(context({ id: 1, clubId: 3, role: UserRole.ADMIN })), (e) => {
    assert.equal(status(e), 403);
    assert.equal(body(e).code, 'FEATURE_LOCKED');
    return true;
  });

  club.tier = 'pro';
  assert.equal(await guard.canActivate(context({ id: 1, clubId: 3, role: UserRole.ADMIN })), true);

  club.tier = 'standard';
  assert.equal(
    await guard.canActivate(context({ id: 2, clubId: null, role: UserRole.SUPERADMIN }, { 'x-club-id': '3' })),
    true,
  );
});
