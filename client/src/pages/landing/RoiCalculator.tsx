import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, InputNumber, Segmented, Slider, Space, Tooltip } from 'antd';
import {
  ArrowRightOutlined,
  BookOutlined,
  BulbOutlined,
  CheckOutlined,
  CoffeeOutlined,
  DownOutlined,
  FieldTimeOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { AnimatePresence, animate, motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useTiersConfigState } from '../../hooks/useEntitlements';
import type { Plan, TierCode } from '../../types';
import { formatNumber, moneyFormatter, moneyParser } from '../../utils/format';
import { DEFAULT_TIERS_CONFIG, DEFAULT_TIER_PRICES, TIER_ORDER, tierName } from '../../utils/tiers';
import { pricesFrom } from './PricingTiers';
import { fadeUp, SectionHeading, stagger } from './shared';

/**
 * "Klubingiz oyiga qancha yo'qotyapti — va Billiard Club o'zini qachon oqlaydi?"
 *
 * Hisob ATAYLAB shaffof: yo'qotish egasi taniydigan to'rt manbaga bo'linadi
 * (yozilmagan o'yin, yaxlitlash, bar, qarz), har biri — tegishli tushumdan
 * foydalanuvchi o'zgartira oladigan foiz. Tizim yo'qotishning qanchasini
 * to'xtatishini ham foydalanuvchi o'zi tanlaydi; biz faqat zararsizlik
 * nuqtasini (narx ÷ yo'qotish) ko'rsatamiz. Natija "taxminiy" — va'da emas.
 */

const DAYS = 30;
const SCENARIOS = [30, 50, 80] as const;
type Scenario = (typeof SCENARIOS)[number];

type LeakKey = 'unrecorded' | 'rounding' | 'bar' | 'debts';
/** Yo'qotish qaysi tushumdan hisoblanadi: stollar, bar yoki ikkalasi */
type LeakBase = 'tables' | 'bar' | 'all';

const LEAKS: { key: LeakKey; base: LeakBase; initial: number; max: number; icon: ReactNode }[] = [
  { key: 'unrecorded', base: 'tables', initial: 4, max: 20, icon: <BulbOutlined /> },
  { key: 'rounding', base: 'tables', initial: 3, max: 15, icon: <FieldTimeOutlined /> },
  { key: 'bar', base: 'bar', initial: 8, max: 30, icon: <CoffeeOutlined /> },
  { key: 'debts', base: 'all', initial: 1, max: 10, icon: <BookOutlined /> },
];

const LEAK_LABEL: Record<LeakKey, string> = {
  unrecorded: 'Unrecorded',
  rounding: 'Rounding',
  bar: 'Bar',
  debts: 'Debts',
};

const decimalFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

/** Qiymat o'zgarganda raqam yumshoq "aylanadi" (faqat textContent yoziladi) */
const AnimatedNumber = ({ value }: { value: number }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  const reduce = useReducedMotion();
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (reduce) {
      node.textContent = formatNumber(value);
      prev.current = value;
      return;
    }
    const controls = animate(prev.current, value, {
      duration: 0.5,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        node.textContent = formatNumber(v);
      },
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, reduce]);
  return <span ref={ref}>{formatNumber(value)}</span>;
};

interface FieldProps {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  money?: boolean;
  /** Kasr qadam (0,5): "4" va "4,5" ko'rinishida — "4.0" emas */
  fraction?: boolean;
  onChange: (v: number) => void;
}

const fractionFormatter = (v: number | string | undefined) =>
  v === undefined || v === '' ? '' : decimalFormat.format(Number(v));
const fractionParser = (v: string | undefined) => Number((v ?? '').replace(/\s/g, '').replace(',', '.'));

const Field = ({ label, hint, value, min, max, step, suffix, money, fraction, onChange }: FieldProps) => {
  const id = `lp-roi-${label.replace(/\W+/g, '-').toLowerCase()}`;
  const set = (v: number | string | null) => {
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
  };
  return (
    <div className="lp-roi-field">
      <div className="lp-roi-field__head">
        <label htmlFor={id}>
          {label}
          {hint ? (
            <Tooltip title={hint}>
              <InfoCircleOutlined className="lp-roi-field__hint" aria-label={hint} />
            </Tooltip>
          ) : null}
        </label>
        <Space.Compact className="lp-roi-field__input">
          <InputNumber
            id={id}
            size="middle"
            value={value}
            min={min}
            max={max}
            step={step}
            onChange={set}
            inputMode="numeric"
            {...(money ? { formatter: moneyFormatter, parser: moneyParser } : {})}
            {...(fraction ? { formatter: fractionFormatter, parser: fractionParser } : {})}
          />
          <Space.Addon>{suffix}</Space.Addon>
        </Space.Compact>
      </div>
      <Slider
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={set}
        tooltip={{ formatter: (v) => (money ? formatNumber(v ?? 0) : fraction ? decimalFormat.format(v ?? 0) : v) }}
        aria-label={label}
      />
    </div>
  );
};

