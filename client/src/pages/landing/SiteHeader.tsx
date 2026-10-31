import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from 'antd';
import { ArrowRightOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons';
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BrandLogo } from '../../components/ui';
import { useAppSettings } from '../../context/AppSettingsContext';

export interface HeaderLink {
  id: string;
  key: string;
  /** Tor kompyuter ekranida yuqori menyudan yashiriladi */
  secondary?: boolean;
  /** Faqat telefon menyusida */
  drawerOnly?: boolean;
}

interface SiteHeaderProps {
  links: HeaderLink[];
  lang: 'uz' | 'ru';
  onLang: (lang: 'uz' | 'ru') => void;
  onLogin: () => void;
  onStart: () => void;
}

/** Til almashtirgich — matnli, ixcham: "UZ | RU" */
const LangToggle = ({ lang, onLang }: { lang: 'uz' | 'ru'; onLang: (lang: 'uz' | 'ru') => void }) => (
  <div className="lp-lang" role="group" aria-label="Til / Язык">
    <button type="button" aria-pressed={lang === 'uz'} onClick={() => onLang('uz')}>
      UZ
    </button>
    <i aria-hidden />
    <button type="button" aria-pressed={lang === 'ru'} onClick={() => onLang('ru')}>
      RU
    </button>
  </div>
);

/** Och / qorong'i rejim — header uslubidagi doira tugma */
const ThemeButton = () => {
  const { t } = useTranslation();
  const { themeMode, toggleTheme } = useAppSettings();
  const label = t(themeMode === 'dark' ? 'common.themeLight' : 'common.themeDark');
  return (
    <button type="button" className="lp-theme" aria-label={label} title={label} aria-pressed={themeMode === 'dark'} onClick={toggleTheme}>
      {themeMode === 'dark' ? <SunOutlined /> : <MoonOutlined />}
    </button>
  );
};

/**
 * LANDING HEADER.
 *
 * Sahifa tepasida — keng, shaffof. Pastga tushganda — markazdagi ixcham
 * "kapsula"ga aylanadi (kenglik, balandlik, burchak silliq o'zgaradi) va
 * ostida o'qilish chizig'i chiqadi. To'q "sahna" bo'limi ustidan o'tganda
 * ranglari o'zi teskarisiga almashadi. Faol bo'lim — nav ostida sirpanib
 * yuradigan kichik shar. Telefonda — to'liq ekranli menyu.
 */
