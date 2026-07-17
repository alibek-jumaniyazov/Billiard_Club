interface AnimatedBackgroundProps {
  /**
   * 'aurora' — 3 ta to'liq intensivlikdagi nur dog'i (landing / auth sahifalar);
   * 'subtle' — 2 ta xira dog' (ilova ichidagi fonlar, chalg'itmaydi).
   */
  variant?: 'aurora' | 'subtle';
  /** Nozik donadorlik (grain) teksturasini qo'shish */
  withGrain?: boolean;
}

/**
 * Animatsion aurora fon — sekin suzuvchi, kuchli blur qilingan nur dog'lari.
 *
 * Butunlay CSS bilan ishlaydi (index.css dagi .aurora-* klasslar), JS taymer
 * yo'q; faqat transform/opacity animatsiya qilinadi va prefers-reduced-motion
 * rejimida statik gradientga aylanadi.
 *
 * MUHIM: ota element `position: relative` bo'lishi kerak — qatlam absolute
 * joylashadi. Ustidagi kontentga `position: relative; z-index: 1` bering
 * (auth-page uchun bu index.css da avtomatik qilingan).
 */
const AnimatedBackground = ({
  variant = 'aurora',
  withGrain = false,
}: AnimatedBackgroundProps) => (
  <div
    aria-hidden="true"
    className={variant === 'subtle' ? 'aurora-bg aurora-bg--subtle' : 'aurora-bg'}
  >
    <div className="aurora-blob aurora-blob-1" />
    <div className="aurora-blob aurora-blob-2" />
    {variant === 'aurora' && <div className="aurora-blob aurora-blob-3" />}
    {withGrain && <div className="grain-overlay" />}
  </div>
);

export default AnimatedBackground;
