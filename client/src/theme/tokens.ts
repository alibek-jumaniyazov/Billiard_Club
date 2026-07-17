import { theme as antTheme, type ThemeConfig } from 'antd';

/**
 * PRIME BILLIARD — dizayn tokenlarining YAGONA manbasi.
 *
 * Estetika: hashamatli billiard klubi — chuqur qora/karbon/grafit yuzalar,
 * to'q zumrad (mato) urg'ular, premium oltin (#d4af37 oilasi), kumush matn,
 * jonli holatlar uchun nozik neon-yashil.
 *
 * MUHIM: index.css dagi :root CSS o'zgaruvchilari va Landing.tsx konstantalari
 * shu fayldagi qiymatlardan olinadi — rang faqat SHU YERDA o'zgartiriladi.
 */

/* ---------------------------------------------------------------- Ranglar */

/** Fon qatlamlari — eng chuquridan (sahifa) ko'tarilganigacha (hover) */
const bg = {
  /** Sahifaning eng chuqur foni — deyarli qora, xira yashil tusi bilan */
  bg0: '#0a0c0b',
  /** Karbon karta foni */
  bg1: '#121514',
  /** Ko'tarilgan yuzalar (modal, dropdown, jadval sarlavhasi) */
  bg2: '#181c1a',
  /** Hover / tanlangan qator foni */
  bg3: '#1f2422',
} as const;

/** Grafit chegara shkalasi */
const border = {
  subtle: '#1d2320',
  base: '#262d29',
  strong: '#333b37',
} as const;

/** Zumrad shkalasi — to'q mato yashilidan yorqin urg'ugacha */
const emerald = {
  /** Eng to'q — fon gradientlari uchun */
  deepest: '#0c1f16',
  /** To'q mato (felt) — tanlangan menyu bandi foni */
  deep: '#122a1d',
  /** Asosiy mato yashili */
  felt: '#17402a',
  /** O'rtacha zumrad */
  base: '#1e5c3a',
  /** Yorqin urg'u (grafik, ikonka) */
  bright: '#2f9e64',
  /** Eng yorqin — hoverdagi urg'ular */
  glow: '#43c17e',
} as const;

/** Premium oltin — #d4af37 oilasi (antd stock #faad14 EMAS) */
const gold = {
  base: '#d4af37',
  hover: '#e2c358',
  active: '#b5922c',
  /** Xira oltin — ikkilamchi matn urg'usi */
  dim: '#9c7f2e',
  /** Shaffof oltin fon (badge, tanlangan holat) */
  subtle: 'rgba(212, 175, 55, 0.12)',
  /** Shaffof oltin chiziq/chegara */
  line: 'rgba(212, 175, 55, 0.22)',
  /** Oltin ustidagi matn rangi */
  contrast: '#141210',
  /** Brend gradienti (logo, mark) */
  gradient: 'linear-gradient(135deg, #e2c358 0%, #d4af37 45%, #b5922c 100%)',
} as const;

/** Kumush matn shkalasi */
const text = {
  primary: '#e8ebe9',
  secondary: '#a9b3ad',
  tertiary: '#717c76',
  disabled: '#4b5450',
} as const;

/** Semantik ranglar — palitraga moslashtirilgan */
const semantic = {
  success: '#43b97b',
  warning: '#d9a13d',
  error: '#d9544d',
  info: '#5f93b8',
} as const;

/** Neon-yashil — jonli taymer / faol sessiya urg'usi */
const neonGreen = '#3fe08c';

/** Grafik (chart) palitrasi — oltin birinchi, keyin palitra ranglari */
const chart = [
  gold.base,
  emerald.bright,
  '#8fa89b',
  semantic.info,
  semantic.warning,
  emerald.glow,
  semantic.error,
  gold.dim,
] as const;

/* ------------------------------------------------------------ Tipografiya */

/** Inter Variable (o'z-o'zidan xosting, @fontsource orqali) + tizim zaxirasi */
export const FONT_FAMILY =
  "'Inter Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/** Taymer/raqamli displeylar uchun monospace stek (tabular-nums bilan) */
export const FONT_FAMILY_MONO =
  "'Consolas', 'SF Mono', 'JetBrains Mono', 'Menlo', monospace";

/* -------------------------------------------------------------- Shkalalar */

/** Bo'shliq shkalasi (px) */
const spacing = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

/** Radius shkalasi (px) */
const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

/** Soya/ko'tarilish shkalasi — qorong'i muhitga moslangan, nozik */
const shadow = {
  /** 1-daraja: karta */
  level1: '0 1px 2px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.25)',
  /** 2-daraja: dropdown, popover */
  level2: '0 4px 12px rgba(0, 0, 0, 0.45), 0 8px 24px rgba(0, 0, 0, 0.3)',
  /** 3-daraja: modal, drawer */
  level3: '0 8px 24px rgba(0, 0, 0, 0.55), 0 16px 48px rgba(0, 0, 0, 0.35)',
  /** Faol stol kartasi uchun zumrad-oltin nur */
  glowActive:
    '0 0 0 1px rgba(212, 175, 55, 0.35), 0 0 18px rgba(63, 224, 140, 0.12)',
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
  color: { bg, border, emerald, gold, text, semantic, neonGreen, chart },
  spacing,
  radius,
  shadow,
  motion,
} as const;

