import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Alert, App, Button, Progress, QRCode, Segmented, Space, Typography } from 'antd';
import {
  AndroidFilled,
  AppleFilled,
  ArrowDownOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  CloudDownloadOutlined,
  CopyOutlined,
  DesktopOutlined,
  DisconnectOutlined,
  ExclamationCircleOutlined,
  GlobalOutlined,
  LinuxOutlined,
  MobileOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SyncOutlined,
  ThunderboltOutlined,
  WindowsFilled,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { errorMessage, publicApi } from '../api';
import { BrandLogo, GlassCard, PageTransition, ThemeToggle } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useAppSettings } from '../context/AppSettingsContext';
import { desktopBridge, isDesktop, type DesktopUpdateStatus } from '../offline/desktop';
import { useDocumentHead } from '../hooks/useDocumentHead';
import { TOKENS } from '../theme/tokens';
import type { AppReleaseInfo, ReleasePlatform } from '../types';
import AppInstallCard from '../components/ui/AppInstallCard';
import { canInstall, installApp, installed, mobilePlatform, onInstallChange } from '../offline/install';
import { isAppShell } from '../utils/appShell';
import '../styles/download.css';

const { Paragraph, Text, Title } = Typography;
const { gold, emerald, semantic, text } = TOKENS.color;

/** Kartalar: o'rnatgichli platformalar + iPhone (Safari orqali) + brauzer */
type CardKey = ReleasePlatform | 'ios' | 'web';

const CARD_ICON: Record<CardKey, ReactNode> = {
  win: <WindowsFilled />,
  mac: <AppleFilled />,
  linux: <LinuxOutlined />,
  android: <AndroidFilled />,
  ios: <AppleFilled />,
  web: <GlobalOutlined />,
};

const CARD_LABEL: Record<CardKey, string> = {
  win: 'download.platformWin',
  mac: 'download.platformMac',
  linux: 'download.platformLinux',
  android: 'download.platformAndroid',
  ios: 'download.platformIos',
  web: 'download.platformWeb',
};

const CARD_REQUIREMENT: Record<CardKey, string> = {
  win: 'download.reqWin',
  mac: 'download.reqMac',
  linux: 'download.reqLinux',
  android: 'download.reqAndroid',
  ios: 'download.reqIos',
  web: 'download.reqWeb',
};

/** O'rnatish qadamlari (har biri — 3 ta tarjima kaliti) */
const STEPS: Record<CardKey, readonly [string, string, string]> = {
  win: ['download.winStep1', 'download.winStep2', 'download.winStep3'],
  mac: ['download.genericStep1', 'download.genericStep2', 'download.genericStep3'],
  linux: ['download.genericStep1', 'download.genericStep2', 'download.genericStep3'],
  android: ['download.androidStep1', 'download.androidStep2', 'download.androidStep3'],
  ios: ['download.iosStep1', 'download.iosStep2', 'download.iosStep3'],
  web: ['download.webStep1', 'download.webStep2', 'download.webStep3'],
};

const RELEASE_KEYS: readonly ReleasePlatform[] = ['win', 'mac', 'linux', 'android'];
const isReleaseKey = (key: CardKey): key is ReleasePlatform => (RELEASE_KEYS as readonly string[]).includes(key);

/** «Nima beradi» kartalari: [sarlavha kaliti, tavsif kaliti, ikonka] */
type Feature = readonly [titleKey: string, descKey: string, icon: ReactNode];

const DESKTOP_FEATURES: readonly Feature[] = [
  ['featureWindow', 'featureWindowDesc', <DesktopOutlined key="w" />],
  ['featureOffline', 'featureOfflineDesc', <DisconnectOutlined key="o" />],
  ['featureUpdates', 'featureUpdatesDesc', <SyncOutlined key="u" />],
  ['featureGuard', 'featureGuardDesc', <SafetyCertificateOutlined key="g" />],
];

/** Telefonda desktop afzalliklari (ish stoli, yopilish) mos emas — o'zinikini ko'rsatamiz */
const ANDROID_FEATURES: readonly Feature[] = [
  ['featureHome', 'featureHomeDesc', <MobileOutlined key="h" />],
  ['featureOffline', 'featureOfflineDesc', <DisconnectOutlined key="o" />],
  ['featureAlwaysNew', 'featureAlwaysNewDesc', <SyncOutlined key="n" />],
  ['featureLight', 'featureLightDesc', <ThunderboltOutlined key="l" />],
];

