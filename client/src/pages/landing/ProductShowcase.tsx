import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  BarChartOutlined,
  CoffeeOutlined,
  DollarOutlined,
  MinusOutlined,
  MobileOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  TableOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useNow } from '../../components/ui';
import { formatNumber } from '../../utils/format';
import { amountFor, fadeUp, formatHms, SectionHeading } from './shared';

/**
 * "Jonli demo" — haqiqiy interfeysga yaqin, lekin TO'LIQ namunaviy ko'rinish.
 * Hech qanday API chaqirilmaydi: taymerlar sahifa ochilgan paytdan boshlab
 * yuradi, bar savatchasi esa bosilganda haqiqatan o'zgaradi — tashrif
 * buyuruvchi tizim "qo'lida" qanday ishlashini his qiladi.
 */

type DemoTab = 'tables' | 'bar' | 'reports' | 'mobile';

const TABS: { key: DemoTab; icon: ReactNode; path: string }[] = [
  { key: 'tables', icon: <TableOutlined />, path: 'tables' },
  { key: 'bar', icon: <CoffeeOutlined />, path: 'orders' },
  { key: 'reports', icon: <BarChartOutlined />, path: 'reports' },
  { key: 'mobile', icon: <MobileOutlined />, path: 'dashboard' },
];

interface DemoTable {
  n: number;
  price: number;
  state: 'busy' | 'paused' | 'free';
  /** Sahifa ochilganda o'yin necha soniyadan beri davom etyapti */
  base?: number;
  guest?: string;
  bar?: number;
  vip?: boolean;
}

const DEMO_TABLES: DemoTable[] = [
  { n: 1, price: 30000, state: 'busy', base: 4325, guest: 'Akmal', bar: 0 },
  { n: 2, price: 50000, state: 'busy', base: 1480, guest: 'Bobur', bar: 18000, vip: true },
  { n: 3, price: 30000, state: 'free' },
  { n: 4, price: 30000, state: 'paused', base: 2832, guest: 'Jasur', bar: 9000 },
  { n: 5, price: 30000, state: 'busy', base: 7533, guest: 'Sherzod', bar: 32000 },
  { n: 6, price: 30000, state: 'free' },
];

/** Har soniyada faqat shu barg qayta chiziladi (sahifa emas) */
const LiveTimer = ({ base, mountedAt, frozen }: { base: number; mountedAt: number; frozen?: boolean }) => {
  const now = useNow();
  const sec = frozen ? base : base + (now - mountedAt) / 1000;
  return <span className="lp-demo-timer">{formatHms(sec)}</span>;
};

const LiveAmount = ({
  base,
  mountedAt,
  price,
  bar = 0,
  frozen,
}: {
  base: number;
  mountedAt: number;
  price: number;
  bar?: number;
  frozen?: boolean;
}) => {
  const now = useNow();
  const sec = frozen ? base : base + (now - mountedAt) / 1000;
  return <>{formatNumber(amountFor(sec, price) + bar)}</>;
};

/* ------------------------------------------------------------ Stollar */

