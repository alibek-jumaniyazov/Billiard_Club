import { theme as antTheme, type ThemeConfig } from 'antd';

/**
 * BILLIARD CLUB — dizayn tokenlarining YAGONA manbasi.
 *
 * Ikki rejim:
 *  - OCH ("fil suyagi") — iliq qog'oz fon, siyoh matn, xira jez urg'u, mato
 *    yashili asosiy tugma. Landing bilan bir xil.
 *  - QORONG'I ("tungi zal") — neytral ko'mir qatlamlar (yashil tus yo'q —
 *    yashil mato kartalar fonga qorishib ketmasin), aniq chegaralar, jez urg'u.
 *
 * QANDAY ISHLAYDI: `TOKENS.color.*` qiymatlari — CSS o'zgaruvchilari
 * (`var(--bg1)` …). Rejim almashganda applyTheme() o'zgaruvchilarni yangilaydi
 * va butun interfeys (inline uslublar, CSS, SVG/grafiklar) o'zi moslashadi.
 * antd esa haqiqiy rang talab qiladi — buildAntdTheme(mode) PALETTES dan quradi.
 * Canvas (billiard stoli, o'yin, logo videosi) — har doim BRAND ranglarida.
 */

export type ThemeMode = 'light' | 'dark';

interface Palette {
  bg: { bg0: string; bg1: string; bg2: string; bg3: string };
  /** Modal, dropdown — ko'tarilgan qatlam */
  elevated: string;
  /** Shaffof "suzuvchi" yuza (GlassCard) — orqasi blur bilan ko'rinadi */
  glass: string;
  border: { subtle: string; base: string; strong: string };
  emerald: { deepest: string; deep: string; felt: string; base: string; bright: string; glow: string };
  wood: { light: string; base: string; dark: string };
  gold: {
    base: string;
    hover: string;
    active: string;
    dim: string;
    subtle: string;
    line: string;
    glow: string;
    contrast: string;
    gradient: string;
  };
  /** Asosiy tugma: och rejimda mato yashili, qorong'ida jez */
  primary: { base: string; hover: string; active: string; on: string };
  text: { primary: string; secondary: string; tertiary: string; disabled: string };
  semantic: { success: string; warning: string; error: string; info: string };
  neonGreen: string;
  ivory: string;
  aurora: { emerald: string; gold: string; teal: string };
  chart: readonly string[];
  shadow: { level1: string; level2: string; level3: string; glowActive: string; cardHighlight: string };
  /** Brauzer paneli rangi (meta theme-color) */
  themeColor: string;
}

/* ------------------------------------------------------- O'zgarmas brend */

/**
 * BREND — jismoniy narsalar ranglari (mato, yog'och, oltin, fil suyagi shar).
 * Rejimga bog'liq EMAS: billiard stoli och rejimda ham stol bo'lib qoladi.
 * Canvas (render.ts, o'yin, logoMotion) va logotip SVG shu yerdan oladi.
 */
export const BRAND = {
  emerald: {
    deepest: '#08261a',
    deep: '#0f3a27',
    felt: '#135c3c',
    base: '#18774c',
    bright: '#23a066',
    glow: '#3fd68e',
  },
  wood: { light: '#7a5030', base: '#55351f', dark: '#2f1d11' },
  gold: {
    base: '#dbb35c',
    hover: '#e8c677',
    active: '#bd954a',
    dim: '#8d7745',
    subtle: 'rgba(219, 179, 92, 0.12)',
    line: 'rgba(219, 179, 92, 0.24)',
    glow: 'rgba(219, 179, 92, 0.32)',
    contrast: '#17130a',
    gradient: 'linear-gradient(135deg, #e8c677 0%, #dbb35c 50%, #bd954a 100%)',
  },
  text: { primary: '#f1ece1', secondary: '#b5ae9f', tertiary: '#8b8579', disabled: '#55524b' },
  semantic: { success: '#43b77b', warning: '#f0a53a', error: '#ec5a4f', info: '#5b9bea' },
  ivory: '#f3eee2',
} as const;

/* ------------------------------------------------------------- Palitralar */

