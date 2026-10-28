import { useEffect, useState, type ReactNode } from 'react';
import { Button } from 'antd';
import {
  ApiOutlined,
  ArrowRightOutlined,
  BulbFilled,
  CheckCircleFilled,
  CloudSyncOutlined,
  DesktopOutlined,
  DisconnectOutlined,
  WifiOutlined,
} from '@ant-design/icons';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { fadeUp, stagger } from './shared';

/**
 * Raqobatchilardan ajratib turuvchi uch imkoniyat — har biri jonli
 * mini-illyustratsiya bilan: chiroqni avtomatik boshqarish, oflayn rejim
 * va har qanday qurilmada ishlash.
 */

/** Avtomatik almashuvchi holat — `reduce` rejimida to'xtaydi (statik ko'rinish) */
const useCycle = (periodMs: number, paused: boolean): boolean => {
  const [on, setOn] = useState(true);
  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => setOn((v) => !v), periodMs);
    return () => window.clearInterval(id);
  }, [periodMs, paused]);
  return on;
};

const Bullet = ({ children }: { children: ReactNode }) => (
  <li>
    <CheckCircleFilled aria-hidden />
    <span>{children}</span>
  </li>
);

/* --------------------------------------------------- Chiroq illyustratsiyasi */

const LightDemo = () => {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const [manual, setManual] = useState<boolean | null>(null);
  const auto = useCycle(3600, !!reduce || manual !== null);
  const on = manual ?? auto;

  return (
    <div className={`lp-light-demo${on ? ' is-on' : ''}`}>
      <div className="lp-light-demo__lamp" aria-hidden>
        <span className="lp-light-demo__cord" />
        <span className="lp-light-demo__shade" />
        <span className="lp-light-demo__beam" />
      </div>
      <div className="lp-light-demo__table" aria-hidden>
        <span className="lp-light-demo__felt">
          <i className="b1" />
          <i className="b2" />
          <i className="b3" />
          <i className="cue" />
        </span>
      </div>
      <div className="lp-light-demo__panel">
        <div className="lp-light-demo__state">
          <BulbFilled aria-hidden />
          <div>
            <strong>{t('common.table')} 3</strong>
            <span>{on ? t('landing.lightsDemoOn') : t('landing.lightsDemoOff')}</span>
          </div>
        </div>
        <button type="button" className="lp-light-demo__btn" onClick={() => setManual(!on)}>
          {on ? t('landing.lightsDemoEnd') : t('landing.lightsDemoStart')}
        </button>
      </div>
      <ul className="lp-light-demo__log" aria-live="polite">
        <li>
          <time>19:42:05</time> {on ? t('landing.lightsLogStart') : t('landing.lightsLogEnd')}
        </li>
        <li>
          <time>19:42:05</time> {on ? t('landing.lightsLogOn') : t('landing.lightsLogOff')}
        </li>
      </ul>
    </div>
  );
};

/* --------------------------------------------------- Oflayn illyustratsiyasi */

const OfflineDemo = () => {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const online = useCycle(4200, !!reduce);
  const items = ['offlineQ1', 'offlineQ2', 'offlineQ3'];

  return (
    <div className={`lp-offline-demo${online ? ' is-online' : ''}`}>
      <div className="lp-offline-demo__status">
        {online ? <WifiOutlined aria-hidden /> : <DisconnectOutlined aria-hidden />}
        <strong>{online ? t('landing.offlineOnline') : t('landing.offlineOffline')}</strong>
        <span>{online ? t('landing.offlineSynced') : t('landing.offlineQueued', { n: items.length })}</span>
      </div>
      <ul className="lp-offline-demo__queue">
        {items.map((k, i) => (
          <li key={k} style={{ transitionDelay: `${online ? i * 0.25 : 0}s` }}>
            <span className="lp-offline-demo__dot" aria-hidden />
            <span>{t(`landing.${k}`)}</span>
            <em>{online ? t('landing.offlineSent') : t('landing.offlineWaiting')}</em>
          </li>
        ))}
      </ul>
      <div className="lp-offline-demo__timer">
        <span>{t('landing.offlineTimer')}</span>
        <strong>01:12:05</strong>
      </div>
    </div>
  );
};

/* ------------------------------------------------ Qurilmalar illyustratsiyasi */

const DevicesDemo = () => (
  <div className="lp-devices-demo" aria-hidden>
    <div className="lp-devices-demo__laptop">
      <div className="lp-devices-demo__screen">
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i} className={i % 3 === 2 ? 'is-free' : i === 4 ? 'is-paused' : 'is-busy'} />
        ))}
      </div>
      <div className="lp-devices-demo__base" />
    </div>
    <div className="lp-devices-demo__phone">
      <div className="lp-devices-demo__phone-screen">
        <i />
        <i />
        <i />
        <i />
      </div>
    </div>
  </div>
);

/* ------------------------------------------------------------------ Bo'lim */

const Highlights = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const rows: {
    id: string;
    icon: ReactNode;
    key: string;
    bullets: string[];
    visual: ReactNode;
    extra?: ReactNode;
  }[] = [
    {
      id: 'lights',
      icon: <BulbFilled />,
      key: 'lights',
      bullets: ['lightsB1', 'lightsB2', 'lightsB3', 'lightsB4'],
      visual: <LightDemo />,
    },
    {
      id: 'offline',
      icon: <CloudSyncOutlined />,
      key: 'offline',
      bullets: ['offlineB1', 'offlineB2', 'offlineB3'],
      visual: <OfflineDemo />,
    },
    {
      id: 'devices',
      icon: <DesktopOutlined />,
      key: 'devices',
      bullets: ['devicesB1', 'devicesB2', 'devicesB3'],
      visual: <DevicesDemo />,
      extra: (
        <Button
          className="lp-outline-btn"
          size="large"
          icon={<ApiOutlined />}
          onClick={() => navigate('/download')}
        >
          {t('landing.devicesCta')} <ArrowRightOutlined />
        </Button>
      ),
    },
  ];

  return (
    <section id="highlights" className="lp-section">
      <div className="lp-container lp-highlights">
        {rows.map((row, index) => (
          <motion.div
            key={row.id}
            id={row.id}
            className={`lp-highlight${index % 2 === 1 ? ' is-reversed' : ''}`}
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.25 }}
          >
            <motion.div className="lp-highlight__text" variants={fadeUp}>
              <span className="lp-highlight__badge">
                {row.icon} {t(`landing.${row.key}Overline`)}
              </span>
              <h2>{t(`landing.${row.key}Title`)}</h2>
              <p>{t(`landing.${row.key}Desc`)}</p>
              <ul className="lp-check-list">
                {row.bullets.map((b) => (
                  <Bullet key={b}>{t(`landing.${b}`)}</Bullet>
                ))}
              </ul>
              {row.extra}
            </motion.div>
            <motion.div className="lp-highlight__visual" variants={fadeUp}>
              {row.visual}
            </motion.div>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

export default Highlights;
