import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { App, Button, Col, Progress, Row, Space, Spin, Tag, Typography } from 'antd';
import {
  AppleOutlined,
  CheckCircleOutlined,
  CloudDownloadOutlined,
  CopyOutlined,
  DesktopOutlined,
  DisconnectOutlined,
  ExclamationCircleOutlined,
  LinuxOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SyncOutlined,
  WindowsOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { errorMessage, publicApi } from '../api';
import { AnimatedBackground, BrandLogo, GlassCard, PageTransition } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { desktopBridge, isDesktop, type DesktopUpdateStatus } from '../offline/desktop';
import { useDocumentHead } from '../hooks/useDocumentHead';
import { TOKENS } from '../theme/tokens';
import type { AppReleaseInfo, ReleasePlatform } from '../types';

const { Paragraph, Text, Title } = Typography;
const { gold, emerald, semantic, text } = TOKENS.color;

const PAGE_BG = [
  `radial-gradient(ellipse at 20% 10%, color-mix(in srgb, ${emerald.felt} 45%, transparent), transparent 55%)`,
  `radial-gradient(ellipse at 80% 90%, ${gold.subtle}, transparent 50%)`,
].join(', ');

const PLATFORM_ICON: Record<ReleasePlatform, typeof WindowsOutlined> = {
  win: WindowsOutlined,
  mac: AppleOutlined,
  linux: LinuxOutlined,
};

const PLATFORM_LABEL: Record<ReleasePlatform, string> = {
  win: 'download.platformWin',
  mac: 'download.platformMac',
  linux: 'download.platformLinux',
};

const REQUIREMENT_KEY: Record<ReleasePlatform, string> = {
  win: 'download.reqWin',
  mac: 'download.reqMac',
  linux: 'download.reqLinux',
};

/**
 * Brauzer qaysi operatsion tizimda ishlayotganini taxmin qiladi.
 *
 * `userAgentData.platform` — zamonaviy va aniq yo'l; `userAgent` esa zaxira
 * (Safari va eski brauzerlarda birinchisi yo'q). Taxmin XATO bo'lsa ham
 * yomon narsa bo'lmaydi: boshqa tizimlar ro'yxati baribir pastda turadi,
 * shunchaki katta tugma boshqa platformani ko'rsatgan bo'ladi.
 */
const detectPlatform = (): ReleasePlatform => {
  const uaData = (navigator as { userAgentData?: { platform?: string } }).userAgentData;
  const raw = `${uaData?.platform ?? ''} ${navigator.userAgent}`.toLowerCase();
  if (raw.includes('mac')) return 'mac';
  if (raw.includes('linux') || raw.includes('android')) return 'linux';
  return 'win';
};

/** Baytni odam o'qiydigan ko'rinishga (MB) aylantiradi */
const formatSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
};

/**
 * DESKTOP DASTURNI YUKLAB OLISH — yagona manzil.
 *
 * Sahifa AUTENTIFIKATSIYASIZ ochiladi: klub xodimi yangi kompyuterga dasturni
 * o'rnatishi uchun avval tizimga kirishi shart emas (va odatda kira ham
 * olmaydi — brauzer yangi mashinada bo'sh).
 *
 * Desktop qobiq ICHIDA ochilganda sahifa o'zgaradi: yuklab olish tugmasi
 * o'rniga joriy versiya va avtomatik yangilanish holati ko'rsatiladi.
 * Aks holda foydalanuvchi o'zi ishlatib turgan dasturni qayta yuklab olib,
 * ustidan o'rnatishga urinardi.
 */