/**
 * Brauzer qaysi qurilmada ishlayotganini taxmin qiladi.
 *
 * `userAgentData.platform` — zamonaviy va aniq yo'l; `userAgent` esa zaxira
 * (Safari va eski brauzerlarda birinchisi yo'q). Taxmin XATO bo'lsa ham
 * yomon narsa bo'lmaydi: barcha qurilmalar kartalari baribir pastda turadi,
 * shunchaki katta tugma boshqa platformani ko'rsatgan bo'ladi.
 */
const detectDevice = (): CardKey => {
  // Android telefonga — APK; iPhone/iPad uchun alohida ilova yo'q (Safari → bosh ekran)
  const mobile = mobilePlatform(navigator.userAgent, navigator.maxTouchPoints);
  if (mobile) return mobile;
  const uaData = (navigator as { userAgentData?: { platform?: string } }).userAgentData;
  const raw = `${uaData?.platform ?? ''} ${navigator.userAgent}`.toLowerCase();
  if (raw.includes('mac')) return 'mac';
  if (raw.includes('linux')) return 'linux';
  return 'win';
};

/** Landing'dagi platforma tugmalari: /download#windows, /download#android */
const HASH_DEVICE: Record<string, CardKey> = {
  windows: 'win',
  win: 'win',
  mac: 'mac',
  macos: 'mac',
  linux: 'linux',
  android: 'android',
  ios: 'ios',
  iphone: 'ios',
  web: 'web',
  browser: 'web',
};

/** Baytni odam o'qiydigan ko'rinishga (MB) aylantiradi */
const formatSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
};

/**
 * DASTURNI YUKLAB OLISH — yagona manzil.
 *
 * Sahifa AUTENTIFIKATSIYASIZ ochiladi: klub xodimi yangi kompyuterga dasturni
 * o'rnatishi uchun avval tizimga kirishi shart emas (va odatda kira ham
 * olmaydi — brauzer yangi mashinada bo'sh).
 *
 * Tuzilishi: yuqorida — aniqlangan qurilma uchun BITTA katta tugma; pastda —
 * barcha qurilmalar kartalari (telefon uchun QR-kod bilan), tanlangan
 * qurilmaning 3 qadamli yo'riqnomasi, afzalliklar va versiya ma'lumoti.
 *
 * Desktop qobiq ICHIDA ochilganda yuklab olish tugmasi o'rniga joriy versiya
 * va avtomatik yangilanish holati ko'rsatiladi — aks holda foydalanuvchi o'zi
 * ishlatib turgan dasturni qayta yuklab olib, ustidan o'rnatishga urinardi.
 */
