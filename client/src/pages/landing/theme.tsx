import type { ReactNode } from 'react';
import { ConfigProvider, theme as antTheme, type ThemeConfig } from 'antd';
import { useAppSettings } from '../../context/AppSettingsContext';
import { PALETTES } from '../../theme/tokens';

/**
 * LANDING MAVZUSI — ilova ichidagi (qorong'i) tokenlardan ALOHIDA.
 *
 * Yo'nalish: "fil suyagi va mato". Iliq och sahifa (shar rangidagi qog'oz,
 * siyoh matn) va mahsulot ko'rsatiladigan to'q mato-yashil "sahna" bo'limlari
 * almashinadi. Urg'u — xira jez va mato yashili; neon, nur va gradient matn yo'q.
 *
 * CSS tomoni: tones.css dagi .lp-tone-light / .lp-tone-dark o'zgaruvchilari —
 * qiymatlar SHU fayl bilan bir xil saqlanadi.
 */
export const LP = {
  light: {
    bg: '#F3EFE6',
    surface: '#FBF8F2',
    raised: '#EDE7DB',
    hover: '#E5DDCD',
    lineSubtle: '#E6DFD1',
    line: '#DCD3C2',
    lineStrong: '#C6B9A1',
    text: '#17140F',
    text2: '#4D473D',
    text3: '#7C7466',
    accent: '#8C6A33',
    felt: '#0F4D3A',
    feltHover: '#0B3D2E',
    onFelt: '#F7F3EA',
  },
  dark: {
    bg: '#0E2A22',
    surface: '#12342A',
    raised: '#173D32',
    hover: '#1C473A',
    lineSubtle: 'rgba(243, 239, 230, 0.08)',
    line: 'rgba(243, 239, 230, 0.13)',
    lineStrong: 'rgba(243, 239, 230, 0.22)',
    text: '#F3EFE6',
    text2: '#C3C6BB',
    text3: '#93A098',
    accent: '#C9A46A',
    felt: '#F3EFE6',
    feltHover: '#FFFFFF',
    onFelt: '#0E2A22',
  },
} as const;

/** Matn: Onest — iliq, tiniq grotesk (kirill + lotin) */
export const LP_FONT_TEXT = "'Onest Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
/** Sarlavhalar, tugmalar, raqamlar: logodagi Unbounded — brend shrifti */
export const LP_FONT_DISPLAY = "'Unbounded Variable', 'Onest Variable', -apple-system, 'Segoe UI', sans-serif";

const shared = {
  fontFamily: LP_FONT_TEXT,
  fontSize: 15,
  borderRadius: 12,
  borderRadiusLG: 16,
  borderRadiusSM: 8,
  controlHeight: 40,
  controlHeightLG: 50,
  wireframe: false,
};

/** Och bo'limlar — ilova mavzusidan meros OLINMAYDI (u qorong'i) */
export const lightTheme: ThemeConfig = {
  inherit: false,
  algorithm: antTheme.defaultAlgorithm,
  token: {
    ...shared,
    colorPrimary: LP.light.felt,
    colorLink: LP.light.accent,
    colorLinkHover: LP.light.text,
    colorSuccess: '#2E8A5E',
    colorWarning: '#A86A12',
    colorError: '#B9443A',
    colorInfo: '#2F6FB0',
    colorBgBase: LP.light.bg,
    colorBgLayout: LP.light.bg,
    colorBgContainer: LP.light.surface,
    colorBgElevated: LP.light.surface,
    colorBorder: LP.light.line,
    colorBorderSecondary: LP.light.lineSubtle,
    colorText: LP.light.text,
    colorTextSecondary: LP.light.text2,
    colorTextTertiary: LP.light.text3,
    boxShadow: '0 12px 32px rgba(23, 20, 15, 0.10)',
    boxShadowSecondary: '0 18px 48px rgba(23, 20, 15, 0.14)',
  },
  components: {
    Button: { primaryShadow: 'none', defaultShadow: 'none', fontWeight: 600 },
    Segmented: {
      trackBg: LP.light.raised,
      itemSelectedBg: LP.light.surface,
      itemColor: LP.light.text2,
      itemSelectedColor: LP.light.text,
    },
    Collapse: { headerBg: 'transparent', contentBg: 'transparent' },
    Slider: {
      trackBg: LP.light.felt,
      trackHoverBg: LP.light.feltHover,
      handleColor: LP.light.felt,
      handleActiveColor: LP.light.feltHover,
      railBg: LP.light.line,
      railHoverBg: LP.light.lineStrong,
    },
    Drawer: { colorBgElevated: LP.light.bg },
  },
};