const Download = () => {
  const { t, i18n } = useTranslation();
  const { message } = App.useApp();
  useDocumentHead('download.metaTitle', 'download.metaDesc');

  const [releases, setReleases] = useState<AppReleaseInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [update, setUpdate] = useState<DesktopUpdateStatus>({ state: 'idle' });

  const inDesktop = isDesktop();
  const bridge = desktopBridge();
  const detected = useMemo(detectPlatform, []);
  // Sahifa autentifikatsiyasiz ham ochiladi — shuning uchun `user` bo'lmasligi normal
  const { user } = useAuth();
  const isSuperadmin = user?.role === 'superadmin';

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

  const primary = releases?.find((r) => r.platform === detected) ?? null;
  const others = (releases ?? []).filter((r) => r.platform !== primary?.platform);

  const notesFor = (r: AppReleaseInfo): string | null =>
    (i18n.language === 'ru' ? r.notesRu : r.notesUz) || r.notesUz || r.notesRu;

  const copyChecksum = (value: string) => {
    // Eski/cheklangan muhitlarda clipboard API bo'lmasligi mumkin — bunda
    // jimgina hech narsa qilmaymiz (nazorat summasi baribir ekranda ko'rinib turadi)
    void navigator.clipboard?.writeText(value).then(
      () => message.success(t('download.copied')),
      () => undefined,
    );
  };

  /* ------------------------------------------------ Yuklab olish kartasi */

  const renderPrimary = (r: AppReleaseInfo) => {
    const Icon = PLATFORM_ICON[r.platform];
    return (
      <GlassCard style={{ padding: 28 }}>
        <Space direction="vertical" size={18} style={{ width: '100%' }}>
          <Space size={14} align="center">
            <Icon style={{ fontSize: 34, color: gold.base }} />
            <div>
              <Title level={4} style={{ margin: 0, color: text.primary }}>
                {t(PLATFORM_LABEL[r.platform])}
              </Title>
              <Text style={{ color: text.tertiary, fontSize: 13 }}>
                {t(REQUIREMENT_KEY[r.platform])}
              </Text>
            </div>
          </Space>

          <Button
            type="primary"
            size="large"
            icon={<CloudDownloadOutlined />}
            // Oddiy havola: brauzer faylni o'zi yuklaydi, XHR ham, blob ham
            // kerak emas — 200 MB ni xotiraga o'qish shart emas va uzilgan
            // yuklashni brauzer o'zi davom ettiradi.
            href={r.url}
            block
            style={{ height: 52, fontSize: 16, fontWeight: 600 }}
          >
            {t('download.downloadFor', { platform: t(PLATFORM_LABEL[r.platform]) })}
          </Button>

          <Space size={[16, 6]} wrap>
            <Tag color="gold">{t('download.version', { version: r.version })}</Tag>
            <Text style={{ color: text.secondary, fontSize: 13 }}>
              {t('download.size', { size: formatSize(r.size) })}
            </Text>
            {r.publishedAt && (
              <Text style={{ color: text.secondary, fontSize: 13 }}>
                {t('download.published', { date: dayjs(r.publishedAt).format('DD.MM.YYYY') })}
              </Text>
            )}
          </Space>
        </Space>
      </GlassCard>
    );
  };

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
    <GlassCard style={{ padding: 28 }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Space size={14} align="center">
          <DesktopOutlined style={{ fontSize: 30, color: emerald.bright }} />
          <Title level={4} style={{ margin: 0, color: text.primary }}>
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

  /* --------------------------------------------------------------- Chiqish */

  const sectionTitle: CSSProperties = {
    color: text.primary,
    fontSize: 15,
    fontWeight: 600,
    marginBottom: 12,
  };

  return (
    <PageTransition>
      <div style={{ minHeight: '100vh', background: PAGE_BG, padding: '28px 16px 64px' }}>
        <AnimatedBackground />

        <div style={{ maxWidth: 940, margin: '0 auto', position: 'relative' }}>
          <Space
            style={{ width: '100%', justifyContent: 'space-between', marginBottom: 36 }}
            align="center"
          >
            <Link to="/" aria-label="Billiard Club">
              <BrandLogo />
            </Link>
            <Link to="/">
              <Button type="text" style={{ color: text.secondary }}>
                {t('download.backHome')}
              </Button>
            </Link>
          </Space>

          <Title level={2} style={{ color: text.primary, marginBottom: 8 }}>
            {t('download.title')}
          </Title>
          <Paragraph style={{ color: text.secondary, fontSize: 15, maxWidth: 620 }}>
            {t('download.subtitle')}
          </Paragraph>

          {loading && (
            <div style={{ textAlign: 'center', padding: 48 }}>
              <Spin size="large" />
            </div>
          )}

          {!loading && error && (
            <GlassCard style={{ padding: 24, textAlign: 'center' }}>
              <Space direction="vertical" size={12}>
                <DisconnectOutlined style={{ fontSize: 28, color: semantic.warning }} />
                <Text style={{ color: text.secondary }}>{error}</Text>
                <Button icon={<ReloadOutlined />} onClick={() => void load()}>
                  {t('download.retry')}
                </Button>
              </Space>
            </GlassCard>
          )}

          {!loading && !error && (
            <Space direction="vertical" size={22} style={{ width: '100%' }}>
              {inDesktop && renderDesktopCard()}

              {!inDesktop && primary && renderPrimary(primary)}

              {/* Bo'sh holat IKKI XIL: oddiy mehmon "kutib turing" ni ko'radi,
                  platforma egasi esa buni O'ZI hal qila olishini va qayerdan
                  boshlashni ko'radi — aks holda sahifa boshi berk ko'chaga
                  o'xshab qolardi. */}
              {!inDesktop && !primary && releases?.length === 0 && (
                <GlassCard style={{ padding: 28, textAlign: 'center' }}>
                  <Space direction="vertical" size={8}>
                    <Text style={{ color: text.primary, fontSize: 16 }}>
                      {isSuperadmin ? t('download.emptyAdmin') : t('download.empty')}
                    </Text>
                    <Text style={{ color: text.tertiary }}>
                      {isSuperadmin ? t('download.emptyAdminHint') : t('download.emptyHint')}
                    </Text>
                    <Link to={isSuperadmin ? '/admin/releases' : '/login'}>
                      <Button type="primary" style={{ marginTop: 8 }}>
                        {isSuperadmin ? t('download.goToReleases') : t('download.openApp')}
                      </Button>
                    </Link>
                  </Space>
                </GlassCard>
              )}

              {/* Detektsiya xato bo'lsa ham qolgan platformalar qo'lda tanlanadi */}
              {!inDesktop && others.length > 0 && (
                <div>
                  <div style={sectionTitle}>{t('download.otherPlatforms')}</div>
                  <Row gutter={[12, 12]}>
                    {others.map((r) => {
                      const Icon = PLATFORM_ICON[r.platform];
                      return (
                        <Col xs={24} sm={12} key={r.platform}>
                          <GlassCard style={{ padding: 16 }}>
                            <Space
                              style={{ width: '100%', justifyContent: 'space-between' }}
                              align="center"
                            >
                              <Space size={10}>
                                <Icon style={{ fontSize: 20, color: text.secondary }} />
                                <div>
                                  <div style={{ color: text.primary, fontSize: 14 }}>
                                    {t(PLATFORM_LABEL[r.platform])}
                                  </div>
                                  <div style={{ color: text.tertiary, fontSize: 12 }}>
                                    {r.version} · {formatSize(r.size)}
                                  </div>
                                </div>
                              </Space>
                              <Button
                                size="small"
                                icon={<CloudDownloadOutlined />}
                                href={r.url}
                                aria-label={t('download.downloadFor', {
                                  platform: t(PLATFORM_LABEL[r.platform]),
                                })}
                              />
                            </Space>
                          </GlassCard>
                        </Col>
                      );
                    })}
                  </Row>
                </div>
              )}

              {/* O'zgarishlar ro'yxati */}
              {primary && notesFor(primary) && (
                <GlassCard style={{ padding: 20 }}>
                  <div style={sectionTitle}>{t('download.whatsNew')}</div>
                  <Paragraph
                    style={{ color: text.secondary, margin: 0, whiteSpace: 'pre-line' }}
                  >
                    {notesFor(primary)}
                  </Paragraph>
                </GlassCard>
              )}

              {/* Ishonch bloki — faqat haqiqiy yuklab olish bo'lganda ma'noli */}
              {!inDesktop && primary && (
                <GlassCard style={{ padding: 20 }}>
                  <div style={sectionTitle}>
                    <SafetyCertificateOutlined style={{ color: emerald.bright, marginRight: 8 }} />
                    {t('download.trustTitle')}
                  </div>
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <Text style={{ color: text.secondary, fontSize: 13 }}>
                      {t('download.trustSigned')}
                    </Text>
                    {primary.platform === 'win' && (
                      <Text style={{ color: text.secondary, fontSize: 13 }}>
                        {t('download.trustSmartScreen')}
                      </Text>
                    )}
                    <div>
                      <Text style={{ color: text.tertiary, fontSize: 12 }}>
                        {t('download.trustChecksum')}
                      </Text>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          marginTop: 4,
                        }}
                      >
                        <Text
                          code
                          style={{
                            fontSize: 11,
                            wordBreak: 'break-all',
                            color: text.secondary,
                          }}
                        >
                          {primary.sha512}
                        </Text>
                        <Button
                          size="small"
                          type="text"
                          icon={<CopyOutlined />}
                          onClick={() => copyChecksum(primary.sha512)}
                          aria-label={t('download.trustChecksum')}
                        />
                      </div>
                    </div>
                  </Space>
                </GlassCard>
              )}

              {/* Nima beradi */}
              <div>
                <div style={sectionTitle}>{t('download.featuresTitle')}</div>
                <Row gutter={[12, 12]}>
                  {(
                    [
                      ['featureWindow', 'featureWindowDesc', DesktopOutlined],
                      ['featureOffline', 'featureOfflineDesc', DisconnectOutlined],
                      ['featureUpdates', 'featureUpdatesDesc', SyncOutlined],
                      ['featureGuard', 'featureGuardDesc', SafetyCertificateOutlined],
                    ] as const
                  ).map(([titleKey, descKey, Icon]) => (
                    <Col xs={24} sm={12} key={titleKey}>
                      <GlassCard style={{ padding: 16, height: '100%' }}>
                        <Space align="start" size={12}>
                          <Icon style={{ fontSize: 18, color: emerald.bright, marginTop: 2 }} />
                          <div>
                            <div style={{ color: text.primary, fontSize: 14, fontWeight: 600 }}>
                              {t(`download.${titleKey}`)}
                            </div>
                            <div style={{ color: text.tertiary, fontSize: 13, marginTop: 2 }}>
                              {t(`download.${descKey}`)}
                            </div>
                          </div>
                        </Space>
                      </GlassCard>
                    </Col>
                  ))}
                </Row>
              </div>
            </Space>
          )}
        </div>
      </div>
    </PageTransition>
  );
};

export default Download;
