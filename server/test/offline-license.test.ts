import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as crypto from 'node:crypto';
import { Club } from '../src/entities/club.entity';
import { ClubStatus, UserRole } from '../src/entities/enums';
import { LicenseService, LICENSE_TTL_MS } from '../src/common/license/license.service';
import { SubscriptionGuard } from '../src/common/guards/subscription.guard';

test('signed offline leases bind the user and stop at the earlier of subscription and 24 hours', () => {
  const key = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey;
  const previous = process.env.LICENSE_PRIVATE_KEY;
  process.env.LICENSE_PRIVATE_KEY = key.export({ type: 'pkcs8', format: 'pem' }).toString();
  try {
    const service = new LicenseService();
    service.onModuleInit();
    const club: Club = Object.assign(new Club(), { id: 1, status: ClubStatus.ACTIVE, subscriptionEndsAt: new Date(Date.now() + 60_000) });
    const user = { id: 9, clubId: 1, role: UserRole.ADMIN };
    const lease = service.issue(club, user)!;
    const payload = JSON.parse(Buffer.from(lease.payload, 'base64url').toString());
    assert.equal(payload.userId, user.id);
    assert.equal(payload.role, user.role);
    assert.equal(payload.version, 2);
    assert.equal(payload.expiresAt, club.subscriptionEndsAt!.toISOString());
    assert.equal(crypto.verify('sha256', Buffer.from(lease.payload), { key: crypto.createPublicKey(key), dsaEncoding: 'ieee-p1363' }, Buffer.from(lease.signature, 'base64url')), true);
    club.subscriptionEndsAt = null;
    const unlimited = JSON.parse(Buffer.from(service.issue(club, user)!.payload, 'base64url').toString());
    assert.equal(Date.parse(unlimited.expiresAt) - Date.parse(unlimited.issuedAt), LICENSE_TTL_MS);
    assert.equal(service.issue(club, { ...user, clubId: 2 }), null);
    assert.equal(service.issue(club, { ...user, role: UserRole.SUPERADMIN }), null);
    club.status = ClubStatus.EXPIRED;
    assert.equal(club.isExpired, true);
    assert.equal(JSON.parse(Buffer.from(service.issue(club, user)!.payload, 'base64url').toString()).status, 'expired');
  } finally {
    if (previous === undefined) delete process.env.LICENSE_PRIVATE_KEY;
    else process.env.LICENSE_PRIVATE_KEY = previous;
  }
});

test('online guard blocks expired and blocked clubs without overwriting a concurrent renewal', async () => {
  const club = Object.assign(new Club(), { id: 3, status: ClubStatus.ACTIVE, subscriptionEndsAt: new Date(Date.now() - 1000) });
  let writes = 0;
  const guard = new SubscriptionGuard(
    { getAllAndOverride: () => false } as never,
    { log: () => undefined } as never,
    { findOne: async () => club, update: async () => { writes++; } } as never,
  );
  const request = { user: { id: 4, clubId: 3, role: UserRole.ADMIN }, headers: {} };
  const context = { getHandler: () => null, getClass: () => null, switchToHttp: () => ({ getRequest: () => request }) } as never;
  await assert.rejects(guard.canActivate(context), (error: { getStatus(): number }) => error.getStatus() === 403);
  assert.equal(writes, 0);
  club.status = ClubStatus.BLOCKED;
  club.subscriptionEndsAt = new Date(Date.now() + 3600000);
  await assert.rejects(guard.canActivate(context), (error: { getStatus(): number }) => error.getStatus() === 403);
  club.status = ClubStatus.ACTIVE;
  assert.equal(await guard.canActivate(context), true);
});
