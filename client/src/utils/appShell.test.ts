import { describe, expect, it } from 'vitest';
import { isAndroidShell } from './appShell';

describe('isAndroidShell', () => {
  it('recognises the installed Android app by its user-agent tag', () => {
    expect(
      isAndroidShell(
        'Mozilla/5.0 (Linux; Android 14; SM-A146P; wv) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36 BilliardClubAndroid/1.2.0',
      ),
    ).toBe(true);
  });

  it('treats an ordinary phone browser as the website', () => {
    expect(isAndroidShell('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36')).toBe(false);
    expect(isAndroidShell('Mozilla/5.0 (Linux; Android 14; wv) Chrome/140.0 BilliardClubAndroid/beta')).toBe(false);
  });
});
