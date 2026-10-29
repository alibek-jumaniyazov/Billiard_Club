import { theme as antTheme, type ThemeConfig } from 'antd';

/**
 * BILLIARD CLUB — dizayn tokenlarining YAGONA manbasi.
 *
 * Estetika: "tungi billiard zali" + minimalizm. Qorong'i zal (yashil tusli
 * deyarli qora), chiroq ostidagi MATO yashili, YONG'OQ yog'och bortlar,
 * MIS-OLTIN urg'u va FIL SUYAGI (shar) rangidagi matn. Gradient, shisha va
 * nurlar minimal — yuzalar tekis, chegaralar ingichka, ierarxiya tipografiya
 * va bo'shliq bilan beriladi.
 *
 * MUHIM: index.css dagi :root CSS o'zgaruvchilari va Landing.tsx konstantalari
 * shu fayldagi qiymatlardan olinadi — rang faqat SHU YERDA o'zgartiriladi.
 */

/* ---------------------------------------------------------------- Ranglar */

/** Fon qatlamlari — zal qorong'iligidan (sahifa) ko'tarilganigacha (hover) */
const bg = {
  /** Sahifa — chiroqsiz zal: yashil tusli deyarli qora */
  bg0: '#090c0b',
  /** Karta / panel */
  bg1: '#101513',
  /** Ko'tarilgan yuzalar (modal, dropdown, jadval sarlavhasi) */
  bg2: '#161d1a',
  /** Hover / tanlangan qator foni */
  bg3: '#1d2622',
} as const;

/** Ingichka chegaralar — minimal, lekin aniq ajratadigan */
const border = {
  subtle: '#1a221e',
  base: '#24302a',
  strong: '#33413a',
} as const;

/**
 * MATO (felt) shkalasi — billiard stolining yashil matosi. Kalit nomlari
 * tarixiy ("emerald") — komponentlar shu nomlar bilan murojaat qiladi.
 */
const emerald = {
  /** Eng to'q — chiroqsiz mato soyasi */
  deepest: '#08261a',
  /** To'q mato — tanlangan menyu bandi foni */
  deep: '#0f3a27',
  /** Asosiy mato */
  felt: '#135c3c',
  /** Chiroq ostidagi mato */
  base: '#18774c',
  /** Yorqin urg'u (grafik, ikonka) */
  bright: '#23a066',
  /** Eng yorqin — jonli holatlar */
  glow: '#3fd68e',
} as const;

/** Yong'oq yog'och — stol bortlari (ramka) */
const wood = {
  light: '#7a5030',
  base: '#55351f',
  dark: '#2f1d11',
} as const;

/** Mis-oltin — brend urg'usi (tekis, yorqin emas) */
const gold = {
  base: '#dbb35c',
  hover: '#e8c677',
  active: '#bd954a',
  /** Xira — ikkilamchi urg'u */
  dim: '#8d7745',
  /** Shaffof fon (badge, tanlangan holat) */
  subtle: 'rgba(219, 179, 92, 0.12)',
  /** Shaffof chiziq/chegara */
  line: 'rgba(219, 179, 92, 0.24)',
  /** Tashqi nur — juda tejamkor ishlatiladi */
  glow: 'rgba(219, 179, 92, 0.32)',
  /** Oltin ustidagi matn rangi */
  contrast: '#17130a',
  /** Brend belgisi (logo) uchun */
  gradient: 'linear-gradient(135deg, #e8c677 0%, #dbb35c 50%, #bd954a 100%)',
} as const;

/** Fil suyagi (shar) matn shkalasi — iliq, ko'zni charchatmaydi */
const text = {
  primary: '#f1ece1',
  secondary: '#b5ae9f',
  tertiary: '#8b8579',
  disabled: '#55524b',
} as const;

/** Semantik ranglar — billiard palitrasidan: mato, pauza-amber, qizil shar, bo'r-ko'k */
const semantic = {
  success: '#43b77b',
  warning: '#f0a53a',
  error: '#ec5a4f',
  info: '#5b9bea',
} as const;

/** Jonli taymer / faol sessiya urg'usi */
const neonGreen = '#3fd68e';

/** Fil suyagi shar — stol raqami belgisi */
const ivory = '#f3eee2';

/**
 * Aurora — eski animatsion fon palitrasi. Minimalizm uchun juda xiralashtirilgan
 * (faqat auth/blok ekranlarida qolgan).
 */
const aurora = {
  emerald: 'rgba(24, 119, 76, 0.16)',
  gold: 'rgba(219, 179, 92, 0.06)',
  teal: 'rgba(40, 110, 100, 0.08)',
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

/** Matn: Inter Variable (o'z-o'zidan xosting, @fontsource orqali) + tizim zaxirasi */
export const FONT_FAMILY =
  "'Inter Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/** Sarlavhalar: keng geometrik Unbounded — qisqa, yirik, ishonchli */
export const FONT_FAMILY_DISPLAY =
  "'Unbounded Variable', 'Inter Variable', -apple-system, 'Segoe UI', Roboto, sans-serif";

/** Taymer/pul: JetBrains Mono (tabular) — tablo kabi aniq raqamlar */
export const FONT_FAMILY_MONO =
  "'JetBrains Mono Variable', 'Consolas', 'SF Mono', 'Menlo', monospace";

/* -------------------------------------------------------------- Shkalalar */

/** Bo'shliq shkalasi (px) */
const spacing = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

/** Radius shkalasi (px) */
const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;

/** Soyalar — minimal: chuqurlik chegaralar bilan beriladi, soya kam */
const shadow = {
  /** 1-daraja: karta (deyarli sezilmas) */
  level1: '0 1px 2px rgba(0, 0, 0, 0.4)',
  /** 2-daraja: dropdown, popover */
  level2: '0 8px 24px rgba(0, 0, 0, 0.45)',
  /** 3-daraja: modal, drawer */
  level3: '0 16px 48px rgba(0, 0, 0, 0.55)',
  /** Faol (tanlangan) element — ingichka oltin halqa */
  glowActive: '0 0 0 1px rgba(219, 179, 92, 0.45)',
  /** Kartaning yuqori qirrasidagi juda nozik yorug'lik */
  cardHighlight: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)',
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
  color: { bg, border, emerald, wood, gold, text, semantic, neonGreen, ivory, aurora, chart },
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

    borderRadius: 10,
    borderRadiusLG: 14,
    borderRadiusSM: 6,

    fontFamily: FONT_FAMILY,
    fontFamilyCode: FONT_FAMILY_MONO,

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
      colorBorderSecondary: border.base,
      borderRadiusLG: 14,
      headerBg: 'transparent',
      boxShadowTertiary: 'none',
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
      primaryShadow: 'none',
      primaryColor: gold.contrast,
      defaultBg: 'transparent',
      defaultBorderColor: border.strong,
      defaultHoverBorderColor: gold.base,
      defaultHoverColor: gold.hover,
      fontWeight: 600,
      borderRadius: 10,
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
