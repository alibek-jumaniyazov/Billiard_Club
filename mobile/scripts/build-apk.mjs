/**
 * Android APK yig'ish — bitta buyruq:
 *   npm run build:apk          # imzolangan release APK (tarqatish uchun)
 *   npm run build:apk:debug    # debug APK (sinov uchun)
 *
 * Nima qiladi:
 *  1. JDK 21 va Android SDK ni topadi: muhit o'zgaruvchilari (JAVA_HOME,
 *     ANDROID_HOME) yoki loyiha ichidagi runtime.local/android-toolchain/.
 *  2. Release uchun imzo kaliti bo'lmasa — bir marta yaratadi
 *     (android/keystore/*.jks + android/keystore.properties, git'ga kirmaydi).
 *  3. `cap sync android` — www va capacitor.config.ts ni nativ loyihaga ko'chiradi.
 *  4. Gradle bilan yig'adi va APK ni mobile/dist/ ga nom+versiya bilan qo'yadi.
 *
 * Boshqa server uchun: BILLIARDCLUB_URL=https://mening-serverim.uz npm run build:apk
 */
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MOBILE = resolve(HERE, '..');
const ANDROID = join(MOBILE, 'android');
const TOOLCHAIN = resolve(MOBILE, '..', 'runtime.local', 'android-toolchain');
const isWin = process.platform === 'win32';
const mode = process.argv[2] === 'debug' ? 'debug' : 'release';

const log = (msg) => console.log(`› ${msg}`);

/* ---------------------------------------------------------------- Muhit */

const javaHome = process.env.JAVA_HOME && existsSync(join(process.env.JAVA_HOME, 'bin'))
  ? process.env.JAVA_HOME
  : join(TOOLCHAIN, 'jdk');
const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(TOOLCHAIN, 'sdk');
if (!existsSync(join(javaHome, 'bin'))) {
  throw new Error(`JDK 21 topilmadi: ${javaHome}. JAVA_HOME ni o'rnating (mobile/README.md).`);
}
if (!existsSync(androidHome)) {
  throw new Error(`Android SDK topilmadi: ${androidHome}. ANDROID_HOME ni o'rnating (mobile/README.md).`);
}
const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  ANDROID_HOME: androidHome,
  ANDROID_SDK_ROOT: androidHome,
  PATH: `${join(javaHome, 'bin')}${isWin ? ';' : ':'}${process.env.PATH}`,
};
// Gradle SDK yo'lini local.properties dan o'qiydi (fayl git'ga kirmaydi)
writeFileSync(join(ANDROID, 'local.properties'), `sdk.dir=${androidHome.replace(/\\/g, '/')}\n`);

/* --------------------------------------------------------------- Versiya */

const pkg = JSON.parse(readFileSync(join(MOBILE, 'package.json'), 'utf8'));
const version = pkg.version;
const [major, minor, patch] = version.split('.').map((n) => parseInt(n, 10) || 0);
const versionCode = major * 10000 + minor * 100 + patch;

/* ------------------------------------------------------ Release imzo kaliti */

const keystoreProps = join(ANDROID, 'keystore.properties');
if (mode === 'release' && !existsSync(keystoreProps)) {
  log("Imzo kaliti yo'q — yangisi yaratilmoqda (bir marta)...");
  mkdirSync(join(ANDROID, 'keystore'), { recursive: true });
  const password = randomBytes(24).toString('base64url');
  execFileSync(join(javaHome, 'bin', isWin ? 'keytool.exe' : 'keytool'), [
    '-genkeypair', '-v',
    '-keystore', join(ANDROID, 'keystore', 'billiard-release.jks'),
    '-storetype', 'PKCS12',
    '-alias', 'billiardclub',
    '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000',
    '-dname', 'CN=Billiard Club, O=avilab.uz, C=UZ',
    '-storepass', password, '-keypass', password,
  ], { stdio: 'ignore', env });
  writeFileSync(keystoreProps, [
    '# Billiard Club release imzosi — GIT\'GA QO\'SHMANG, zaxira nusxasini saqlang.',
    '# Kalit yo\'qolsa, o\'rnatilgan ilovalarni yangilab bo\'lmaydi.',
    'storeFile=keystore/billiard-release.jks',
    `storePassword=${password}`,
    'keyAlias=billiardclub',
    `keyPassword=${password}`,
    '',
  ].join('\n'));
  log('Kalit yaratildi: android/keystore/billiard-release.jks (parol: android/keystore.properties)');
}

/* ------------------------------------------------------------- Yig'ish */

const npx = isWin ? 'npx.cmd' : 'npx';
log('cap sync android...');
execFileSync(npx, ['cap', 'sync', 'android'], { cwd: MOBILE, stdio: 'inherit', env, shell: isWin });

const task = mode === 'release' ? 'assembleRelease' : 'assembleDebug';
log(`gradle ${task} (versiya ${version}, kod ${versionCode})...`);
// To'liq yo'l: Windows cmd joriy papkadagi .bat ni nomi bilan topmaydi
execFileSync(isWin ? `"${join(ANDROID, 'gradlew.bat')}"` : './gradlew', [
  task,
  `-PappVersionName=${version}`,
  `-PappVersionCode=${versionCode}`,
  '--no-daemon',
], { cwd: ANDROID, stdio: 'inherit', env, shell: isWin });

const built = join(ANDROID, 'app', 'build', 'outputs', 'apk', mode, `app-${mode}.apk`);
if (!existsSync(built)) throw new Error(`APK topilmadi: ${built}`);

mkdirSync(join(MOBILE, 'dist'), { recursive: true });
const target = join(MOBILE, 'dist', `BilliardClub-${version}${mode === 'debug' ? '-debug' : ''}.apk`);
copyFileSync(built, target);
const sha256 = createHash('sha256').update(readFileSync(target)).digest('hex');
log(`Tayyor: ${target}`);
log(`Hajmi: ${(statSync(target).size / 1024 / 1024).toFixed(1)} MB · SHA-256: ${sha256}`);
