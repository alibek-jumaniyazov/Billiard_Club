import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, InputNumber, Slider, Tooltip } from 'antd';
import { ArrowRightOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { animate, motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { formatNumber, moneyFormatter, moneyParser } from '../../utils/format';
import { fadeUp, SectionHeading, stagger } from './shared';

/**
 * "Klubingiz oyiga qancha yo'qotyapti?" — interaktiv kalkulyator.
 *
 * Hisob ATAYLAB sodda va shaffof: oylik stol tushumi × yo'qotish ulushi.
 * Ulush (yozilmagan o'yinlar, yaxlitlash, unutilgan bar) foydalanuvchi
 * o'zi tanlaydi; natija "taxminiy" deb aniq yoziladi — va'da emas.
 */

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
  onChange: (v: number) => void;
}

const Field = ({ label, hint, value, min, max, step, suffix, money, onChange }: FieldProps) => {
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
        <InputNumber
          id={id}
          size="middle"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={set}
          addonAfter={suffix}
          inputMode="numeric"
          {...(money ? { formatter: moneyFormatter, parser: moneyParser } : {})}
        />
      </div>
      <Slider
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={set}
        tooltip={{ formatter: (v) => (money ? formatNumber(v ?? 0) : v) }}
        aria-label={label}
      />
    </div>
  );
};

const ResultRow = ({ label, children, tone }: { label: string; children: ReactNode; tone?: 'loss' }) => (
  <div className={`lp-roi-result__row${tone === 'loss' ? ' is-loss' : ''}`}>
    <span>{label}</span>
    <strong>{children}</strong>
  </div>
);

const RoiCalculator = ({ monthlyPrice, onCta }: { monthlyPrice: number; onCta: () => void }) => {
  const { t } = useTranslation();
  const [tables, setTables] = useState(8);
  const [price, setPrice] = useState(30000);
  const [hours, setHours] = useState(6);
  const [leak, setLeak] = useState(8);

  const monthlyRevenue = tables * price * hours * 30;
  const monthlyLoss = Math.round((monthlyRevenue * leak) / 100);
  const yearlyLoss = monthlyLoss * 12;
  const dailyLoss = monthlyLoss / 30;
  const paybackDays = dailyLoss > 0 ? Math.max(1, Math.ceil(monthlyPrice / dailyLoss)) : null;
  const share = monthlyLoss > 0 ? Math.max(1, Math.round((monthlyPrice / monthlyLoss) * 100)) : null;
  const sum = t('common.sum');

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
          viewport={{ once: true, amount: 0.2 }}
        >
          <motion.div className="lp-roi__inputs" variants={fadeUp}>
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
              label={t('landing.roiLeak')}
              hint={t('landing.roiLeakHint')}
              value={leak}
              min={2}
              max={30}
              step={1}
              suffix="%"
              onChange={setLeak}
            />
            <p className="lp-roi__formula">{t('landing.roiFormula')}</p>
          </motion.div>

          <motion.div className="lp-roi-result" variants={fadeUp} aria-live="polite">
            <ResultRow label={t('landing.roiRevenue')}>
              <AnimatedNumber value={monthlyRevenue} /> {sum}
            </ResultRow>
            <div className="lp-roi-result__hero">
              <span>{t('landing.roiLossMonth')}</span>
              <strong>
                −<AnimatedNumber value={monthlyLoss} /> <small>{sum}</small>
              </strong>
              <em>
                {t('landing.roiLossYear')}: −{formatNumber(yearlyLoss)} {sum}
              </em>
            </div>
            <ResultRow label={t('landing.roiSubscription')}>
              {formatNumber(monthlyPrice)} {sum}
            </ResultRow>
            {share !== null && (
              <ResultRow label={t('landing.roiShare')}>{t('landing.roiShareValue', { percent: share })}</ResultRow>
            )}
            {paybackDays !== null && (
              <div className="lp-roi-result__payback">
                {t('landing.roiPayback', { n: paybackDays })}
              </div>
            )}
            <Button
              type="primary"
              size="large"
              block
              className="lp-cta-btn"
              style={{ height: 50, marginTop: 6 }}
              onClick={onCta}
            >
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
