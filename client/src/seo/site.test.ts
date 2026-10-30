import { describe, expect, it } from 'vitest';
import { absoluteUrl, canonicalPath, isLandingPath, isPublicPath, langFromPath } from './site';

describe('SEO manzillari', () => {
  it('landing ikki tilda alohida manzilda', () => {
    expect(isLandingPath('/')).toBe(true);
    expect(isLandingPath('/ru')).toBe(true);
    expect(isLandingPath('/ru/')).toBe(true);
    expect(isLandingPath('/login')).toBe(false);
    expect(canonicalPath('/', 'uz')).toBe('/');
    expect(canonicalPath('/ru', 'ru')).toBe('/ru/');
    expect(canonicalPath('/download/', 'ru')).toBe('/download');
  });

  it('til manzildan aniqlanadi', () => {
    expect(langFromPath('/ru/')).toBe('ru');
    expect(langFromPath('/ru')).toBe('ru');
    expect(langFromPath('/russia')).toBeNull();
    expect(langFromPath('/')).toBeNull();
  });

  it('ish joyi va admin sahifalari indekslanmaydi', () => {
    for (const path of ['/', '/ru/', '/download', '/register', '/login']) expect(isPublicPath(path)).toBe(true);
    for (const path of ['/tables', '/dashboard', '/admin', '/admin/clubs', '/profile', '/nimadir']) {
      expect(isPublicPath(path)).toBe(false);
    }
  });

  it("to'liq manzil", () => {
    expect(absoluteUrl('/ru/')).toBe('https://billiardclub.uz/ru/');
    expect(absoluteUrl('og-cover.png')).toBe('https://billiardclub.uz/og-cover.png');
  });
});
