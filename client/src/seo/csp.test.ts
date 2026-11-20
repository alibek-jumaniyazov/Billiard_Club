import { describe, expect, it } from 'vitest';
import { cspViolations } from './csp';

describe("CSP qo'riqchisi", () => {
  it('tashqi skriptlar va JSON-LD ruxsat etiladi', () => {
    const html = `<head>
  <script src="/theme-init.js"></script>
  <script type="module" crossorigin src="/assets/index-a1b2.js"></script>
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization"}</script>
  <script></script>
</head>`;
    expect(cspViolations(html)).toEqual([]);
  });

  it('ichki skript topiladi', () => {
    expect(cspViolations('<script>document.documentElement.classList.add("js")</script>')).toHaveLength(1);
    expect(cspViolations('<script type="module">import "/assets/x.js";</script>')).toHaveLength(1);
    expect(cspViolations('<SCRIPT>\n  window.x = 1;\n</SCRIPT >')).toHaveLength(1);
  });

  it("hodisa atributlari va javascript: havolalar topiladi", () => {
    expect(cspViolations('<img src="/a.png" onerror="this.remove()">')).toHaveLength(1);
    expect(cspViolations("<button type=\"button\" onclick='go()'>Ok</button>")).toHaveLength(1);
    expect(cspViolations('<body onload=init()>')).toHaveLength(1);
    expect(cspViolations('<a href="javascript:void(0)">x</a>')).toHaveLength(1);
  });

  it("matndagi 'on' so'zlari va oddiy atributlar xato emas", () => {
    const html = `<p class="lead" data-section="one">Turn on the lights, onboarding=fast</p>
<a href="/download" hreflang="ru">Yuklab olish</a>
<meta name="description" content="Stollar onlayn boshqaruvi">`;
    expect(cspViolations(html)).toEqual([]);
  });
});