/* --------------------------------------------------------------- antd tema */

/**
 * To'liq antd ThemeConfig quruvchisi — FAQAT qorong'i rejim (darkAlgorithm
 * qat'iy o'rnatilgan, yorug' rejim mavjud emas).
 * AppSettingsContext dagi ConfigProvider shuni iste'mol qiladi.
 */
export const buildAntdTheme = (): ThemeConfig => ({
  algorithm: antTheme.darkAlgorithm,
  token: {
    colorPrimary: gold.base,
    colorSuccess: semantic.success,
    colorWarning: semantic.warning,
    colorError: semantic.error,
    colorInfo: semantic.info,
    colorLink: gold.base,
    colorLinkHover: gold.hover,

    colorBgBase: bg.bg0,
    colorBgLayout: bg.bg0,
    colorBgContainer: bg.bg1,
    colorBgElevated: bg.bg2,
    colorBgSpotlight: bg.bg3,

    colorBorder: border.base,
    colorBorderSecondary: border.subtle,

    colorText: text.primary,
    colorTextSecondary: text.secondary,
    colorTextTertiary: text.tertiary,
    colorTextQuaternary: text.disabled,

    borderRadius: radius.sm,
    borderRadiusLG: radius.md,
    borderRadiusSM: 6,

    fontFamily: FONT_FAMILY,

    boxShadow: shadow.level2,
    boxShadowSecondary: shadow.level3,
  },
  components: {
    Layout: {
      siderBg: bg.bg1,
      headerBg: 'transparent', // Header o'zi glass uslubini beradi
      bodyBg: bg.bg0,
      headerPadding: '0 16px',
    },
    Menu: {
      itemBg: 'transparent',
      itemColor: text.secondary,
      itemHoverColor: text.primary,
      itemHoverBg: bg.bg3,
      itemSelectedColor: gold.base,
      itemSelectedBg: emerald.deep,
      itemBorderRadius: radius.sm,
      groupTitleColor: text.tertiary,
      iconSize: 16,
      itemMarginInline: 8,
    },
    Card: {
      colorBgContainer: bg.bg1,
      colorBorderSecondary: border.subtle,
      borderRadiusLG: radius.md,
      headerBg: 'transparent',
      boxShadowTertiary: shadow.level1,
    },
    Table: {
      headerBg: bg.bg2,
      headerColor: text.secondary,
      headerSplitColor: border.subtle,
      borderColor: border.subtle,
      rowHoverBg: bg.bg3,
      headerBorderRadius: radius.sm,
      colorBgContainer: bg.bg1,
    },
    Button: {
      primaryShadow: 'none',
      primaryColor: gold.contrast,
      defaultBg: 'transparent',
      defaultBorderColor: border.strong,
      defaultHoverBorderColor: gold.base,
      defaultHoverColor: gold.hover,
      fontWeight: 500,
      borderRadius: radius.sm,
    },
    Input: {
      colorBgContainer: bg.bg2,
      colorBorder: border.strong,
      hoverBorderColor: gold.dim,
      activeBorderColor: gold.base,
      activeShadow: `0 0 0 2px ${gold.subtle}`,
    },
    InputNumber: {
      colorBgContainer: bg.bg2,
      colorBorder: border.strong,
      hoverBorderColor: gold.dim,
      activeBorderColor: gold.base,
      activeShadow: `0 0 0 2px ${gold.subtle}`,
    },
    Select: {
      colorBgContainer: bg.bg2,
      colorBgElevated: bg.bg2,
      colorBorder: border.strong,
      optionSelectedBg: emerald.deep,
      optionActiveBg: bg.bg3,
    },
    DatePicker: {
      colorBgContainer: bg.bg2,
      colorBgElevated: bg.bg2,
      colorBorder: border.strong,
    },
    Modal: {
      contentBg: bg.bg2,
      headerBg: bg.bg2,
      footerBg: 'transparent',
      borderRadiusLG: radius.lg,
      titleFontSize: 17,
    },
    Drawer: {
      colorBgElevated: bg.bg1,
    },
    Tag: {
      defaultBg: bg.bg2,
      defaultColor: text.secondary,
      borderRadiusSM: 6,
    },
    Statistic: {
      titleFontSize: 13,
      contentFontSize: 24,
      colorTextDescription: text.tertiary,
    },
    Tabs: {
      itemColor: text.secondary,
      itemSelectedColor: gold.base,
      itemHoverColor: gold.hover,
      inkBarColor: gold.base,
    },
    Segmented: {
      trackBg: bg.bg0,
      itemSelectedBg: bg.bg3,
      itemColor: text.secondary,
      itemSelectedColor: text.primary,
    },
    Dropdown: {
      colorBgElevated: bg.bg2,
    },
    Tooltip: {
      colorBgSpotlight: bg.bg3,
    },
    Empty: {
      colorTextDescription: text.tertiary,
    },
  },
});
