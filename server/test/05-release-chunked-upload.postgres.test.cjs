const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { before, after, test } = require('node:test');
const { createDataSource } = require('./postgres-helper.cjs');

// Relizlar vaqtinchalik papkaga yoziladi — haqiqiy uploads/ ga tegilmaydi
const releasesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'releases-test-'));
process.env.RELEASES_DIR = releasesDir;

const { ReleasesService, CHUNK_MAX_BYTES } = require('../src/modules/releases/releases.service');
const { AppRelease } = require('../src/entities/app-release.entity');
const { User } = require('../src/entities/user.entity');
const { UserRole } = require('../src/entities/enums');

let database;
let service;
let admin;
let otherAdmin;

before(async () => {
  database = await createDataSource().initialize();
  await database.runMigrations();
  service = new ReleasesService(database.getRepository(AppRelease));
  const users = database.getRepository(User);
  const make = (name) => users.save({
    clubId: null, name, username: `${name}_${Date.now()}`, password: 'x', role: UserRole.SUPERADMIN,
  });
  admin = await make('release_admin');
  otherAdmin = await make('release_other');
});
after(async () => {
  if (database?.isInitialized) await database.destroy();
  fs.rmSync(releasesDir, { recursive: true, force: true });
});

const sha512 = (buf) => crypto.createHash('sha512').update(buf).digest('base64');
const tmpFiles = () => fs.readdirSync(path.join(releasesDir, 'tmp'));

test('a large installer arrives in small chunks, survives retries and is stored byte-exact', { timeout: 30000 }, async () => {
  // 3 ta to'liq bo'lak + dum — proksi chegarasidan katta fayl
  const content = crypto.randomBytes(CHUNK_MAX_BYTES * 3 + 12345);
  const { uploadId, chunkSize } = await service.startUpload(
    { version: '9.9.1', platform: 'win', fileName: 'Billiard Club Setup 9.9.1.exe', size: content.length },
    admin.id,
  );
  assert.equal(chunkSize, CHUNK_MAX_BYTES);
  const piece = (offset) => content.subarray(offset, offset + chunkSize);

  assert.equal(service.appendUploadChunk(uploadId, admin.id, 0, piece(0)).received, chunkSize);
  // Javob yo'qolib, klient shu bo'lakni qayta yubordi — ikki marta yozilmaydi
  assert.equal(service.appendUploadChunk(uploadId, admin.id, 0, piece(0)).received, chunkSize);
  // Oldinga sakragan bo'lak yozilmaydi: klient javobdagi `received` dan davom etadi
  assert.equal(service.appendUploadChunk(uploadId, admin.id, chunkSize * 2, piece(chunkSize * 2)).received, chunkSize);
  // Boshqa superadmin bu yuklashga aralasha olmaydi
  assert.throws(() => service.appendUploadChunk(uploadId, otherAdmin.id, chunkSize, piece(chunkSize)), (err) => err.getStatus?.() === 404);
  // To'liq bo'lmagan fayl yakunlanmaydi
  await assert.rejects(() => service.completeUpload(uploadId, admin.id), (err) => err.getStatus?.() === 400);

  for (let offset = chunkSize; offset < content.length; offset += chunkSize) {
    service.appendUploadChunk(uploadId, admin.id, offset, piece(offset));
  }
  const release = await service.completeUpload(uploadId, admin.id);

  assert.equal(Number(release.size), content.length);
  assert.equal(release.sha512, sha512(content));
  assert.equal(release.fileName, 'Billiard Club Setup 9.9.1.exe');
  assert.equal(release.storedName, 'billiard-club-9.9.1-win.exe');
  assert.equal(release.isPublished, false);
  assert.ok(fs.readFileSync(path.join(releasesDir, release.storedName)).equals(content), 'diskdagi fayl aynan o\'sha baytlar');
  assert.deepEqual(tmpFiles(), [], 'vaqtinchalik fayllar qolmadi');
});

test('bad uploads are refused before any byte is sent, and an aborted upload leaves nothing behind', { timeout: 30000 }, async () => {
  const start = (patch) => service.startUpload(
    { version: '9.9.2', platform: 'android', fileName: 'BilliardClub-9.9.2.apk', size: 1024, ...patch },
    admin.id,
  );
  await assert.rejects(() => start({ fileName: 'virus.sh' }), (err) => err.getStatus?.() === 400);
  await assert.rejects(() => start({ version: '9.9' }), (err) => err.getStatus?.() === 400);
  await assert.rejects(() => start({ size: 600 * 1024 * 1024 }), (err) => err.getStatus?.() === 400);
  // Bunday versiya allaqachon bor (birinchi testdagi win 9.9.1)
  await assert.rejects(() => start({ version: '9.9.1', platform: 'win', fileName: 'x.exe' }), (err) => err.getStatus?.() === 400);
  // Identifikator fayl nomiga tushadi — UUID bo'lmasa 404 (yo'l aylanib o'tishi yo'q)
  assert.throws(() => service.appendUploadChunk('../../etc/passwd', admin.id, 0, Buffer.from('x')), (err) => err.getStatus?.() === 404);

  const { uploadId } = await start({});
  service.appendUploadChunk(uploadId, admin.id, 0, crypto.randomBytes(512));
  assert.equal(tmpFiles().length, 2);
  service.abortUpload(uploadId, admin.id);
  assert.deepEqual(tmpFiles(), []);
  await assert.rejects(() => service.completeUpload(uploadId, admin.id), (err) => err.getStatus?.() === 404);
});
