import { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from 'framer-motion';
import { useTranslation } from 'react-i18next';

/** Bitta so'z — o'z oralig'ida xiradan to'liq ravshanga */
const Word = ({ progress, range, children }: { progress: MotionValue<number>; range: [number, number]; children: string }) => {
  const opacity = useTransform(progress, range, [0.14, 1]);
  return <motion.span style={{ opacity }}>{children} </motion.span>;
};

/**
 * BAYONOT — katta serif matn, scroll bilan so'zma-so'z yorishadi
 * (Apple mahsulot sahifalaridagidek). Ekran o'quvchi to'liq matnni o'qiydi:
 * xiralik faqat ko'rinishda. "Harakatni kamaytirish" yoqilganda — darhol to'liq.
 */
const Statement = () => {
  const { t } = useTranslation();
  const ref = useRef<HTMLParagraphElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.82', 'end 0.42'] });
  const words = t('landing.statementText').split(' ');

  return (
    <section className="lp-statement" aria-label={t('landing.statementOverline')}>
      <div className="lp-container">
        <div className="lp-statement__eyebrow">
          <span className="lp-eyebrow">{t('landing.statementOverline')}</span>
        </div>
        <p ref={ref} className="lp-statement__text">
          {reduce
            ? words.join(' ')
            : words.map((word, i) => (
                <Word key={i} progress={scrollYProgress} range={[i / words.length, (i + 1) / words.length]}>
                  {word}
                </Word>
              ))}
        </p>
      </div>
    </section>
  );
};

export default Statement;
