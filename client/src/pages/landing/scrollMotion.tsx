import { useRef, type ReactNode } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';

/**
 * Scroll bilan bog'langan harakatlar (Apple uslubida). Hammasi faqat
 * transform + opacity — layout o'qilmaydi, React qayta chizmaydi (MotionValue).
 * "Harakatni kamaytirish" yoqilgan qurilmada — oddiy, harakatsiz ko'rinish.
 */

/**
 * TILT-IN: element pastdan, ekranga "yotgan" holatda (rotateX) chiqadi va
 * scroll bilan tekislanib, kattalashib joyiga keladi — xuddi ekran ochilayotgandek.
 * Ref TASHQI (transformsiz) o'ramda: o'lchov transformga bog'liq bo'lmasin.
 */
export const TiltIn = ({ children, className }: { children: ReactNode; className?: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'start 0.18'] });
  const rotateX = useTransform(scrollYProgress, [0, 1], [26, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.84, 1]);
  const y = useTransform(scrollYProgress, [0, 1], [90, 0]);
  const opacity = useTransform(scrollYProgress, [0, 0.35], [0.35, 1]);

  if (reduce) return <div className={className}>{children}</div>;
  return (
    <div ref={ref} className={className} style={{ perspective: 1600, perspectiveOrigin: '50% 0%' }}>
      <motion.div style={{ rotateX, scale, y, opacity, transformOrigin: '50% 0%', willChange: 'transform' }}>
        {children}
      </motion.div>
    </div>
  );
};

/**
 * PARALLAX: element scroll bilan sekinroq/tezroq siljiydi (chuqurlik hissi).
 * `distance` — butun o'tish davomida necha piksel.
 */
export const Parallax = ({
  children,
  className,
  distance = 80,
}: {
  children: ReactNode;
  className?: string;
  distance?: number;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [distance, -distance]);
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <div ref={ref} className={className}>
      <motion.div style={{ y }}>{children}</motion.div>
    </div>
  );
};
