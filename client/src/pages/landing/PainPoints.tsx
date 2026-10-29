import type { ReactNode } from 'react';
import {
  BarChartOutlined,
  BookOutlined,
  BulbOutlined,
  CheckCircleFilled,
  CoffeeOutlined,
  FieldTimeOutlined,
  MobileOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { fadeUp, SectionHeading, spotlightMove, stagger } from './shared';

/**
 * "Tanish holatmi?" — klub egasining kundalik og'riqlari va tizimdagi yechimi.
 * Har karta: muammo (qizg'ish) -> yechim (yashil belgi bilan).
 */
const PAINS: { key: string; icon: ReactNode }[] = [
  { key: 'pain1', icon: <BulbOutlined /> },
  { key: 'pain2', icon: <BookOutlined /> },
  { key: 'pain3', icon: <FieldTimeOutlined /> },
  { key: 'pain4', icon: <CoffeeOutlined /> },
  { key: 'pain5', icon: <MobileOutlined /> },
  { key: 'pain6', icon: <BarChartOutlined /> },
];

const PainPoints = () => {
  const { t } = useTranslation();
  return (
    <section id="problems" className="lp-section">
      <div className="lp-container">
        <SectionHeading
          overline={t('landing.painOverline')}
          title={t('landing.painTitle')}
          subtitle={t('landing.painSubtitle')}
        />
        <motion.div
          className="lp-pain-grid"
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.1 }}
          onPointerMove={spotlightMove('.lp-pain-card')}
        >
          {PAINS.map(({ key, icon }) => (
            <motion.article key={key} className="lp-pain-card" variants={fadeUp}>
              <div className="lp-pain-card__problem">
                <span className="lp-pain-card__icon" aria-hidden>
                  {icon}
                </span>
                <div>
                  <h3>{t(`landing.${key}Title`)}</h3>
                  <p>{t(`landing.${key}Desc`)}</p>
                </div>
              </div>
              <div className="lp-pain-card__solution">
                <CheckCircleFilled aria-hidden />
                <span>{t(`landing.${key}Fix`)}</span>
              </div>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default PainPoints;
