import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowDownOutlined,
  BarChartOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  CoffeeOutlined,
  CreditCardOutlined,
  DashboardOutlined,
  FileExcelOutlined,
  GlobalOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useNow } from '../../components/ui';
import { formatNumber } from '../../utils/format';
import { amountFor, fadeUp, formatHms, SectionHeading, spotlightMove, stagger } from './shared';
import './bento.css';

/**
 * Imkoniyatlar — "bento" panjara: har bir karta o'zining jonli mini-tasviri
 * bilan (taymerlar yuradi, chek chiqadi, grafik o'sadi). Tasvirlar faqat
 * HTML/CSS — rasm fayli yuklanmaydi. CSS animatsiyalari faqat panjara ekranda
 * bo'lganda yuradi (.is-live), prefers-reduced-motion'da hammasi statik.
 */

type TileSize = 'xl' | 'wide' | 'std';

interface Tile {
  key: string;
  size: TileSize;
  icon: ReactNode;
  visual: ReactNode;
}

/* ------------------------------------------------------------ Taymerlar */

const TIMER_TABLES = [
  { n: 1, base: 4325, price: 30000, state: 'busy' as const },
  { n: 2, base: 1480, price: 50000, state: 'busy' as const, vip: true },
  { n: 4, base: 2832, price: 30000, state: 'paused' as const },
  { n: 5, base: 0, price: 30000, state: 'free' as const },
];

/** Har soniyada faqat shu barg qayta chiziladi */
const TileTimer = ({ base, price, mountedAt, frozen }: { base: number; price: number; mountedAt: number; frozen: boolean }) => {
  const { t } = useTranslation();
  const now = useNow();
  const sec = frozen ? base : base + (now - mountedAt) / 1000;
  return (
    <>
      <span className="lp-bt-timer__time">{formatHms(sec)}</span>
      <span className="lp-bt-timer__sum">
        {formatNumber(amountFor(sec, price))} <small>{t('common.sum')}</small>
      </span>
    </>
  );
};

/** Ochiq stollardagi jonli summa — taymerlar bilan bir formula */
const OpenSum = ({ mountedAt }: { mountedAt: number }) => {
  const now = useNow();
  const total = TIMER_TABLES.reduce((sum, table) => {
    if (table.state === 'free') return sum;
    const sec = table.state === 'paused' ? table.base : table.base + (now - mountedAt) / 1000;
    return sum + amountFor(sec, table.price);
  }, 0);
  return <>{formatNumber(total)}</>;
};

const TimersVisual = () => {
  const { t } = useTranslation();
  const [mountedAt] = useState(() => Date.now());
  const busy = TIMER_TABLES.filter((table) => table.state !== 'free').length;
  const occupancy = busy / TIMER_TABLES.length;
  return (
    <div className="lp-bt-timers-wrap">
      <div className="lp-bt-kpis">
        <div>
          <small>{t('landing.bentoOccupancy')}</small>
          <b>{Math.round(occupancy * 100)}%</b>
          <i className="lp-bt-meter" aria-hidden>
            <em style={{ '--p': occupancy } as CSSProperties} />
          </i>
        </div>
        <div>
          <small>{t('landing.bentoBusyTables')}</small>
          <b>
            {busy} / {TIMER_TABLES.length}
          </b>
        </div>
        <div>
          <small>{t('landing.bentoOpenSum')}</small>
          <b className="is-gold">
            <OpenSum mountedAt={mountedAt} />
          </b>
        </div>
      </div>
      <div className="lp-bt-timers">
        {TIMER_TABLES.map((table) => (
          <div key={table.n} className={`lp-bt-timer is-${table.state}`}>
            <div className="lp-bt-timer__head">
              <span>
                {table.vip ? 'VIP ' : ''}
                {t('landing.bentoTable', { n: table.n })}
              </span>
              <i>{t(`landing.bento${table.state === 'busy' ? 'Busy' : table.state === 'paused' ? 'Paused' : 'Free'}`)}</i>
            </div>
            {table.state === 'free' ? (
              <span className="lp-bt-timer__free">
                {formatNumber(table.price)} {t('common.sum')} · {t('common.perHour')}
              </span>
            ) : (
              <TileTimer base={table.base} price={table.price} mountedAt={mountedAt} frozen={table.state === 'paused'} />
            )}
            <span className="lp-bt-timer__lamp" aria-hidden />
          </div>
        ))}
      </div>
    </div>
  );
};

/* -------------------------------------------------------------- Bar POS */