export const PALETTES: Record<ThemeMode, Palette> = {
  /** Och — landing bilan bir xil (fil suyagi va mato) */
  light: {
    bg: { bg0: '#f3efe6', bg1: '#fbf8f2', bg2: '#efe9de', bg3: '#e7e0d2' },
    elevated: '#fffdf9',
    glass: 'rgba(255, 253, 249, 0.8)',
    border: { subtle: '#e8e1d4', base: '#ddd4c3', strong: '#c8bba3' },
    emerald: {
      deepest: '#e8f1eb',
      deep: '#d7e9de',
      felt: '#145c3e',
      base: '#1a6b48',
      bright: '#1f7a52',
      glow: '#1d7a50',
    },
    wood: BRAND.wood,
    gold: {
      base: '#8c6a33',
      hover: '#765828',
      active: '#5f461f',
      dim: '#a08a5f',
      subtle: 'rgba(140, 106, 51, 0.10)',
      line: 'rgba(140, 106, 51, 0.26)',
      glow: 'rgba(140, 106, 51, 0.18)',
      contrast: '#fbf8f2',
      gradient: 'linear-gradient(135deg, #a8834a 0%, #8c6a33 50%, #765828 100%)',
    },
    primary: { base: '#0f4d3a', hover: '#0b3d2e', active: '#082e23', on: '#f7f3ea' },
    text: { primary: '#17140f', secondary: '#4d473d', tertiary: '#7c7466', disabled: '#b3aa99' },
    semantic: { success: '#2e8a5e', warning: '#a86a12', error: '#b9443a', info: '#2f6fb0' },
    neonGreen: '#1f8a5b',
    ivory: BRAND.ivory,
    aurora: {
      emerald: 'rgba(20, 92, 62, 0.07)',
      gold: 'rgba(140, 106, 51, 0.05)',
      teal: 'rgba(40, 110, 100, 0.05)',
    },
    chart: ['#8c6a33', '#1f7a52', '#7d9488', '#2f6fb0', '#a86a12', '#2e8a5e', '#b9443a', '#a08a5f'],
    shadow: {
      level1: '0 1px 2px rgba(23, 20, 15, 0.06)',
      level2: '0 10px 28px rgba(23, 20, 15, 0.12)',
      level3: '0 20px 56px rgba(23, 20, 15, 0.18)',
      glowActive: '0 0 0 1px rgba(140, 106, 51, 0.4)',
      cardHighlight: 'inset 0 1px 0 rgba(255, 255, 255, 0.6)',
    },
    themeColor: '#f3efe6',
  },
  /**
   * Qorong'i — neytral ko'mir. Qatlamlar orasidagi farq aniq (sahifa → karta →
   * ko'tarilgan → hover), chegaralar ko'rinadi, matn yetarli kontrastda.
   */
  dark: {
    bg: { bg0: '#0b0d0c', bg1: '#161a18', bg2: '#1f2421', bg3: '#2a302d' },
    elevated: '#1f2421',
    glass: 'rgba(31, 36, 33, 0.64)',
    border: { subtle: '#242a27', base: '#323a36', strong: '#45504a' },
    emerald: {
      deepest: '#0a2419',
      deep: '#11392a',
      felt: '#145c3e',
      base: '#1b7a50',
      bright: '#2fa36c',
      glow: '#4fd394',
    },
    wood: BRAND.wood,
    gold: {
      base: '#d4af62',
      hover: '#e2c27f',
      active: '#ba964c',
      dim: '#8d7745',
      subtle: 'rgba(212, 175, 98, 0.12)',
      line: 'rgba(212, 175, 98, 0.26)',
      glow: 'rgba(212, 175, 98, 0.30)',
      contrast: '#16120a',
      gradient: 'linear-gradient(135deg, #e2c27f 0%, #d4af62 50%, #ba964c 100%)',
    },
    primary: { base: '#d4af62', hover: '#e2c27f', active: '#ba964c', on: '#16120a' },
    text: { primary: '#f2eee6', secondary: '#bdb8ad', tertiary: '#8f8a80', disabled: '#57534c' },
    semantic: { success: '#46bd80', warning: '#eba640', error: '#ea5f53', info: '#62a2ec' },
    neonGreen: '#4fd394',
    ivory: BRAND.ivory,
    aurora: {
      emerald: 'rgba(24, 119, 76, 0.14)',
      gold: 'rgba(212, 175, 98, 0.05)',
      teal: 'rgba(40, 110, 100, 0.07)',
    },
    chart: ['#d4af62', '#2fa36c', '#8fa89b', '#62a2ec', '#eba640', '#4fd394', '#ea5f53', '#8d7745'],
    shadow: {
      level1: '0 1px 2px rgba(0, 0, 0, 0.45)',
      level2: '0 8px 24px rgba(0, 0, 0, 0.5)',
      level3: '0 16px 48px rgba(0, 0, 0, 0.6)',
      glowActive: '0 0 0 1px rgba(212, 175, 98, 0.45)',
      cardHighlight: 'inset 0 1px 0 rgba(255, 255, 255, 0.035)',
    },
    themeColor: '#0b0d0c',
  },
};

