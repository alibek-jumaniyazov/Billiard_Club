import { theme as antTheme, type ThemeConfig } from 'antd';

/**
 * PRIME BILLIARD — dizayn tokenlarining YAGONA manbasi.
 *
 * Estetika: hashamatli billiard klubi — boy, chuqur qarag'ay-karbon yuzalar
 * (zich qora EMAS — har bir qatlam aniq ajralib turadi), to'q zumrad (mato)
 * urg'ular, premium oltin (#d4af37 oilasi), kumush matn, jonli holatlar uchun
 * nozik neon-yashil va sekin harakatlanuvchi "aurora" fon nurlari.
 *
 * MUHIM: index.css dagi :root CSS o'zgaruvchilari va Landing.tsx konstantalari
 * shu fayldagi qiymatlardan olinadi — rang faqat SHU YERDA o'zgartiriladi.
 */

/* ---------------------------------------------------------------- Ranglar */

/** Fon qatlamlari — eng chuquridan (sahifa) ko'tarilganigacha (hover) */
const bg = {
  /** Sahifaning eng chuqur foni — boy qarag'ay-karbon (zich qora emas) */
  bg0: '#0e1513',
  /** Karbon karta foni */
  bg1: '#151d1a',
  /** Ko'tarilgan yuzalar (modal, dropdown, jadval sarlavhasi) */
  bg2: '#1c2622',
  /** Hover / tanlangan qator foni */
  bg3: '#243029',
} as const;

/** Grafit chegara shkalasi — ko'tarilgan fonda aniq o'qiladigan qilib yoritilgan */
const border = {
  subtle: '#243029',
  base: '#2e3b35',
  strong: '#3d4c44',
} as const;

/** Zumrad shkalasi — to'q mato yashilidan yorqin urg'ugacha (biroz to'yinganroq) */
const emerald = {
  /** Eng to'q — fon gradientlari uchun */
  deepest: '#0d2419',
  /** To'q mato (felt) — tanlangan menyu bandi foni */
  deep: '#143224',
  /** Asosiy mato yashili */
  felt: '#1a4a30',
  /** O'rtacha zumrad */
  base: '#216b42',
  /** Yorqin urg'u (grafik, ikonka) */
  bright: '#33ab6c',
  /** Eng yorqin — hoverdagi urg'ular */
  glow: '#4bd48c',
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
  /** Tashqi nur (glow) — CTA va faol elementlar atrofidagi oltin yog'du */
  glow: 'rgba(212, 175, 55, 0.45)',
  /** Oltin ustidagi matn rangi */
  contrast: '#141210',
  /** Brend gradienti (logo, mark) */
  gradient: 'linear-gradient(135deg, #e2c358 0%, #d4af37 45%, #b5922c 100%)',
} as const;

/** Kumush matn shkalasi — ko'tarilgan fonda aniqroq ierarxiya */
const text = {
  primary: '#eef2f0',
  secondary: '#b3bfb8',
  tertiary: '#7d8a83',
  disabled: '#525c56',
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

/**
 * Aurora — animatsion fon "nur dog'lari" palitrasi.
 * AnimatedBackground komponenti va index.css dagi .aurora-blob-* klasslar
 * shu qiymatlarning nusxasidan foydalanadi.
 */
const aurora = {
  emerald: 'rgba(47, 158, 100, 0.20)',
  gold: 'rgba(212, 175, 55, 0.10)',
  teal: 'rgba(66, 160, 150, 0.14)',
} as const;

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

/** Soya/ko'tarilish shkalasi — yumshoqroq va kengroq, chuqurlik hissi uchun */
const shadow = {
  /** 1-daraja: karta */
  level1: '0 1px 3px rgba(0, 0, 0, 0.32), 0 4px 16px rgba(0, 0, 0, 0.22)',
  /** 2-daraja: dropdown, popover */
  level2: '0 4px 16px rgba(0, 0, 0, 0.38), 0 12px 32px rgba(0, 0, 0, 0.26)',
  /** 3-daraja: modal, drawer */
  level3: '0 10px 32px rgba(0, 0, 0, 0.46), 0 24px 64px rgba(0, 0, 0, 0.3)',
  /** Faol stol kartasi uchun zumrad-oltin nur */
  glowActive:
    '0 0 0 1px rgba(212, 175, 55, 0.35), 0 0 20px rgba(75, 212, 140, 0.14)',
  /** Har bir kartaning yuqori qirrasidagi nozik yorug'lik — chuqurlik illyuziyasi */
  cardHighlight: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
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
  color: { bg, border, emerald, gold, text, semantic, neonGreen, aurora, chart },
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
      /* Yuqori qirra yorug'ligi soya bilan birga — kartaga chuqurlik beradi */
      boxShadowTertiary: `${shadow.level1}, ${shadow.cardHighlight}`,
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
      /* Nozik oltin yog'du — asosiy tugma "jonli" ko'rinadi
         (oltin gradient esa index.css dagi .ant-btn-primary qoidasida) */
      primaryShadow: '0 2px 8px rgba(212, 175, 55, 0.25)',
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
      /* Ko'tarilgan qatlam — sahifa fonidan aniq ajralib turadi */
      colorBgElevated: bg.bg2,
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
      trackBg: bg.bg1,
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
