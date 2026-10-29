import { useRef, type ReactNode } from 'react';
import { PlayCircleOutlined, SettingOutlined, UserAddOutlined } from '@ant-design/icons';
import { motion, useInView } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { fadeUp, SectionHeading, stagger } from './shared';

/**
 * "Qanday ishlaydi" — uch qadam: ikonka, raqam, qancha vaqt olishi. Qadamlarni
 * bo'lim ekranga kirganda chiziladigan oltin chiziq bog'laydi (telefonda tik).
 */

const STEPS: { key: string; icon: ReactNode }[] = [
  { key: 'step1', icon: <UserAddOutlined /> },
  { key: 'step2', icon: <SettingOutlined /> },
  { key: 'step3', icon: <PlayCircleOutlined /> },
];

const HowItWorks = () => {
  const { t } = useTranslation();
  const ref = useRef<HTMLOListElement>(null);
  const visible = useInView(ref, { once: true, amount: 0.35 });

  return (
    <section id="how" className="lp-section">
      <div className="lp-container">
        <SectionHeading overline={t('landing.howOverline')} title={t('landing.howTitle')} />
        <motion.ol
          ref={ref}
          className={`lp-steps${visible ? ' is-visible' : ''}`}
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
        >
          <span className="lp-steps__rail" aria-hidden />
          {STEPS.map((step, index) => (
            <motion.li key={step.key} variants={fadeUp} className="lp-step">
              <span className="lp-step__badge" aria-hidden>
                {step.icon}
                <b>{index + 1}</b>
              </span>
              <span className="lp-step__time">{t(`landing.${step.key}Time`)}</span>
              <h3>{t(`landing.${step.key}Title`)}</h3>
              <p>{t(`landing.${step.key}Desc`)}</p>
            </motion.li>
          ))}
        </motion.ol>
        <motion.p
          className="lp-steps__note"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.5 }}
        >
          {t('landing.howNote')}
        </motion.p>
      </div>
    </section>
  );
};

export default HowItWorks;
