import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { TOKENS } from '../../theme/tokens';

interface PageTransitionProps {
  children: ReactNode;
}

/**
 * Sahifa kirish animatsiyasi — yumshoq fade + ozgina ko'tarilish.
 * prefers-reduced-motion yoqilgan bo'lsa animatsiyasiz render qiladi.
 *
 * ```tsx
 * <PageTransition>
 *   <PageHeader ... />
 *   ...
 * </PageTransition>
 * ```
 */
const PageTransition = ({ children }: PageTransitionProps) => {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) return <>{children}</>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: TOKENS.motion.duration.base,
        ease: TOKENS.motion.easing.out,
      }}
    >
      {children}
    </motion.div>
  );
};

export default PageTransition;
