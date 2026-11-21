import { useEffect, useRef, type CSSProperties } from 'react';
import { InputNumber } from 'antd';
import { useTranslation } from 'react-i18next';
import { formatNumber, moneyFormatter, moneyParser } from '../../utils/format';

/**
 * SUMMA LIMITI MAYDONI — pul kiritish va tez tanlash tugmalari.
 *
 * O'yinni boshlash oynasida ham ("Limit" tanlanganda), o'yin davomida limitni
 * o'zgartirish oynasida ham AYNAN shu ikki bo'lak ishlatiladi: kassir ikki
 * joyda ikki xil ko'rinishga o'rganib o'tirmaydi.
 *
 * Maydon va tugmalar ATAYLAB alohida komponent: maydon Form.Item ichida turadi
 * (xato matni to'g'ridan-to'g'ri uning ostida chiqadi), tugmalar esa undan keyin.
 */
interface LimitInputProps {
  /** Form.Item beradi */
  id?: string;
  value?: number | null;
  onChange?: (value: number | null) => void;
  currency: string;
  placeholder?: string;
  /** Maydon ko'ringan zahoti kursor shu yerga tushsin */
  focusOnMount?: boolean;
}

const LimitInput = ({ id, value, onChange, currency, placeholder, focusOnMount }: LimitInputProps) => {
  // antd InputNumber ref turi (rc-input-number: InputNumberRef) — tashqariga eksport qilinmagan
  const inputRef = useRef<HTMLInputElement & { nativeElement: HTMLElement }>(null);

  useEffect(() => {
    if (!focusOnMount) return;
    // Keyingi kadrda: maydon endigina DOM ga qo'shilgan, modal animatsiyasi ham tugasin
    const frame = requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [focusOnMount]);

  return (
    <InputNumber<number>
      id={id}
      ref={inputRef}
      value={value ?? null}
      onChange={(next) => onChange?.(typeof next === 'number' ? next : null)}
      min={0}
      controls={false}
      formatter={moneyFormatter}
      parser={moneyParser as (value?: string) => number}
      suffix={<span className="table-limit-currency">{currency}</span>}
      placeholder={placeholder}
      inputMode="decimal"
      autoComplete="off"
      style={{ width: '100%' }}
    />
  );
};

export default LimitInput;

interface LimitQuickProps {
  /** Tez tanlash summalari (bo'sh bo'lsa hech narsa chizilmaydi) */
  amounts: number[];
  /** Maydondagi joriy qiymat */
  value: number | null | undefined;
  /**
   * 'set' — tugma summani YOZADI (yangi o'yin); 'add' — joriy qiymatga QO'SHADI
   * ("yana 20 mingga" — o'yin davomida limitni oshirish).
   */
  mode?: 'set' | 'add';
  /** Yangi qiymat (qo'shish rejimida — yig'indi) */
  onPick: (next: number) => void;
}

/**
 * Tez tanlash tugmalari — eng ko'p so'raladigan summalar bitta bosishda.
 * Bosilgandan keyin kursor maydonga QAYTARILMAYDI: telefonda bu klaviaturani
 * ochib yuborardi, tugmalarning maqsadi esa aynan klaviaturasiz kiritish.
 */
export const LimitQuick = ({ amounts, value, mode = 'set', onPick }: LimitQuickProps) => {
  const { t } = useTranslation();
  if (amounts.length === 0) return null;
  return (
    <div
      // Ustunlar soni tugmalar soniga teng; tor ekranda to'rttasi 2×2 bo'lib joylashadi (CSS)
      className={`table-limit-quick${amounts.length > 3 ? ' is-wrap' : ''}`}
      style={{ '--quick-cols': amounts.length } as CSSProperties}
      role="group"
      aria-label={t('tables.limitQuick')}
    >
      {amounts.map((amount) => (
        <button
          type="button"
          key={amount}
          className={`table-limit-chip${mode === 'set' && value === amount ? ' is-selected' : ''}`}
          aria-pressed={mode === 'set' ? value === amount : undefined}
          onClick={() => onPick(mode === 'add' ? Math.round(((value ?? 0) + amount) * 100) / 100 : amount)}
        >
          {mode === 'add' ? t('tables.limitAdd', { amount: formatNumber(amount) }) : formatNumber(amount)}
        </button>
      ))}
    </div>
  );
};
