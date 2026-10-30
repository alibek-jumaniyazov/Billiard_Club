import { describe, expect, it } from 'vitest';
import { introVariant, type IntroContext } from './introGate';

const visitor: IntroContext = {
  pathname: '/',
  hash: '',
  appShell: false,
  androidShell: false,
  signedIn: false,
  reducedMotion: false,
  automated: false,
  alreadyPlayed: false,
  bot: false,
  fromSearch: false,
};

describe('brend intro qachon ko\'rsatiladi', () => {
  it('saytda faqat bosh sahifaga birinchi kirgan mehmonga', () => {
    expect(introVariant(visitor)).toBe('full');
    expect(introVariant({ ...visitor, pathname: '/ru/' })).toBe('full');
    expect(introVariant({ ...visitor, pathname: '/login' })).toBeNull();
    expect(introVariant({ ...visitor, hash: '#pricing' })).toBeNull();
    expect(introVariant({ ...visitor, signedIn: true })).toBeNull();
  });

  it('dasturda har ishga tushganda: Windows — to\'liq, Android — tayyor belgidan', () => {
    expect(introVariant({ ...visitor, appShell: true, pathname: '/login' })).toBe('full');
    expect(introVariant({ ...visitor, appShell: true, signedIn: true, pathname: '/tables' })).toBe('full');
    expect(introVariant({ ...visitor, appShell: true, androidShell: true, pathname: '/login' })).toBe('assembled');
  });

  it('qidiruvdan kelgan mehmon va botlar intro ko\'rmaydi (Google interstitial siyosati)', () => {
    expect(introVariant({ ...visitor, fromSearch: true })).toBeNull();
    expect(introVariant({ ...visitor, bot: true })).toBeNull();
    // Dasturda bu signallar ahamiyatsiz — u qidiruvdan ochilmaydi
    expect(introVariant({ ...visitor, appShell: true, pathname: '/login', bot: true })).toBe('full');
  });

  it('harakat kamaytirilganda, testlarda va sessiyada ikkinchi marta — yo\'q', () => {
    expect(introVariant({ ...visitor, reducedMotion: true })).toBeNull();
    expect(introVariant({ ...visitor, automated: true })).toBeNull();
    expect(introVariant({ ...visitor, alreadyPlayed: true })).toBeNull();
    expect(introVariant({ ...visitor, appShell: true, alreadyPlayed: true })).toBeNull();
  });
});