const RoiCalculator = ({ plans, onCta }: { plans: Plan[] | null; onCta: () => void }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const sum = t('common.sum');
  const [tables, setTables] = useState(8);
  const [price, setPrice] = useState(30000);
  const [hours, setHours] = useState(6);
  const [barDaily, setBarDaily] = useState(400000);
  const [rates, setRates] = useState<Record<LeakKey, number>>(
    () => Object.fromEntries(LEAKS.map((leak) => [leak.key, leak.initial])) as Record<LeakKey, number>,
  );
  const [scenario, setScenario] = useState<Scenario>(50);
  const [tuning, setTuning] = useState(false);

  /* Stollar soniga mos eng arzon daraja — tarif cheklovi va oylik narxi bilan */
  const { config } = useTiersConfigState();
  const tiers = config ?? DEFAULT_TIERS_CONFIG;
  const prices = useMemo(() => pricesFrom(plans), [plans]);
  const tierCode: TierCode =
    TIER_ORDER.find((code) => {
      const limit = tiers[code].limits.tables;
      return (limit === null || limit >= tables) && prices[code][1] !== undefined;
    }) ?? 'vip';
  const tier = tiers[tierCode];
  const tierPrice = prices[tierCode][1] ?? DEFAULT_TIER_PRICES[tierCode][1];
  const lightsCode = TIER_ORDER.find((code) => tiers[code].features.lights) ?? 'vip';

  /* Hisob */
  const tableRevenue = tables * price * hours * DAYS;
  const barRevenue = barDaily * DAYS;
  const baseOf: Record<LeakBase, number> = { tables: tableRevenue, bar: barRevenue, all: tableRevenue + barRevenue };
  const items = LEAKS.map((leak) => ({ ...leak, amount: Math.round((baseOf[leak.base] * rates[leak.key]) / 100) }));
  const monthlyLoss = items.reduce((total, item) => total + item.amount, 0);
  const recovered = Math.round((monthlyLoss * scenario) / 100);
  const net = recovered - tierPrice;
  const paybackDays = recovered > 0 ? Math.max(1, Math.ceil(tierPrice / (recovered / DAYS))) : null;
  const multiple = tierPrice > 0 ? recovered / tierPrice : 0;
  const breakEven = monthlyLoss > 0 ? (tierPrice / monthlyLoss) * 100 : null;
  const largest = Math.max(1, ...items.map((item) => item.amount));
  const priceShare = monthlyLoss > 0 ? Math.min(100, (tierPrice / monthlyLoss) * 100) : 100;

  const tierTables =
    tier.limits.tables === null
      ? t('landing.roiTierUnlimited')
      : t('landing.roiTierTables', { n: tier.limits.tables });

  return (
    <section id="calculator" className="lp-section lp-section--panel">
      <div className="lp-container">
        <SectionHeading
          overline={t('landing.roiOverline')}
          title={t('landing.roiTitle')}
          subtitle={t('landing.roiSubtitle')}
        />
        <motion.div
          className="lp-roi"
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.15 }}
        >
          {/* ------------------------------------------------ Klub ko'rsatkichlari */}
          <motion.div className="lp-roi__inputs" variants={fadeUp}>
            <h3 className="lp-roi__title">{t('landing.roiInputsTitle')}</h3>
            <Field
              label={t('landing.roiTables')}
              value={tables}
              min={1}
              max={40}
              step={1}
              suffix={t('landing.roiTablesUnit')}
              onChange={setTables}
            />
            <Field
              label={t('landing.roiPrice')}
              value={price}
              min={5000}
              max={150000}
              step={1000}
              suffix={sum}
              money
              onChange={setPrice}
            />
            <Field
              label={t('landing.roiHours')}
              hint={t('landing.roiHoursHint')}
              value={hours}
              min={1}
              max={20}
              step={1}
              suffix={t('landing.roiHoursUnit')}
              onChange={setHours}
            />
            <Field
              label={t('landing.roiBar')}
              hint={t('landing.roiBarHint')}
              value={barDaily}
              min={0}
              max={5000000}
              step={50000}
              suffix={sum}
              money
              onChange={setBarDaily}
            />

            <div className={`lp-roi-tune${tuning ? ' is-open' : ''}`}>
              <button
                type="button"
                className="lp-roi-tune__toggle"
                aria-expanded={tuning}
                aria-controls="lp-roi-tune"
                onClick={() => setTuning((open) => !open)}
              >
                <span>
                  <strong>{t('landing.roiAssumptions')}</strong>
                  <small>{t('landing.roiAssumptionsHint')}</small>
                </span>
                <DownOutlined aria-hidden />
              </button>
              <AnimatePresence initial={false}>
                {tuning && (
                  <motion.div
                    id="lp-roi-tune"
                    className="lp-roi-tune__body"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <div className="lp-roi-tune__inner">
                      {LEAKS.map((leak) => (
                        <Field
                          key={leak.key}
                          label={t(`landing.roiLeak${LEAK_LABEL[leak.key]}`)}
                          hint={t(`landing.roiLeak${LEAK_LABEL[leak.key]}Hint`)}
                          value={rates[leak.key]}
                          min={0}
                          max={leak.max}
                          step={0.5}
                          fraction
                          suffix="%"
                          onChange={(v) => setRates((prev) => ({ ...prev, [leak.key]: v }))}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <p className="lp-roi__formula">{t('landing.roiFormula')}</p>
          </motion.div>

          {/* ------------------------------------------------------------ Natija */}
          <motion.div className="lp-roi-result" variants={fadeUp} aria-live="polite">
            <div className="lp-roi-loss">
              <span className="lp-roi-kicker">{t('landing.roiLossMonth')}</span>
              <strong className="lp-roi-loss__value tabular-nums">
                −<AnimatedNumber value={monthlyLoss} /> <small>{sum}</small>
              </strong>
              <span className="lp-roi-loss__year tabular-nums">
                {t('landing.roiLossYear')}: −{formatNumber(monthlyLoss * 12)} {sum}
              </span>
            </div>

            <ul className="lp-roi-leaks">
              {items.map((item) => (
                <li key={item.key}>
                  <span className="lp-roi-leaks__icon" aria-hidden>
                    {item.icon}
                  </span>
                  <div className="lp-roi-leaks__body">
                    <div className="lp-roi-leaks__head">
                      <span>{t(`landing.roiLeak${LEAK_LABEL[item.key]}`)}</span>
                      <strong className="tabular-nums">
                        −{formatNumber(item.amount)} {sum}
                      </strong>
                    </div>
                    <div className="lp-roi-leaks__bar" aria-hidden>
                      <i style={{ width: `${(item.amount / largest) * 100}%` }} />
                    </div>
                    <small>
                      <CheckOutlined aria-hidden />
                      {t(`landing.roiLeak${LEAK_LABEL[item.key]}Fix`, { tier: tierName(tiers[lightsCode], lang) })}
                    </small>
                  </div>
                </li>
              ))}
            </ul>

            <div className="lp-roi-win">
              <div className="lp-roi-win__head">
                <span className="lp-roi-kicker">{t('landing.roiWithUs')}</span>
                <div className="lp-roi-win__scenario">
                  <span id="lp-roi-scenario">{t('landing.roiScenario')}</span>
                  <Segmented<Scenario>
                    size="small"
                    aria-labelledby="lp-roi-scenario"
                    value={scenario}
                    onChange={setScenario}
                    options={SCENARIOS.map((value) => ({ value, label: `${value}%` }))}
                  />
                </div>
              </div>

              <strong className={`lp-roi-win__value tabular-nums${net < 0 ? ' is-negative' : ''}`}>
                {net >= 0 ? '+' : '−'}
                <AnimatedNumber value={Math.abs(net)} /> <small>{sum}</small>
              </strong>
              <span className="lp-roi-win__caption">
                {t(net >= 0 ? 'landing.roiNet' : 'landing.roiNetNegative')}
              </span>

              <div className="lp-roi-stats">
                <div>
                  <b className="tabular-nums">
                    {paybackDays === null ? '—' : t('landing.roiPaybackValue', { n: paybackDays })}
                  </b>
                  <span>{t('landing.roiPaybackLabel')}</span>
                </div>
                <div>
                  <b className="tabular-nums">×{decimalFormat.format(multiple)}</b>
                  <span>{t('landing.roiMultipleLabel')}</span>
                </div>
                <div>
                  <b className="tabular-nums">
                    {breakEven === null
                      ? '—'
                      : t('landing.roiBreakEvenValue', { percent: decimalFormat.format(Math.max(0.1, breakEven)) })}
                  </b>
                  <span>{t('landing.roiBreakEvenLabel')}</span>
                </div>
              </div>
            </div>

            {/* Yo'qotish va tarif narxi — bir o'lchovda yonma-yon */}
            <div className="lp-roi-compare" aria-hidden>
              <div className="lp-roi-compare__row is-loss">
                <span>{t('landing.roiCompareLoss')}</span>
                <i style={{ width: '100%' }} />
                <b className="tabular-nums">−{formatNumber(monthlyLoss)}</b>
              </div>
              <div className="lp-roi-compare__row is-price">
                <span>{t('landing.roiComparePrice', { tier: tierName(tier, lang) })}</span>
                <i style={{ width: `${Math.max(1.5, priceShare)}%` }} />
                <b className="tabular-nums">{formatNumber(tierPrice)}</b>
              </div>
            </div>

            <p className="lp-roi-tier">
              {t('landing.roiTier', { tier: tierName(tier, lang) })}
              <span className="tabular-nums">
                {' '}
                · {formatNumber(tierPrice)} {sum}/{t('landing.roiMonthShort')} · {tierTables}
              </span>
            </p>

            <Button type="primary" size="large" block className="lp-cta-btn lp-roi-cta" onClick={onCta}>
              {t('landing.roiCta')} <ArrowRightOutlined />
            </Button>
            <p className="lp-roi-result__note">{t('landing.roiNote')}</p>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};

export default RoiCalculator;