/* ------------------------------------------- CSS o'zgaruvchilari (rejimlar) */

/** Palitra → CSS o'zgaruvchilari (index.css va barcha .css fayllar shularni ishlatadi) */
export const cssVariables = (mode: ThemeMode): Record<string, string> => {
  const p = PALETTES[mode];
  return {
    '--bg0': p.bg.bg0,
    '--bg1': p.bg.bg1,
    '--bg2': p.bg.bg2,
    '--bg3': p.bg.bg3,
    '--bg-elevated': p.elevated,
    '--glass-bg': p.glass,
    '--border-subtle': p.border.subtle,
    '--border-base': p.border.base,
    '--border-strong': p.border.strong,
    '--emerald-deepest': p.emerald.deepest,
    '--emerald-deep': p.emerald.deep,
    '--emerald-felt': p.emerald.felt,
    '--emerald-base': p.emerald.base,
    '--emerald-bright': p.emerald.bright,
    '--emerald-glow': p.emerald.glow,
    '--wood-light': p.wood.light,
    '--wood': p.wood.base,
    '--wood-dark': p.wood.dark,
    '--gold': p.gold.base,
    '--gold-hover': p.gold.hover,
    '--gold-active': p.gold.active,
    '--gold-dim': p.gold.dim,
    '--gold-subtle': p.gold.subtle,
    '--gold-line': p.gold.line,
    '--gold-glow': p.gold.glow,
    '--gold-contrast': p.gold.contrast,
    '--gold-gradient': p.gold.gradient,
    '--primary': p.primary.base,
    '--primary-hover': p.primary.hover,
    '--primary-active': p.primary.active,
    '--on-primary': p.primary.on,
    '--aurora-emerald': p.aurora.emerald,
    '--aurora-gold': p.aurora.gold,
    '--aurora-teal': p.aurora.teal,
    '--text-primary': p.text.primary,
    '--text-secondary': p.text.secondary,
    '--text-tertiary': p.text.tertiary,
    '--text-disabled': p.text.disabled,
    '--ivory': p.ivory,
    '--success': p.semantic.success,
    '--warning': p.semantic.warning,
    '--error': p.semantic.error,
    '--info': p.semantic.info,
    '--neon-green': p.neonGreen,
    '--shadow-1': p.shadow.level1,
    '--shadow-2': p.shadow.level2,
    '--shadow-3': p.shadow.level3,
    '--shadow-glow-active': p.shadow.glowActive,
    '--shadow-card-highlight': p.shadow.cardHighlight,
    ...Object.fromEntries(p.chart.map((c, i) => [`--chart-${i + 1}`, c])),
  };
};

/**
 * Rejimni sahifaga qo'llash: CSS o'zgaruvchilari, `data-theme` (CSS dagi
 * rejimga xos qoidalar uchun), `color-scheme` (skrollbar, forma) va brauzer paneli.
 */
export const applyTheme = (mode: ThemeMode): void => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const [name, value] of Object.entries(cssVariables(mode))) root.style.setProperty(name, value);
  root.dataset.theme = mode;
  root.style.colorScheme = mode;
  root.style.background = PALETTES[mode].bg.bg0;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', PALETTES[mode].themeColor);
};

/* ---------------------------------------- Komponentlar uchun rang havolalari */

/** CSS o'zgaruvchisi havolasi */
const v = (name: string) => `var(--${name})`;

