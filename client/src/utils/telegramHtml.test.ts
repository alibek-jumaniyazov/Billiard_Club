import { describe, expect, it } from 'vitest';
import { parseTelegramHtml, type TelegramHtmlNode as Node } from './telegramHtml';

/**
 * Hisobot namunasi serverdan Telegram HTML bo'lib keladi. U sahifada XAVFSIZ
 * ko'rsatilishi shart: faqat b/i/code/a teglari, qolgani oddiy matn bo'lib qoladi.
 */
const textOf = (node: Node | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('');

describe('parseTelegramHtml', () => {
  it('ruxsat etilgan teglar daraxtga aylanadi, entity lar ochiladi', () => {
    const tree = parseTelegramHtml('💰 <b>Tushum: 1 000</b> · Klub &lt;A&gt; &amp; B\n<a href="https://x.uz/reports">Batafsil</a>');
    expect(textOf(tree)).toBe('💰 Tushum: 1 000 · Klub <A> & B\nBatafsil');
    const bold = tree.children.find((c) => typeof c !== 'string' && c.tag === 'b') as Node;
    expect(textOf(bold)).toBe('Tushum: 1 000');
    const link = tree.children.find((c) => typeof c !== 'string' && c.tag === 'a') as Node;
    expect(link.href).toBe('https://x.uz/reports');
  });

  it('boshqa teglar HTML sifatida o‘qilmaydi', () => {
    const tree = parseTelegramHtml('<img src=x onerror=alert(1)><script>alert(1)</script>');
    expect(tree.children).toHaveLength(1);
    expect(typeof tree.children[0]).toBe('string');
    expect(textOf(tree)).toBe('<img src=x onerror=alert(1)><script>alert(1)</script>');
  });
});
