import { describe, expect, it } from 'vitest';
import { androidShellVersion, isNewerVersion } from './version';

describe('isNewerVersion', () => {
  it('compares major, minor and patch numerically', () => {
    expect(isNewerVersion('1.1.0', '1.0.0')).toBe(true);
    expect(isNewerVersion('1.10.0', '1.9.9')).toBe(true);
    expect(isNewerVersion('2.0.0', '1.99.99')).toBe(true);
    expect(isNewerVersion('1.0.1', '1.0.0')).toBe(true);
  });

  it('never reports the same or an older version as an update', () => {
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false);
    expect(isNewerVersion('1.0.0', '1.1.0')).toBe(false);
    expect(isNewerVersion('0.9.9', '1.0.0')).toBe(false);
  });

  it('treats malformed versions as "no update"', () => {
    expect(isNewerVersion('beta', '1.0.0')).toBe(false);
    expect(isNewerVersion('1.2.0', '')).toBe(false);
  });
});

describe('androidShellVersion', () => {
  it('reads the APK version from the user agent', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36 BilliardClubAndroid/1.1.0';
    expect(androidShellVersion(ua)).toBe('1.1.0');
  });

  it('is null in a regular browser', () => {
    expect(androidShellVersion('Mozilla/5.0 (Windows NT 10.0) Chrome/130')).toBeNull();
  });
});