const DemoTables = ({ mountedAt }: { mountedAt: number }) => {
  const { t } = useTranslation();
  const busy = DEMO_TABLES.filter((d) => d.state !== 'free').length;
  return (
    <div className="lp-demo-tables">
      <div className="lp-demo-kpis">
        <div>
          <span>{t('landing.demoOccupancy')}</span>
          <strong>{Math.round((busy / DEMO_TABLES.length) * 100)}%</strong>
          <i className="lp-demo-meter">
            <b style={{ width: `${Math.round((busy / DEMO_TABLES.length) * 100)}%` }} />
          </i>
        </div>
        <div>
          <span>{t('landing.demoBusy')}</span>
          <strong>
            {busy}
            <small> / {DEMO_TABLES.length}</small>
          </strong>
        </div>
        <div>
          <span>{t('landing.demoTodayRevenue')}</span>
          <strong>1 245 000</strong>
        </div>
      </div>
      <div className="lp-demo-grid">
        {DEMO_TABLES.map((d) => (
          <div key={d.n} className={`lp-demo-card is-${d.state}`}>
            <div className="lp-demo-card__head">
              <span className="lp-demo-card__num">{String(d.n).padStart(2, '0')}</span>
              <span className="lp-demo-card__name">
                {d.vip ? 'VIP ' : ''}
                {t('common.table')} {d.n}
              </span>
              <span className={`lp-demo-status is-${d.state}`}>{t(`landing.demoState_${d.state}`)}</span>
            </div>
            {d.state === 'free' ? (
              <div className="lp-demo-card__free">
                <span>{formatNumber(d.price)} / {t('landing.demoPerHour')}</span>
                <button type="button" className="lp-demo-btn is-ghost" tabIndex={-1}>
                  <PlayCircleOutlined /> {t('landing.demoStart')}
                </button>
              </div>
            ) : (
              <>
                <div className="lp-demo-card__numbers">
                  <LiveTimer base={d.base ?? 0} mountedAt={mountedAt} frozen={d.state === 'paused'} />
                  <span className="lp-demo-card__amount">
                    <LiveAmount
                      base={d.base ?? 0}
                      mountedAt={mountedAt}
                      price={d.price}
                      bar={d.bar}
                      frozen={d.state === 'paused'}
                    />{' '}
                    <small>{t('common.sum')}</small>
                  </span>
                </div>
                <div className="lp-demo-card__meta">
                  <span>
                    <UserOutlined /> {d.guest}
                  </span>
                  {d.bar ? (
                    <span>
                      <CoffeeOutlined /> {formatNumber(d.bar)}
                    </span>
                  ) : null}
                </div>
                <div className="lp-demo-card__actions">
                  <button type="button" className="lp-demo-btn" tabIndex={-1}>
                    {d.state === 'paused' ? <PlayCircleOutlined /> : <PauseCircleOutlined />}
                  </button>
                  <button type="button" className="lp-demo-btn" tabIndex={-1}>
                    <CoffeeOutlined />
                  </button>
                  <button type="button" className="lp-demo-btn is-primary" tabIndex={-1}>
                    <DollarOutlined /> {t('landing.demoCheckout')}
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------- Bar POS */

const DEMO_PRODUCTS = [
  { key: 'tea', price: 8000, stock: 40 },
  { key: 'cola', price: 9000, stock: 24 },
  { key: 'water', price: 4000, stock: 36 },
  { key: 'chips', price: 12000, stock: 15 },
  { key: 'coffee', price: 15000, stock: 30 },
  { key: 'burger', price: 28000, stock: 8 },
] as const;

type ProductKey = (typeof DEMO_PRODUCTS)[number]['key'];

const DemoBar = () => {
  const { t } = useTranslation();
  const [basket, setBasket] = useState<Partial<Record<ProductKey, number>>>({ cola: 2, chips: 1 });
  const change = (key: ProductKey, delta: number) =>
    setBasket((prev) => {
      const next = Math.max(0, Math.min(20, (prev[key] ?? 0) + delta));
      return { ...prev, [key]: next };
    });
  const lines = DEMO_PRODUCTS.filter((p) => (basket[p.key] ?? 0) > 0);
  const total = lines.reduce((sum, p) => sum + p.price * (basket[p.key] ?? 0), 0);

  return (
    <div className="lp-demo-bar">
      <div className="lp-demo-products">
        {DEMO_PRODUCTS.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`lp-demo-product${(basket[p.key] ?? 0) > 0 ? ' is-in' : ''}`}
            onClick={() => change(p.key, 1)}
          >
            <span className="lp-demo-product__top">
              <CoffeeOutlined />
              {(basket[p.key] ?? 0) > 0 && <b>{basket[p.key]}</b>}
            </span>
            <strong>{t(`landing.demoProduct_${p.key}`)}</strong>
            <span className="lp-demo-product__price">
              {formatNumber(p.price)} {t('common.sum')}
            </span>
            <small>
              {t('landing.demoStock')}: {p.stock - (basket[p.key] ?? 0)}
            </small>
          </button>
        ))}
      </div>
      <div className="lp-demo-basket">
        <div className="lp-demo-basket__head">
          <strong>
            <CoffeeOutlined /> {t('landing.demoBasket')}
          </strong>
          <span>
            {t('common.table')} 2 · Bobur
          </span>
        </div>
        {lines.length === 0 ? (
          <p className="lp-demo-basket__empty">{t('landing.demoBasketEmpty')}</p>
        ) : (
          <ul>
            {lines.map((p) => (
              <li key={p.key}>
                <span>{t(`landing.demoProduct_${p.key}`)}</span>
                <span className="lp-demo-qty">
                  <button type="button" aria-label="-1" onClick={() => change(p.key, -1)}>
                    <MinusOutlined />
                  </button>
                  <b>{basket[p.key]}</b>
                  <button type="button" aria-label="+1" onClick={() => change(p.key, 1)}>
                    <PlusOutlined />
                  </button>
                </span>
                <span className="lp-demo-basket__sum">{formatNumber(p.price * (basket[p.key] ?? 0))}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="lp-demo-basket__total">
          <span>{t('landing.demoTotal')}</span>
          <strong>
            {formatNumber(total)} {t('common.sum')}
          </strong>
        </div>
        <button type="button" className="lp-demo-btn is-primary is-block" tabIndex={-1}>
          {t('landing.demoAddToTable')}
        </button>
        <p className="lp-demo-hint">{t('landing.demoBarHint')}</p>
      </div>
    </div>
  );
};

/* ---------------------------------------------------------- Hisobotlar */

const WEEK_REVENUE = [1_240_000, 1_510_000, 1_180_000, 1_930_000, 2_420_000, 2_610_000, 1_560_000];

const DemoReports = () => {
  const { t } = useTranslation();
  const max = Math.max(...WEEK_REVENUE);
  const total = WEEK_REVENUE.reduce((a, b) => a + b, 0);
  const expenses = 2_100_000;
  const days = t('landing.demoWeekdays').split(',');
  return (
    <div className="lp-demo-reports">
      <div className="lp-demo-kpis is-four">
        <div>
          <span>{t('landing.demoRevenue7')}</span>
          <strong>{formatNumber(total)}</strong>
        </div>
        <div>
          <span>{t('landing.demoExpenses')}</span>
          <strong>{formatNumber(expenses)}</strong>
        </div>
        <div className="is-positive">
          <span>{t('landing.demoProfit')}</span>
          <strong>{formatNumber(total - expenses)}</strong>
        </div>
        <div>
          <span>{t('landing.demoAvgCheck')}</span>
          <strong>64 000</strong>
        </div>
      </div>
      <div className="lp-demo-reports__body">
        <div className="lp-demo-chart" role="img" aria-label={t('landing.demoChartAria')}>
          {WEEK_REVENUE.map((v, i) => (
            <div key={i} className="lp-demo-chart__col">
              <div className="lp-demo-chart__track">
                <motion.span
                  className={`lp-demo-chart__bar${v === max ? ' is-max' : ''}`}
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: 0.6, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                  style={{ height: `${Math.round((v / max) * 100)}%` }}
                />
              </div>
              <small>{days[i] ?? ''}</small>
            </div>
          ))}
        </div>
        <div className="lp-demo-split">
          <strong>{t('landing.demoPayments')}</strong>
          {[
            { k: 'cash', v: 58 },
            { k: 'card', v: 30 },
            { k: 'transfer', v: 12 },
          ].map((row) => (
            <div key={row.k} className="lp-demo-split__row">
              <span>{t(`landing.demoPay_${row.k}`)}</span>
              <i>
                <b style={{ width: `${row.v}%` }} />
              </i>
              <em>{row.v}%</em>
            </div>
          ))}
          <div className="lp-demo-peak">
            <span>{t('landing.demoPeak')}</span>
            <strong>19:00 – 23:00</strong>
          </div>
          <button type="button" className="lp-demo-btn is-block" tabIndex={-1}>
            {t('landing.demoExcel')}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------ Telefonda */

const DemoMobile = ({ mountedAt }: { mountedAt: number }) => {
  const { t } = useTranslation();
  const active = DEMO_TABLES.filter((d) => d.state === 'busy');
  return (
    <div className="lp-demo-mobile">
      <div className="lp-phone" aria-hidden>
        <div className="lp-phone__notch" />
        <div className="lp-phone__screen">
          <div className="lp-phone__header">
            <strong>Zumrad Billiard</strong>
            <span className="lp-phone__live">● LIVE</span>
          </div>
          <div className="lp-phone__kpis">
            <div>
              <span>{t('landing.demoTodayRevenue')}</span>
              <strong>1 245 000</strong>
            </div>
            <div>
              <span>{t('landing.demoBusy')}</span>
              <strong>4 / 6</strong>
            </div>
          </div>
          {active.map((d) => (
            <div key={d.n} className="lp-phone__row">
              <span className="lp-phone__num">{String(d.n).padStart(2, '0')}</span>
              <span className="lp-phone__guest">{d.guest}</span>
              <LiveTimer base={d.base ?? 0} mountedAt={mountedAt} />
            </div>
          ))}
          <div className="lp-phone__nav">
            <i className="is-active" />
            <i />
            <i />
            <i />
          </div>
        </div>
      </div>
      <ul className="lp-demo-mobile__points">
        {['demoMobile1', 'demoMobile2', 'demoMobile3', 'demoMobile4'].map((k) => (
          <li key={k}>
            <strong>{t(`landing.${k}Title`)}</strong>
            <span>{t(`landing.${k}Desc`)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

/* ------------------------------------------------------------- Bo'lim */

const ProductShowcase = () => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<DemoTab>('tables');
  // Taymerlar shu paytdan hisoblanadi (barcha tablar uchun bir xil)
  const mountedAt = useRef(Date.now()).current;
  const path = useMemo(() => TABS.find((x) => x.key === tab)?.path ?? 'tables', [tab]);

  return (
    <section id="demo" className="lp-section lp-section--panel">
      <div className="lp-container">
        <SectionHeading
          overline={t('landing.demoOverline')}
          title={t('landing.demoTitle')}
          subtitle={t('landing.demoSubtitle')}
        />
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.15 }}
        >
          <div className="lp-demo-tabs" role="tablist" aria-label={t('landing.demoOverline')}>
            {TABS.map((x) => (
              <button
                key={x.key}
                type="button"
                role="tab"
                id={`lp-demo-tab-${x.key}`}
                aria-selected={tab === x.key}
                aria-controls="lp-demo-panel"
                className={`lp-demo-tab${tab === x.key ? ' is-active' : ''}`}
                onClick={() => setTab(x.key)}
              >
                {x.icon}
                <span>{t(`landing.demoTab_${x.key}`)}</span>
              </button>
            ))}
          </div>
          <div className="lp-window">
            <div className="lp-window__bar" aria-hidden>
              <span className="lp-window__dots">
                <i />
                <i />
                <i />
              </span>
              <span className="lp-window__url">billiardclub.uz/{path}</span>
              <span className="lp-window__live">{t('landing.demoLive')}</span>
            </div>
            <div
              id="lp-demo-panel"
              role="tabpanel"
              aria-labelledby={`lp-demo-tab-${tab}`}
              className="lp-window__body"
            >
              {tab === 'tables' && <DemoTables mountedAt={mountedAt} />}
              {tab === 'bar' && <DemoBar />}
              {tab === 'reports' && <DemoReports />}
              {tab === 'mobile' && <DemoMobile mountedAt={mountedAt} />}
            </div>
          </div>
          <p className="lp-demo-note">{t('landing.demoNote')}</p>
        </motion.div>
      </div>
    </section>
  );
};

export default ProductShowcase;
