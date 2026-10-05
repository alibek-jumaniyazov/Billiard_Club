import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { LicenseService } from '../src/common/license/license.service';
import { PlatformConfigService } from '../src/common/platform-config/platform-config.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { PublicController } from '../src/modules/public/public.controller';
import { PublicService } from '../src/modules/public/public.service';
import { TrialVerificationService } from '../src/modules/public/trial-verification.service';

let app: NestExpressApplication;
let origin: string;
let registrations = 0;
let cookieWrites = 0;
const verifier = new TrialVerificationService({} as DataSource, new ConfigService({}));

@Module({
  controllers: [PublicController],
  providers: [
    { provide: PublicService, useValue: { register: async () => {
      registrations += 1;
      return { refreshToken: 'private-refresh-token', marker: 'accepted' };
    } } },
    { provide: TrialVerificationService, useValue: verifier },
    { provide: AuthService, useValue: { setRefreshCookie: () => { cookieWrites += 1; } } },
    { provide: LicenseService, useValue: {} },
    { provide: PlatformConfigService, useValue: { get: async () => ({ trialDays: 3 }) } },
  ],
})
class TestModule {}

before(async () => {
  app = await NestFactory.create<NestExpressApplication>(TestModule, { logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(0, '127.0.0.1');
  origin = await app.getUrl();
});

after(async () => { await app?.close(); });

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${origin}/api/public/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  });

const registration = {
  clubName: 'Test Club', ownerName: 'Test Owner', phone: '+998901234567',
  address: 'Test address', username: 'test_owner', password: 'Test-password-123',
};

test('HTTP registration refuses missing or malformed verification capabilities before creating anything', async () => {
  for (const proof of [
    {},
    { trialVerificationId: 'not-a-uuid', trialVerificationToken: 'fake' },
    { trialVerificationId: '981d0e0f-f2bf-43fa-bd43-e63da375fdcd', trialVerificationToken: null },
  ]) {
    const response = await post('register', { ...registration, ...proof });
    assert.equal(response.status, 400);
  }
  assert.equal(registrations, 0);
  assert.equal(cookieWrites, 0);
});

test('HTTP registration passes a well-formed proof to the service and keeps refresh token out of JSON', async () => {
  const response = await post('register', { ...registration,
    trialVerificationId: '981d0e0f-f2bf-43fa-bd43-e63da375fdcd', trialVerificationToken: 'a'.repeat(43),
  });
  assert.equal(response.status, 201);
  const body = await response.json() as { data: Record<string, unknown> };
  assert.equal(body.data.marker, 'accepted');
  assert.equal('refreshToken' in body.data, false);
  assert.equal(cookieWrites, 1);
});

test('HTTP status proof cannot be queried without its browser token', async () => {
  const response = await post('trial-verification/status', { id: '981d0e0f-f2bf-43fa-bd43-e63da375fdcd' });
  assert.equal(response.status, 400);
});

test('HTTP unconfigured Telegram setup never opens public verification', async () => {
  const response = await fetch(`${origin}/api/public/config`);
  const body = await response.json() as { data: { trialVerification: { available: boolean } } };
  assert.equal(body.data.trialVerification.available, false);
  assert.equal((await post('trial-verification/start', {})).status, 503);
  assert.equal((await post('trial-verification/telegram/webhook', { message: {} })).status, 401);
  assert.equal((await post('trial-verification/telegram/webhook', { message: {} }, {
    'X-Telegram-Bot-Api-Secret-Token': 'forged',
  })).status, 401);
});