const color = {
  bg: { bg0: v('bg0'), bg1: v('bg1'), bg2: v('bg2'), bg3: v('bg3') },
  elevated: v('bg-elevated'),
  glass: v('glass-bg'),
  border: { subtle: v('border-subtle'), base: v('border-base'), strong: v('border-strong') },
  emerald: {
    deepest: v('emerald-deepest'),
    deep: v('emerald-deep'),
    felt: v('emerald-felt'),
    base: v('emerald-base'),
    bright: v('emerald-bright'),
    glow: v('emerald-glow'),
  },
  wood: { light: v('wood-light'), base: v('wood'), dark: v('wood-dark') },
  gold: {
    base: v('gold'),
    hover: v('gold-hover'),
    active: v('gold-active'),
    dim: v('gold-dim'),
    subtle: v('gold-subtle'),
    line: v('gold-line'),
    glow: v('gold-glow'),
    contrast: v('gold-contrast'),
    gradient: v('gold-gradient'),
  },
  primary: { base: v('primary'), hover: v('primary-hover'), active: v('primary-active'), on: v('on-primary') },
  text: {
    primary: v('text-primary'),
    secondary: v('text-secondary'),
    tertiary: v('text-tertiary'),
    disabled: v('text-disabled'),
  },
  semantic: { success: v('success'), warning: v('warning'), error: v('error'), info: v('info') },
  neonGreen: v('neon-green'),
  ivory: v('ivory'),
  aurora: { emerald: v('aurora-emerald'), gold: v('aurora-gold'), teal: v('aurora-teal') },
  chart: Array.from({ length: 8 }, (_, i) => v(`chart-${i + 1}`)),
} as const;

/* ------------------------------------------------------------ Tipografiya */

/** Matn: Onest — tiniq grotesk (kirill + lotin), o'z-o'zidan xosting (@fontsource) */
export const FONT_FAMILY =
  "'Onest Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/** Sarlavhalar, raqamlar, tugmalar: logodagi Unbounded — brend shrifti */
export const FONT_FAMILY_DISPLAY =
  "'Unbounded Variable', 'Onest Variable', -apple-system, 'Segoe UI', Roboto, sans-serif";

/** Taymer/pul: JetBrains Mono (tabular) — tablo kabi aniq raqamlar */
export const FONT_FAMILY_MONO =
  "'JetBrains Mono Variable', 'Consolas', 'SF Mono', 'Menlo', monospace";

/* -------------------------------------------------------------- Shkalalar */

/** Bo'shliq shkalasi (px) */
const spacing = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

/** Radius shkalasi (px) */
const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;

/** Soyalar — rejimga mos (och rejimda yumshoq, qorong'ida chuqurroq) */
const shadow = {
  level1: v('shadow-1'),
  level2: v('shadow-2'),
  level3: v('shadow-3'),
  glowActive: v('shadow-glow-active'),
  cardHighlight: v('shadow-card-highlight'),
} as const;

/** Harakat (motion) davomiyliklari va easinglari */
const motion = {
  duration: { fast: 0.15, base: 0.25, slow: 0.4 },
  easing: {
    /** Standart chiqish easingi */
    out: [0.16, 1, 0.3, 1] as [number, number, number, number],
    /** CSS uchun */
    cssOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
    cssInOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
  },
} as const;

/* ------------------------------------------------------------------ TOKENS */

export const TOKENS = {
  color,
  spacing,
  radius,
  shadow,
  motion,
} as const;

/* --------------------------------------------------------------- antd tema */

/**
 * To'liq antd ThemeConfig — tanlangan rejim uchun (haqiqiy ranglar bilan:
 * antd hosilaviy ranglarni o'zi hisoblaydi). AppSettingsContext iste'mol qiladi.
 */