const Download = () => {
  const { t, i18n } = useTranslation();
  const { message } = App.useApp();
  const { lang, setLang } = useAppSettings();
  useDocumentHead('download.metaTitle', 'download.metaDesc');

  const [releases, setReleases] = useState<AppReleaseInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [update, setUpdate] = useState<DesktopUpdateStatus>({ state: 'idle' });
  const [, rerender] = useState(0);

  const inDesktop = isDesktop();
  const bridge = desktopBridge();
  const onPhone = mobilePlatform(navigator.userAgent, navigator.maxTouchPoints) !== null;
  const detected = useMemo(() => detectDevice(), []);
  const fromHash = useMemo(() => HASH_DEVICE[window.location.hash.replace('#', '').toLowerCase()], []);
  const [stepsFor, setStepsFor] = useState<CardKey>(fromHash ?? detected);
  // Sahifa autentifikatsiyasiz ham ochiladi — shuning uchun `user` bo'lmasligi normal
  const { user } = useAuth();
  const isSuperadmin = user?.role === 'superadmin';
  const inApp = installed() || isAppShell();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await publicApi.releases();
      setReleases(res.data ?? []);
    } catch (err) {
      setError(errorMessage(err, t('download.loadError')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  /* Desktop qobiqdagi yangilanish holatiga obuna */
  useEffect(() => {
    if (!bridge?.onUpdateStatus) return;
    return bridge.onUpdateStatus(setUpdate);
  }, [bridge]);

  /* Brauzer "o'rnatish" taklifi keyinroq kelishi mumkin — tugma shunda paydo bo'ladi */
  useEffect(() => onInstallChange(() => rerender((n) => n + 1)), []);

  /* /download#android kabi havola — o'sha karta ko'rinadigan joyga */
  useEffect(() => {
    if (!fromHash || loading) return;
    document.getElementById(`dl-${fromHash}`)?.scrollIntoView({ block: 'center' });
  }, [fromHash, loading]);

  const byPlatform = useMemo(() => {
    const map: Partial<Record<ReleasePlatform, AppReleaseInfo>> = {};
    for (const r of releases ?? []) map[r.platform] = r;
    return map;
  }, [releases]);

  /* Asosiy platformalar doim ko'rinadi; macOS/Linux — faqat o'rnatgichi bo'lsa */
  const cards: CardKey[] = [
    'win',
    ...(byPlatform.mac ? (['mac'] as const) : []),
    ...(byPlatform.linux ? (['linux'] as const) : []),
    'android',
    'ios',
    'web',
  ];
  // macOS/Linux o'rnatgichi bo'lmasa — brauzer versiyasi (u yerda ham to'liq ishlaydi)
  const mine: CardKey = cards.includes(detected) ? detected : 'web';
  const stepsKey: CardKey = cards.includes(stepsFor) ? stepsFor : mine;
  const heroRelease = isReleaseKey(mine) ? byPlatform[mine] : undefined;
  const infoRelease = heroRelease ?? releases?.[0];
  const label = (key: CardKey) => t(CARD_LABEL[key]);

  const notesFor = (r: AppReleaseInfo): string | null =>
    (i18n.language === 'ru' ? r.notesRu : r.notesUz) || r.notesUz || r.notesRu;

  const metaFor = (r: AppReleaseInfo) =>
    [
      t('download.version', { version: r.version }),
      formatSize(r.size),
      r.publishedAt ? dayjs(r.publishedAt).format('DD.MM.YYYY') : null,
    ]
      .filter(Boolean)
      .join(' · ');

  const absolute = (url: string) => new URL(url, window.location.origin).href;

  const copyChecksum = (value: string) => {
    // Eski/cheklangan muhitlarda clipboard API bo'lmasligi mumkin — bunda
    // jimgina hech narsa qilmaymiz (nazorat summasi baribir ekranda ko'rinib turadi)
    void navigator.clipboard?.writeText(value).then(
      () => message.success(t('download.copied')),
      () => undefined,
    );
  };

  const showSteps = (key: CardKey) => {
    setStepsFor(key);
    document.getElementById('dl-install')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const installPwa = () =>
    void installApp().catch(() =>
      message.error(
        lang === 'ru' ? 'Повторите установку через меню браузера.' : 'Brauzer menyusi orqali o‘rnatishni qayta urinib ko‘ring.',
      ),
    );

  /* -------------------------------- Desktop ichidagi yangilanish kartasi */

  const renderUpdateState = () => {
    switch (update.state) {
      case 'checking':
        return (
          <Text style={{ color: text.secondary }}>
            <SyncOutlined spin /> {t('download.checkUpdates')}…
          </Text>
        );
      case 'available':
        return (
          <Text style={{ color: gold.base }}>
            {t('download.updateAvailable', { version: update.version ?? '' })}
          </Text>
        );
      case 'downloading':
        return (
          <div>
            <Text style={{ color: text.secondary }}>
              {t('download.updateDownloading', { percent: Math.round(update.percent ?? 0) })}
            </Text>
            <Progress percent={Math.round(update.percent ?? 0)} showInfo={false} />
          </div>
        );
      case 'ready':
        return (
          <Space direction="vertical" size={10}>
            <Text style={{ color: semantic.success }}>
              <CheckCircleOutlined /> {t('download.updateReady')}
            </Text>
            <Button type="primary" onClick={() => bridge?.quitAndInstall?.()}>
              {t('download.restartNow')}
            </Button>
          </Space>
        );
      case 'uptodate':
        return (
          <Text style={{ color: semantic.success }}>
            <CheckCircleOutlined /> {t('download.upToDate')}
          </Text>
        );
      case 'error':
        return (
          <Text style={{ color: semantic.warning }}>
            <ExclamationCircleOutlined /> {update.message}
          </Text>
        );
      default:
        return null;
    }
  };

  const renderDesktopCard = () => (
    <GlassCard style={{ padding: 24, marginTop: 28 }}>
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        <Space size={12} align="center">
          <DesktopOutlined style={{ fontSize: 26, color: emerald.bright }} />
          <Title level={4} style={{ margin: 0 }}>
            {t('download.alreadyDesktop')}
          </Title>
        </Space>
        <Paragraph style={{ color: text.secondary, margin: 0 }}>
          {t('download.alreadyDesktopDesc', { version: bridge?.version ?? '—' })}
        </Paragraph>

        {renderUpdateState()}

        {bridge?.checkForUpdates && update.state !== 'ready' && (
          <Button
            icon={<ReloadOutlined />}
            loading={update.state === 'checking' || update.state === 'downloading'}
            onClick={() => bridge.checkForUpdates?.()}
          >
            {t('download.checkUpdates')}
          </Button>
        )}
      </Space>
    </GlassCard>
  );

  /* ------------------------------------------------ Yuqoridagi asosiy tugma */

  const renderHeroAction = () => {
    if (inDesktop) return renderDesktopCard();
    let action: ReactNode;
    let meta: ReactNode = null;
    if (heroRelease) {
      action = (
        // Oddiy havola: brauzer faylni o'zi yuklaydi, XHR ham, blob ham kerak
        // emas — 200 MB ni xotiraga o'qish shart emas va uzilgan yuklashni
        // brauzer o'zi davom ettiradi.
        <Button type="primary" size="large" icon={<CloudDownloadOutlined />} href={heroRelease.url}>
          {t('download.downloadFor', { platform: label(mine) })}
        </Button>
      );
      meta = metaFor(heroRelease);
    } else if (mine === 'ios') {
      action = (
        <Button type="primary" size="large" icon={<AppleFilled />} onClick={() => showSteps('ios')}>
          {t('download.installIos')}
        </Button>
      );
      meta = t('download.reqIos');
    } else {
      action = (
        <Link to="/login">
          <Button type="primary" size="large" icon={<GlobalOutlined />} loading={loading}>
            {t('download.openApp')}
          </Button>
        </Link>
      );
      meta = loading ? null : t('download.soonHint');
    }
    return (
      <>
        <div className="dl-cta">
          {action}
          <a className="dl-cta__more" href="#dl-devices">
            {t('download.otherDevices')} <ArrowDownOutlined />
          </a>
        </div>
        {meta && <p className="dl-cta__meta">{meta}</p>}
      </>
    );
  };

  /* -------------------------------------------------- Qurilma kartalari */

  const renderCard = (key: CardKey) => {
    const release = isReleaseKey(key) ? byPlatform[key] : undefined;
    let body: ReactNode;
    if (isReleaseKey(key)) {
      body = release ? (
        <>
          <p className="dl-card__meta">{metaFor(release)}</p>
          <div className="dl-card__actions">
            <Button type={key === mine ? 'primary' : 'default'} icon={<CloudDownloadOutlined />} href={release.url} block>
              {t('download.download')}
            </Button>
          </div>
          {/* Kompyuterdan telefonga: APK havolasi QR-kodda — kamera bilan darhol yuklanadi */}
          {key === 'android' && !onPhone && (
            <div className="dl-qr">
              <QRCode value={absolute(release.url)} size={96} bordered={false} color="#17140f" bgColor="#fffdf9" />
              <span>{t('download.scanAndroid')}</span>
            </div>
          )}
        </>
      ) : (
        <>
          <span className="dl-card__soon">{loading ? '…' : t('download.soon')}</span>
          {!loading && <p className="dl-card__hint">{t('download.soonHint')}</p>}
        </>
      );
    } else if (key === 'ios') {
      body = onPhone ? (
        <div className="dl-card__actions">
          <Button type={key === mine ? 'primary' : 'default'} block onClick={() => showSteps('ios')}>
            {t('download.installIos')}
          </Button>
        </div>
      ) : (
        <div className="dl-qr">
          <QRCode value={absolute('/login')} size={96} bordered={false} color="#17140f" bgColor="#fffdf9" />
          <span>{t('download.scanIos')}</span>
        </div>
      );
    } else {
      body = (
        <div className="dl-card__actions">
          <Link to="/login">
            <Button type={key === mine ? 'primary' : 'default'} icon={<ArrowRightOutlined />} iconPosition="end" block>
              {t('download.openApp')}
            </Button>
          </Link>
          {canInstall() && !inApp && (
            <Button icon={<CloudDownloadOutlined />} block onClick={installPwa}>
              {t('download.webInstall')}
            </Button>
          )}
        </div>
      );
    }

    return (
      <article key={key} id={`dl-${key}`} className={`dl-card${key === mine ? ' is-mine' : ''}`}>
        {key === mine && <span className="dl-card__badge">{t('download.yourDevice')}</span>}
        <div className="dl-card__head">
          <span className={`dl-card__icon is-${key}`} aria-hidden>
            {CARD_ICON[key]}
          </span>
          <div>
            <h3 className="dl-card__name">{label(key)}</h3>
            <p className="dl-card__req">{t(CARD_REQUIREMENT[key])}</p>
          </div>
        </div>
        {body}
        <button type="button" className="dl-card__how" onClick={() => showSteps(key)}>
          {t('download.stepsTitle')} <ArrowRightOutlined />
        </button>
      </article>
    );
  };

  const features = mine === 'android' || mine === 'ios' ? ANDROID_FEATURES : DESKTOP_FEATURES;
  const notes = infoRelease ? notesFor(infoRelease) : null;

  /* --------------------------------------------------------------- Chiqish */

  return (
    <PageTransition>
      <div className="dl-page">
        <div className="dl-wrap">
          <header className="dl-header">
            <Link to="/" aria-label="Billiard Club">
              <BrandLogo size={36} withWordmark />
            </Link>
            <div className="dl-header__actions">
              <Segmented
                size="small"
                aria-label="Til / Язык"
                value={lang}
                onChange={(value) => setLang(value as 'uz' | 'ru')}
                options={[
                  { label: "O'z", value: 'uz' },
                  { label: 'Ру', value: 'ru' },
                ]}
              />
              <ThemeToggle />
              <Link to="/" className="dl-header__home">
                {t('download.backHome')}
              </Link>
            </div>
          </header>

          {/* ------------------------------------------------------------ Hero */}
          <section className="dl-hero">
            <div className="dl-hero__copy">
              <span className="dl-eyebrow">{t('download.eyebrow')}</span>
              <h1 className="dl-hero__title">{t('download.title')}</h1>
              <p className="dl-hero__lead">{t('download.subtitle')}</p>
              {renderHeroAction()}
              <ul className="dl-chips">
                <li>
                  <CheckCircleOutlined /> {t('download.chipFree')}
                </li>
                <li>
                  <SyncOutlined /> {t('download.chipUpdates')}
                </li>
                <li>
                  <DisconnectOutlined /> {t('download.chipOffline')}
                </li>
                <li>
                  <MobileOutlined /> {t('download.chipOneAccount')}
                </li>
              </ul>
            </div>

            {/* Bezak: noutbukda stollar paneli, telefonda jonli taymer */}
            <div className="dl-devices" aria-hidden>
              <div className="dl-laptop">
                <div className="dl-laptop__screen">
                  <div className="dl-ui">
                    <div className="dl-ui__side">
                      <b />
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                    <div className="dl-ui__main">
                      <div className="dl-ui__kpis">
                        <span />
                        <span />
                        <span />
                      </div>
                      <div className="dl-ui__tables">
                        <span className="is-on" />
                        <span className="is-on" />
                        <span />
                        <span className="is-on" />
                        <span />
                        <span className="is-on" />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="dl-laptop__base" />
              </div>
              <div className="dl-phone">
                <div className="dl-phone__screen">
                  <div className="dl-phone__table">
                    <em>7</em>
                    <strong>01:12:19</strong>
                    <small>36 158</small>
                  </div>
                  <div className="dl-phone__btn" />
                  <div className="dl-phone__row" />
                  <div className="dl-phone__row is-short" />
                </div>
              </div>
            </div>
          </section>

          {/* ------------------------------------------------ Qurilmalar */}
          <section id="dl-devices" className="dl-section">
            <div className="dl-section__head">
              <div>
                <h2 className="dl-section__title">{t('download.chooseTitle')}</h2>
                <p className="dl-section__sub">{t('download.chooseSubtitle')}</p>
              </div>
            </div>

            {!loading && error && (
              <Alert
                className="dl-alert"
                type="warning"
                showIcon
                message={error}
                action={
                  <Button size="small" icon={<ReloadOutlined />} onClick={() => void load()}>
                    {t('download.retry')}
                  </Button>
                }
              />
            )}

            {/* Platforma egasi bo'sh sahifani O'ZI to'ldira oladi — qayerdan boshlashni ko'rsatamiz */}
            {!loading && !error && isSuperadmin && releases?.length === 0 && (
              <Alert
                className="dl-alert"
                type="info"
                showIcon
                message={t('download.emptyAdmin')}
                description={t('download.emptyAdminHint')}
                action={
                  <Link to="/admin/releases">
                    <Button size="small" type="primary">
                      {t('download.goToReleases')}
                    </Button>
                  </Link>
                }
              />
            )}

            <div className="dl-cards">{cards.map(renderCard)}</div>
          </section>

          {/* ------------------------------------------------ 3 qadam */}
          <section id="dl-install" className="dl-section">
            <div className="dl-section__head">
              <div>
                <h2 className="dl-section__title">{t('download.stepsTitle')}</h2>
                <p className="dl-section__sub">{t('download.stepsSubtitle')}</p>
              </div>
              <Segmented<CardKey>
                className="dl-steps-switch"
                value={stepsKey}
                onChange={setStepsFor}
                options={cards.map((key) => ({ value: key, label: label(key) }))}
              />
            </div>
            <ol className="dl-steps">
              {STEPS[stepsKey].map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ol>
            {stepsKey === 'android' && <p className="dl-note">{t('download.trustPlayProtect')}</p>}
          </section>

          {/* ------------------------------------------------ Afzalliklar */}
          <section className="dl-section">
            <div className="dl-section__head">
              <h2 className="dl-section__title">
                {t(features === ANDROID_FEATURES ? 'download.featuresTitleAndroid' : 'download.featuresTitle')}
              </h2>
            </div>
            <div className="dl-features">
              {features.map(([titleKey, descKey, icon]) => (
                <div className="dl-feature" key={titleKey}>
                  <span className="dl-feature__icon" aria-hidden>
                    {icon}
                  </span>
                  <h3>{t(`download.${titleKey}`)}</h3>
                  <p>{t(`download.${descKey}`)}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ------------------------------------------------ Versiya va xavfsizlik */}
          {!inDesktop && infoRelease && (
            <section className="dl-section">
              <div className="dl-section__head">
                <h2 className="dl-section__title">{t('download.infoTitle')}</h2>
              </div>
              <div className="dl-info">
                {notes && (
                  <div className="dl-panel">
                    <h3>{t('download.whatsNew')}</h3>
                    <p className="dl-panel__meta">
                      {label(infoRelease.platform)} · {metaFor(infoRelease)}
                    </p>
                    <p className="dl-panel__notes">{notes}</p>
                  </div>
                )}
                <div className="dl-panel">
                  <h3>
                    <SafetyCertificateOutlined /> {t('download.trustTitle')}
                  </h3>
                  <p>{t('download.trustSigned')}</p>
                  {infoRelease.platform === 'win' && <p>{t('download.trustSmartScreen')}</p>}
                  {infoRelease.platform === 'android' && <p>{t('download.trustPlayProtect')}</p>}
                  <details className="dl-checksum">
                    <summary>{t('download.checksumShow')}</summary>
                    <div>
                      {/* Bitta blok: inline <code> telefonda har satrni alohida "quti"ga bo'lardi */}
                      <code>{infoRelease.sha512}</code>
                      <Button
                        size="small"
                        type="text"
                        icon={<CopyOutlined />}
                        onClick={() => copyChecksum(infoRelease.sha512)}
                        aria-label={t('download.trustChecksum')}
                      />
                    </div>
                  </details>
                </div>
              </div>
            </section>
          )}

          {/* Tizimga kirgan xodim uchun: shu qurilma oflayn ishlashga tayyormi */}
          {(user || inApp) && (
            <section className="dl-section">
              <div className="dl-section__head">
                <h2 className="dl-section__title">{t('download.deviceStatusTitle')}</h2>
              </div>
              <AppInstallCard />
            </section>
          )}
        </div>
      </div>
    </PageTransition>
  );
};

export default Download;
