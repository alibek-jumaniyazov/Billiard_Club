import { describe, expect, it } from 'vitest';
import { isGatewayFailure } from './client';

/**
 * "Server bilan aloqa yo'q" ni aniqlash: so'rov ilovaga yetmagan bo'lsa
 * kassa amali xato emas, oflayn navbatga tushadi. Ilovaning o'z xatolari
 * (JSON qobig'ida) esa hech qachon bunday deb hisoblanmaydi.
 */
describe('isGatewayFailure', () => {
  it('proksi javoblari (nginx 502/504 HTML, Vite 500 bo‘sh tana) — aloqa yo‘q', () => {
    expect(isGatewayFailure({ response: { status: 502, data: '<html>Bad Gateway</html>' } })).toBe(true);
    expect(isGatewayFailure({ response: { status: 504, data: '' } })).toBe(true);
    expect(isGatewayFailure({ response: { status: 500, data: '' } })).toBe(true);
  });

  it('ilovaning o‘z xatolari — aloqa BOR (navbatga tushmaydi)', () => {
    expect(isGatewayFailure({ response: { status: 500, data: { success: false, message: 'x' } } })).toBe(false);
    expect(isGatewayFailure({ response: { status: 503, data: { success: false, message: 'bot' } } })).toBe(false);
    expect(isGatewayFailure({ response: { status: 409, data: '' } })).toBe(false);
    expect(isGatewayFailure({ response: { status: 400, data: { success: false } } })).toBe(false);
  });

  it('javob umuman yo‘q bo‘lsa bu funksiya emas, isNetworkError hal qiladi', () => {
    expect(isGatewayFailure({})).toBe(false);
  });

  it('blob so‘rovida JSON turi — ilova xatosi, boshqasi — proksi', () => {
    expect(isGatewayFailure({ response: { status: 500, data: new Blob(['{}'], { type: 'application/json' }) } })).toBe(false);
    expect(isGatewayFailure({ response: { status: 502, data: new Blob(['<html>'], { type: 'text/html' }) } })).toBe(true);
  });
});
