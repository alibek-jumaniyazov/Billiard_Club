import { useEffect, useState } from 'react';
import { Button } from 'antd';
import { ArrowRightOutlined, CheckOutlined, SendOutlined } from '@ant-design/icons';
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { SUPPORT_TELEGRAM } from '../../constants';
import { fadeUp } from './shared';

/** Sahifa oxiridagi yakuniy chaqiriq — qaror qabul qilgan mehmon uchun */
export const FinalCta = ({ onStart }: { onStart: () => void }) => {
  const { t } = useTranslation();
  return (
    <section className="lp-section lp-final">
      <div className="lp-container">
        <motion.div
          className="lp-final__card"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
        >
          <div className="lp-final__glow" aria-hidden />
          <h2>{t('landing.finalTitle')}</h2>
          <p>{t('landing.finalSubtitle')}</p>
          <ul className="lp-final__points">
            {['finalP1', 'finalP2', 'finalP3'].map((k) => (
              <li key={k}>
                <CheckOutlined aria-hidden /> {t(`landing.${k}`)}
              </li>
            ))}
          </ul>
          <div className="lp-final__actions">
            <Button type="primary" size="large" className="lp-cta-btn lp-final__cta" onClick={onStart}>
              {t('landing.heroCta')} <ArrowRightOutlined />
            </Button>
            <Button
              size="large"
              className="lp-outline-btn lp-final__cta"
              icon={<SendOutlined />}
              href={SUPPORT_TELEGRAM}
              target="_blank"
              rel="noreferrer noopener"
            >
              {t('landing.finalTelegram')}
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

/**
 * Yopishqoq CTA:
 *  - telefonda: hero'dan o'tilgach pastda "Telegram + Bepul boshlash" paneli;
 *  - kompyuterda: o'ng pastki burchakda Telegram tugmasi.
 * Sahifa oxiridagi yakuniy CTA ko'ringanda (u allaqachon ekranda) yashirinadi.
 */
export const StickyCta = ({ onStart }: { onStart: () => void }) => {
  const { t } = useTranslation();
  const { scrollY } = useScroll();
  const [past, setPast] = useState(false);
  const [nearEnd, setNearEnd] = useState(false);

  useMotionValueEvent(scrollY, 'change', (y) => setPast(y > 640));

  useEffect(() => {
    const target = document.querySelector('.lp-final');
    if (!target || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setNearEnd(entry.isIntersecting), {
      rootMargin: '0px 0px -10% 0px',
    });
    io.observe(target);
    return () => io.disconnect();
  }, []);

  const visible = past && !nearEnd;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="sticky"
          className="lp-sticky"
          initial={{ y: 90, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 90, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <a
            className="lp-sticky__tg"
            href={SUPPORT_TELEGRAM}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={t('landing.finalTelegram')}
          >
            <SendOutlined />
          </a>
          <Button type="primary" size="large" className="lp-cta-btn lp-sticky__cta" onClick={onStart}>
            {t('landing.navCta')} <ArrowRightOutlined />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