/** To'q "sahna" bo'limlari */
export const darkTheme: ThemeConfig = {
  inherit: false,
  algorithm: antTheme.darkAlgorithm,
  token: {
    ...shared,
    colorPrimary: LP.dark.accent,
    colorLink: LP.dark.accent,
    colorLinkHover: LP.dark.text,
    colorSuccess: '#6FCF97',
    colorWarning: '#E8B15A',
    colorError: '#EE8A80',
    colorInfo: '#8DB8E8',
    colorBgBase: LP.dark.bg,
    colorBgLayout: LP.dark.bg,
    colorBgContainer: LP.dark.surface,
    colorBgElevated: LP.dark.raised,
    colorBorder: LP.dark.line,
    colorBorderSecondary: LP.dark.lineSubtle,
    colorText: LP.dark.text,
    colorTextSecondary: LP.dark.text2,
    colorTextTertiary: LP.dark.text3,
  },
  components: {
    Button: { primaryShadow: 'none', defaultShadow: 'none', fontWeight: 600 },
    Segmented: {
      trackBg: LP.dark.surface,
      itemSelectedBg: LP.dark.hover,
      itemColor: LP.dark.text2,
      itemSelectedColor: LP.dark.text,
    },
  },
};

/**
 * Inline uslublar uchun ranglar — CSS o'zgaruvchilari orqali: element qaysi
 * ohangda (och sahifa, to'q sahna) tursa, o'shaning qiymatini oladi.
 */
export const V = {
  bg: { bg0: 'var(--bg0)', bg1: 'var(--bg1)', bg2: 'var(--bg2)', bg3: 'var(--bg3)' },
  border: { subtle: 'var(--border-subtle)', base: 'var(--border-base)', strong: 'var(--border-strong)' },
  emerald: { deepest: 'var(--emerald-deepest)', deep: 'var(--emerald-deep)', felt: 'var(--emerald-felt)', glow: 'var(--emerald-glow)' },
  gold: { base: 'var(--gold)', hover: 'var(--gold-hover)', subtle: 'var(--gold-subtle)', line: 'var(--gold-line)' },
  text: { primary: 'var(--text-primary)', secondary: 'var(--text-secondary)', tertiary: 'var(--text-tertiary)' },
} as const;

/** Qorong'i rejimdagi oddiy bo'limlar — ilova bilan bir xil neytral ko'mir */
const charcoal = PALETTES.dark;
export const charcoalTheme: ThemeConfig = {
  inherit: false,
  algorithm: antTheme.darkAlgorithm,
  token: {
    ...shared,
    colorPrimary: charcoal.primary.base,
    colorLink: charcoal.gold.base,
    colorLinkHover: charcoal.text.primary,
    colorSuccess: charcoal.semantic.success,
    colorWarning: charcoal.semantic.warning,
    colorError: charcoal.semantic.error,
    colorInfo: charcoal.semantic.info,
    colorBgBase: charcoal.bg.bg0,
    colorBgLayout: charcoal.bg.bg0,
    colorBgContainer: charcoal.bg.bg1,
    colorBgElevated: charcoal.elevated,
    colorBorder: charcoal.border.base,
    colorBorderSecondary: charcoal.border.subtle,
    colorText: charcoal.text.primary,
    colorTextSecondary: charcoal.text.secondary,
    colorTextTertiary: charcoal.text.tertiary,
  },
  components: {
    Button: { primaryShadow: 'none', defaultShadow: 'none', fontWeight: 600, primaryColor: charcoal.primary.on },
    Segmented: {
      trackBg: charcoal.bg.bg1,
      itemSelectedBg: charcoal.bg.bg3,
      itemColor: charcoal.text.secondary,
      itemSelectedColor: charcoal.text.primary,
    },
    Collapse: { headerBg: 'transparent', contentBg: 'transparent' },
    Slider: {
      trackBg: charcoal.gold.base,
      trackHoverBg: charcoal.gold.hover,
      handleColor: charcoal.gold.base,
      handleActiveColor: charcoal.gold.hover,
      railBg: charcoal.border.base,
      railHoverBg: charcoal.border.strong,
    },
  },
};

/** Butun landing — tanlangan rejim mavzusida (to'q sahna bo'limlari o'zinikida) */
export const LandingTheme = ({ children }: { children: ReactNode }) => {
  const { themeMode } = useAppSettings();
  return <ConfigProvider theme={themeMode === 'dark' ? charcoalTheme : lightTheme}>{children}</ConfigProvider>;
};

/**
 * To'q "sahna" — ichidagi bo'lim(lar) mato-yashil fonda. `data-tone` bilan
 * header o'z rangini moslaydi (SiteHeader).
 */
export const DarkStage = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <ConfigProvider theme={darkTheme}>
    <div className={`lp-tone-dark ${className}`.trim()} data-tone="dark">
      {children}
    </div>
  </ConfigProvider>
);