const SiteHeader = ({ links, lang, onLang, onLogin, onStart }: SiteHeaderProps) => {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  const [onDark, setOnDark] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const linkRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [ball, setBall] = useState<{ x: number; visible: boolean }>({ x: 0, visible: false });

  const { scrollY, scrollYProgress } = useScroll();
  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 24));
  useEffect(() => setScrolled(window.scrollY > 24), []);

  const desktopLinks = links.filter((link) => !link.drawerOnly);

  /* Qaysi bo'lim ekran o'rtasida — o'sha nav bandi faol */
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setActive(entry.target.id);
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    for (const link of desktopLinks) {
      const el = document.getElementById(link.id);
      if (el) io.observe(el);
    }
    // Hero ustida hech biri faol emas
    const top = () => {
      if (window.scrollY < window.innerHeight * 0.5) setActive(null);
    };
    window.addEventListener('scroll', top, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', top);
    };
    // Havolalar ro'yxati o'zgarmaydi (Landing modul konstantasi) — bir marta kuzatiladi
  }, []);

  /* To'q sahna header ostidan o'tyaptimi — yuqori ingichka tasma bo'yicha */
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const stages = Array.from(document.querySelectorAll('[data-tone="dark"]'));
    if (!stages.length) return;
    const over = new Set<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) over.add(entry.target);
          else over.delete(entry.target);
        }
        setOnDark(over.size > 0);
      },
      { rootMargin: '-36px 0px -92% 0px' },
    );
    stages.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  /* Faol bandning markazi — shar shu yerga sirpanadi */
  const placeBall = useCallback(() => {
    const nav = navRef.current;
    const el = active ? linkRefs.current[active] : null;
    if (!nav || !el || el.offsetParent === null) {
      setBall((b) => (b.visible ? { ...b, visible: false } : b));
      return;
    }
    setBall({ x: el.offsetLeft + el.offsetWidth / 2 - 3, visible: true });
  }, [active]);
  useLayoutEffect(() => {
    placeBall();
  }, [placeBall, lang]);
  useEffect(() => {
    window.addEventListener('resize', placeBall);
    return () => window.removeEventListener('resize', placeBall);
  }, [placeBall]);

  /* Menyu ochiq — sahifa aylanmasin, Esc yopadi */
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const headerClass = ['lp-header', scrolled && 'is-scrolled', onDark && !menuOpen && 'is-on-dark']
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <header className={headerClass}>
        <div className="lp-header__bar">
          {/* data-brand-target — brend intro'si belgini shu logotip o'rniga qo'ndiradi */}
          <Link to="/" className="lp-header__brand" aria-label="Billiard Club" data-brand-target="">
            <span className="lp-brand-full">
              <BrandLogo size={34} withWordmark />
            </span>
            <span className="lp-brand-min">
              <BrandLogo size={34} />
            </span>
          </Link>

          <nav ref={navRef} className="lp-header__nav" aria-label={t('landing.navMenu')}>
            {desktopLinks.map((link) => (
              <a
                key={link.id}
                ref={(el) => {
                  linkRefs.current[link.id] = el;
                }}
                href={`#${link.id}`}
                className={[
                  'lp-header__link',
                  link.secondary && 'lp-header__link--secondary',
                  active === link.id && 'is-active',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-current={active === link.id ? 'true' : undefined}
              >
                {t(`landing.${link.key}`)}
              </a>
            ))}
            <Link className="lp-header__link lp-header__link--secondary" to="/download">
              {t('landing.navDownload')}
            </Link>
            <span
              aria-hidden
              className="lp-header__ball"
              style={{ ['--ball-x' as string]: `${ball.x}px`, opacity: ball.visible ? 1 : 0 }}
            />
          </nav>

          <div className="lp-header__actions">
            <ThemeButton />
            <LangToggle lang={lang} onLang={onLang} />
            <a
              className="lp-header__login"
              href="/login"
              onClick={(event) => {
                event.preventDefault();
                onLogin();
              }}
            >
              {t('landing.navLogin')}
            </a>
            <Button type="primary" className="lp-cta-btn" onClick={onStart}>
              {t('landing.navCta')}
            </Button>
            <button
              type="button"
              className="lp-burger"
              aria-label={t('landing.navMenu')}
              aria-expanded={menuOpen}
              aria-controls="lp-menu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <i />
              <i />
            </button>
          </div>

          <motion.span aria-hidden className="lp-header__progress" style={{ scaleX: scrollYProgress }} />
        </div>
      </header>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            id="lp-menu"
            className="lp-menu"
            role="dialog"
            aria-modal="true"
            aria-label={t('landing.navMenu')}
            initial={reduce ? { opacity: 0 } : { opacity: 0, clipPath: 'inset(0 0 100% 0)' }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, clipPath: 'inset(0 0 0% 0)' }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, clipPath: 'inset(0 0 100% 0)' }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.ul
              className="lp-menu__links"
              initial="hidden"
              animate="visible"
              variants={{ visible: { transition: { staggerChildren: 0.05, delayChildren: 0.12 } } }}
            >
              {[...links.map((link) => ({ key: link.id, href: `#${link.id}`, label: t(`landing.${link.key}`) })),
                { key: 'download', href: '/download', label: t('landing.navDownload') }].map((item, i) => (
                <motion.li
                  key={item.key}
                  variants={{
                    hidden: { opacity: 0, y: reduce ? 0 : 18 },
                    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
                  }}
                >
                  {item.href.startsWith('#') ? (
                    <a href={item.href} onClick={() => setMenuOpen(false)}>
                      {item.label}
                      <small>{String(i + 1).padStart(2, '0')}</small>
                    </a>
                  ) : (
                    <Link to={item.href} onClick={() => setMenuOpen(false)}>
                      {item.label}
                      <small>{String(i + 1).padStart(2, '0')}</small>
                    </Link>
                  )}
                </motion.li>
              ))}
            </motion.ul>
            <div className="lp-menu__foot">
              <Button
                block
                size="large"
                className="lp-outline-btn"
                onClick={() => {
                  setMenuOpen(false);
                  onLogin();
                }}
              >
                {t('landing.navLogin')}
              </Button>
              <Button
                block
                size="large"
                type="primary"
                className="lp-cta-btn"
                onClick={() => {
                  setMenuOpen(false);
                  onStart();
                }}
              >
                {t('landing.navCta')} <ArrowRightOutlined />
              </Button>
              <div className="lp-menu__prefs">
                <LangToggle lang={lang} onLang={onLang} />
                <ThemeButton />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default SiteHeader;