const BarVisual = () => {
  const { t } = useTranslation();
  const items = [
    { name: 'Coca-Cola', qty: 2, sum: 24000, dot: '#e0483e' },
    { name: t('landing.bentoTea'), qty: 1, sum: 5000, dot: '#c79a4b' },
    { name: t('landing.bentoChips'), qty: 1, sum: 15000, dot: '#e7c14e' },
  ];
  return (
    <div className="lp-bt-bar">
      <div className="lp-bt-bar__menu">
        {items.map((item, i) => (
          <span key={item.name} className={`lp-bt-chip lp-bt-chip--${i + 1}`}>
            <i style={{ background: item.dot }} aria-hidden />
            {item.name}
            <b aria-hidden>+</b>
          </span>
        ))}
        <span className="lp-bt-stock">
          {t('landing.bentoStock')}
          <span className="lp-bt-stock__num">
            <em>48</em>
            <em>46</em>
          </span>
        </span>
      </div>
      <div className="lp-bt-receipt">
        <div className="lp-bt-receipt__head">{t('landing.bentoReceipt')}</div>
        {items.map((item, i) => (
          <div key={item.name} className={`lp-bt-receipt__row lp-bt-receipt__row--${i + 1}`}>
            <span>
              {item.name} ×{item.qty}
            </span>
            <span>{formatNumber(item.sum)}</span>
          </div>
        ))}
        <div className="lp-bt-receipt__total">
          <span>{t('landing.bentoTotal')}</span>
          <span>{formatNumber(items.reduce((sum, item) => sum + item.sum, 0))}</span>
        </div>
      </div>
    </div>
  );
};

/* ---------------------------------------------------------------- Qarzlar */

const DebtsVisual = () => {
  const { t } = useTranslation();
  const rows = [
    { name: 'Akmal', debt: 120000, paid: 0.35, done: false },
    { name: 'Bobur', debt: 45000, paid: 1, done: true },
  ];
  return (
    <div className="lp-bt-debts">
      {rows.map((row) => (
        <div key={row.name} className="lp-bt-debt">
          <span className="lp-bt-avatar" aria-hidden>
            {row.name[0]}
          </span>
          <div className="lp-bt-debt__body">
            <div className="lp-bt-debt__line">
              <b>{row.name}</b>
              <span>{formatNumber(row.debt)}</span>
            </div>
            <i className="lp-bt-progress" style={{ '--p': row.paid } as CSSProperties}>
              <em />
            </i>
          </div>
          <span className={`lp-bt-tag ${row.done ? 'is-ok' : 'is-warn'}`}>
            {row.done ? t('landing.bentoPaid') : t('landing.bentoPartial')}
          </span>
        </div>
      ))}
    </div>
  );
};

/* -------------------------------------------------------------- Hisobotlar */

const BARS = [0.42, 0.58, 0.5, 0.74, 0.66, 0.92, 0.8];

const ReportsVisual = () => {
  const { t } = useTranslation();
  const days = t('landing.bentoWeek').split(',');
  return (
    <div className="lp-bt-report">
      <div className="lp-bt-chart" aria-hidden>
        {BARS.map((h, i) => (
          <span key={i} className={i === 5 ? 'is-peak' : undefined} style={{ '--h': h, '--i': i } as CSSProperties} />
        ))}
      </div>
      <div className="lp-bt-days" aria-hidden>
        {days.map((day) => (
          <small key={day}>{day}</small>
        ))}
      </div>
      <span className="lp-bt-file">
        <FileExcelOutlined aria-hidden /> XLSX
        <ArrowDownOutlined className="lp-bt-file__arrow" aria-hidden />
      </span>
    </div>
  );
};

/* ---------------------------------------------------------------- Xodimlar */

const StaffVisual = () => {
  const { t } = useTranslation();
  const staff = [
    { name: 'Dilshod', role: t('landing.bentoRoleAdmin'), tone: 'gold' },
    { name: 'Malika', role: t('landing.bentoRoleCashier'), tone: 'green' },
    { name: 'Sardor', role: t('landing.bentoRoleOperator'), tone: 'blue' },
  ];
  return (
    <div className="lp-bt-staff">
      {staff.map((person) => (
        <div key={person.name} className="lp-bt-person">
          <span className={`lp-bt-avatar is-${person.tone}`} aria-hidden>
            {person.name[0]}
          </span>
          <b>{person.name}</b>
          <span className={`lp-bt-role is-${person.tone}`}>{person.role}</span>
        </div>
      ))}
      <div className="lp-bt-audit">
        <LockOutlined aria-hidden /> {t('landing.bentoAudit')}
      </div>
    </div>
  );
};

/* ------------------------------------------------------- Jonli panel (tel) */