export const buildAntdTheme = (mode: ThemeMode): ThemeConfig => {
  const p = PALETTES[mode];
  const light = mode === 'light';
  return {
    algorithm: light ? antTheme.defaultAlgorithm : antTheme.darkAlgorithm,
    token: {
      colorPrimary: p.primary.base,
      colorSuccess: p.semantic.success,
      colorWarning: p.semantic.warning,
      colorError: p.semantic.error,
      colorInfo: p.semantic.info,
      colorLink: p.gold.base,
      colorLinkHover: p.gold.hover,

      colorBgBase: p.bg.bg0,
      colorBgLayout: p.bg.bg0,
      colorBgContainer: p.bg.bg1,
      colorBgElevated: p.elevated,
      colorBgSpotlight: light ? '#2a2620' : p.bg.bg3,

      colorBorder: p.border.base,
      colorBorderSecondary: p.border.subtle,

      colorText: p.text.primary,
      colorTextSecondary: p.text.secondary,
      colorTextTertiary: p.text.tertiary,
      colorTextQuaternary: p.text.disabled,

      borderRadius: 10,
      borderRadiusLG: 14,
      borderRadiusSM: 6,

      fontFamily: FONT_FAMILY,
      fontFamilyCode: FONT_FAMILY_MONO,

      boxShadow: p.shadow.level2,
      boxShadowSecondary: p.shadow.level3,
    },
    components: {
      Layout: {
        siderBg: p.bg.bg1,
        headerBg: 'transparent', // Header o'zi glass uslubini beradi
        bodyBg: p.bg.bg0,
        headerPadding: '0 16px',
      },
      Menu: {
        itemBg: 'transparent',
        itemColor: p.text.secondary,
        itemHoverColor: p.text.primary,
        itemHoverBg: p.bg.bg3,
        itemSelectedColor: light ? p.primary.base : p.gold.base,
        itemSelectedBg: p.emerald.deep,
        itemBorderRadius: radius.sm,
        groupTitleColor: p.text.tertiary,
        iconSize: 16,
        itemMarginInline: 8,
      },
      Card: {
        colorBgContainer: p.bg.bg1,
        colorBorderSecondary: p.border.base,
        borderRadiusLG: 14,
        headerBg: 'transparent',
        boxShadowTertiary: light ? p.shadow.level1 : 'none',
      },
      Table: {
        headerBg: p.bg.bg2,
        headerColor: p.text.secondary,
        headerSplitColor: p.border.subtle,
        borderColor: p.border.subtle,
        rowHoverBg: p.bg.bg3,
        headerBorderRadius: radius.sm,
        colorBgContainer: p.bg.bg1,
      },
      Button: {
        primaryShadow: 'none',
        primaryColor: p.primary.on,
        defaultBg: 'transparent',
        defaultBorderColor: p.border.strong,
        defaultHoverBorderColor: p.gold.base,
        defaultHoverColor: p.gold.hover,
        fontWeight: 600,
        borderRadius: 10,
      },
      Input: {
        colorBgContainer: light ? p.elevated : p.bg.bg2,
        colorBorder: p.border.strong,
        hoverBorderColor: p.gold.dim,
        activeBorderColor: p.gold.base,
        activeShadow: `0 0 0 2px ${p.gold.subtle}`,
      },
      InputNumber: {
        colorBgContainer: light ? p.elevated : p.bg.bg2,
        colorBorder: p.border.strong,
        hoverBorderColor: p.gold.dim,
        activeBorderColor: p.gold.base,
        activeShadow: `0 0 0 2px ${p.gold.subtle}`,
      },
      Select: {
        colorBgContainer: light ? p.elevated : p.bg.bg2,
        colorBgElevated: p.elevated,
        colorBorder: p.border.strong,
        optionSelectedBg: p.emerald.deep,
        optionActiveBg: p.bg.bg3,
      },
      DatePicker: {
        colorBgContainer: light ? p.elevated : p.bg.bg2,
        colorBgElevated: p.elevated,
        colorBorder: p.border.strong,
      },
      Modal: {
        contentBg: p.elevated,
        headerBg: p.elevated,
        footerBg: 'transparent',
        borderRadiusLG: radius.lg,
        titleFontSize: 17,
      },
      Drawer: {
        /* Ko'tarilgan qatlam — sahifa fonidan aniq ajralib turadi */
        colorBgElevated: p.elevated,
      },
      Tag: {
        defaultBg: p.bg.bg2,
        defaultColor: p.text.secondary,
        borderRadiusSM: 6,
      },
      Statistic: {
        titleFontSize: 13,
        contentFontSize: 24,
        colorTextDescription: p.text.tertiary,
      },
      Tabs: {
        itemColor: p.text.secondary,
        itemSelectedColor: light ? p.primary.base : p.gold.base,
        itemHoverColor: p.gold.hover,
        inkBarColor: light ? p.primary.base : p.gold.base,
      },
      Segmented: {
        trackBg: light ? p.bg.bg2 : p.bg.bg1,
        itemSelectedBg: light ? p.elevated : p.bg.bg3,
        itemColor: p.text.secondary,
        itemSelectedColor: p.text.primary,
      },
      Dropdown: {
        colorBgElevated: p.elevated,
      },
      Tooltip: {
        colorBgSpotlight: light ? '#2a2620' : p.bg.bg3,
      },
      Empty: {
        colorTextDescription: p.text.tertiary,
      },
    },
  };
};