const REVENUE_STEPS = [30000, 12000, 45000, 24000, 18000, 36000];

const PhoneVisual = ({ live }: { live: boolean }) => {
  const { t } = useTranslation();
  const [revenue, setRevenue] = useState(1240000);
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => {
      setStep((s) => {
        const next = (s + 1) % REVENUE_STEPS.length;
        setRevenue((r) => (r > 2400000 ? 1240000 : r + REVENUE_STEPS[next]));
        return next;
      });
    }, 2600);
    return () => window.clearInterval(id);
  }, [live]);
  return (
    <div className="lp-bt-phone">
      <div className="lp-bt-phone__screen">
        <span className="lp-bt-phone__label">{t('landing.bentoRevenue')}</span>
        <span className="lp-bt-phone__value">{formatNumber(revenue)}</span>
        <span key={step} className="lp-bt-phone__delta">+{formatNumber(REVENUE_STEPS[step])}</span>
        <div className="lp-bt-phone__tables" aria-hidden>
          {['busy', 'busy', 'free', 'paused', 'busy', 'free'].map((state, i) => (
            <i key={i} className={`is-${state}`} />
          ))}
        </div>
      </div>
    </div>
  );
};

/* ---------------------------------------------------------------- Tillar */

const LanguagesVisual = () => (
  <div className="lp-bt-langs" aria-hidden>
    <div className="lp-bt-langs__toggle">
      <span>UZ</span>
      <span>RU</span>
      <i />
    </div>
    <div className="lp-bt-flip">
      <span>Stollar</span>
      <span>Столы</span>
    </div>
    <div className="lp-bt-flip lp-bt-flip--late">
      <span>Hisobot</span>
      <span>Отчёт</span>
    </div>
  </div>
);

/* ------------------------------------------------------------- Xavfsizlik */

const SecurityVisual = () => {
  const { t } = useTranslation();
  return (
    <div className="lp-bt-secure">
      <span className="lp-bt-shield" aria-hidden>
        <SafetyCertificateOutlined />
      </span>
      <ul>
        {['bentoSecure1', 'bentoSecure2', 'bentoSecure3'].map((key) => (
          <li key={key}>
            <CheckOutlined aria-hidden /> {t(`landing.${key}`)}
          </li>
        ))}
      </ul>
    </div>
  );
};

/* ------------------------------------------------------------------ Bo'lim */

const FeatureBento = () => {
  const { t } = useTranslation();
  const gridRef = useRef<HTMLDivElement>(null);
  const inView = useInView(gridRef, { amount: 0.15 });
  const reduce = useReducedMotion() ?? false;
  const live = inView && !reduce;

  const tiles: Tile[] = [
    { key: 'feature1', size: 'xl', icon: <ClockCircleOutlined />, visual: <TimersVisual /> },
    { key: 'feature2', size: 'wide', icon: <CoffeeOutlined />, visual: <BarVisual /> },
    { key: 'feature3', size: 'std', icon: <CreditCardOutlined />, visual: <DebtsVisual /> },
    { key: 'feature4', size: 'std', icon: <BarChartOutlined />, visual: <ReportsVisual /> },
    { key: 'feature5', size: 'std', icon: <TeamOutlined />, visual: <StaffVisual /> },
    { key: 'feature6', size: 'std', icon: <DashboardOutlined />, visual: <PhoneVisual live={live} /> },
    { key: 'feature7', size: 'std', icon: <GlobalOutlined />, visual: <LanguagesVisual /> },
    { key: 'feature8', size: 'std', icon: <SafetyCertificateOutlined />, visual: <SecurityVisual /> },
  ];

  return (
    <section id="features" className="lp-section">
      <div className="lp-container">
        <SectionHeading
          overline={t('landing.featuresOverline')}
          title={t('landing.featuresTitle')}
          subtitle={t('landing.featuresSubtitle')}
        />
        <motion.div
          ref={gridRef}
          className={`lp-bento${live ? ' is-live' : ''}`}
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.05 }}
          onPointerMove={spotlightMove('.lp-bt-tile')}
        >
          {tiles.map((tile) => (
            <motion.article key={tile.key} variants={fadeUp} className={`lp-bt-tile lp-bt-tile--${tile.size}`}>
              <div className="lp-bt-tile__visual">{tile.visual}</div>
              <div className="lp-bt-tile__text">
                <h3>
                  <span className="lp-bt-tile__icon" aria-hidden>
                    {tile.icon}
                  </span>
                  {t(`landing.${tile.key}Title`)}
                </h3>
                <p>{t(`landing.${tile.key}Desc`)}</p>
              </div>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default FeatureBento;
