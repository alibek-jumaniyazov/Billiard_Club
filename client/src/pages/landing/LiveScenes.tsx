import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { TOKENS } from '../../theme/tokens';
import { fadeUp, formatHms, hexToRgba, SectionHeading, stagger } from './shared';

const { gold, emerald, text, wood, ivory, semantic, bg, border } = TOKENS.color;

/**
 * "KO'Z BILAN KO'RING" — mahsulotning to'rtta asosiy jarayoni rasmli
 * (SVG) animatsiyada: chiroq o'zi yonadi, internet uzilsa ham ishlaydi,
 * har so'm chekka tushadi, telefon va kompyuter bir xil holatni ko'radi.
 *
 * Har sahna BOSQICHLAR (phase) bilan aylanadi va faqat ekranda ko'rinib
 * turganda yuradi (useInView) — sahifa pastida turgan animatsiya CPU ni
 * band qilmaydi. prefers-reduced-motion: eng ma'noli bitta kadr statik.
 */

/** Bosqichlar aylanishi: `durations[i]` ms dan keyin keyingi bosqich */
const usePhases = (durations: readonly number[], active: boolean): number => {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const timer = setTimeout(() => setPhase((p) => (p + 1) % durations.length), durations[phase]);
    return () => clearTimeout(timer);
  }, [phase, active, durations]);
  return phase;
};

/** Faol bosqichda soniya hisoblagich (sahnadagi taymer uchun) */
const useTicker = (running: boolean, stepMs = 250, perStep = 1): number => {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!running) {
      setValue(0);
      return undefined;
    }
    const timer = setInterval(() => setValue((v) => v + perStep), stepMs);
    return () => clearInterval(timer);
  }, [running, stepMs, perStep]);
  return value;
};

interface SceneProps {
  /** Animatsiya yursinmi (ko'rinib turibdi va harakat cheklanmagan) */
  play: boolean;
  /** Harakat cheklangan — statik kadr */
  still: boolean;
  label: (key: string, params?: Record<string, unknown>) => string;
}

const MONO = 'var(--font-mono)';
const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.35 } };

/* ------------------------------------------------------------- 1. Chiroq */

const LIGHT_PHASES = [1800, 900, 3400, 1500] as const;

const LightsScene = ({ play, still, label }: SceneProps) => {
  const cycle = usePhases(LIGHT_PHASES, play);
  const phase = still ? 2 : cycle;
  const lit = phase === 2;
  const seconds = useTicker(play && lit, 120, 7);

  const chip =
    phase === 0
      ? { text: label('sceneLightsIdle'), fg: text.secondary, bg: bg.bg3 }
      : phase === 1
        ? { text: label('sceneLightsStart'), fg: gold.contrast, bg: gold.base }
        : phase === 2
          ? { text: `${label('sceneLightsOn')} · ${formatHms(seconds).slice(3)}`, fg: emerald.glow, bg: hexToRgba(emerald.glow, 0.12) }
          : { text: label('sceneLightsOff'), fg: semantic.warning, bg: hexToRgba(semantic.warning, 0.12) };

  return (
    <svg viewBox="0 0 320 200" role="img" aria-label={label('sceneLightsTitle')}>
      <defs>
        <linearGradient id="ls-cone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff1c2" stopOpacity="0.42" />
          <stop offset="1" stopColor="#fff1c2" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="ls-felt" cx="0.5" cy="0.4" r="0.7">
          <stop offset="0" stopColor={emerald.bright} />
          <stop offset="1" stopColor={emerald.deep} />
        </radialGradient>
      </defs>
      {/* Lampa simi va qalpog'i */}
      <line x1="160" y1="0" x2="160" y2="34" stroke={border.strong} strokeWidth="2" />
      <motion.path
        d="M126 52 L194 52 L180 34 L140 34 Z"
        animate={{ fill: lit ? '#f6e3a4' : '#2a302c' }}
        transition={{ duration: 0.3 }}
      />
      {/* Yorug'lik konusi */}
      <motion.polygon
        points="128,52 192,52 270,150 50,150"
        fill="url(#ls-cone)"
        animate={{ opacity: lit ? 1 : 0 }}
        transition={{ duration: 0.45 }}
      />
      {/* Stol: yog'och bort, mato, cho'ntaklar, sharlar */}
      <rect x="38" y="122" width="244" height="64" rx="12" fill={wood.base} />
      <rect x="48" y="130" width="224" height="48" rx="5" fill="url(#ls-felt)" />
      {[
        [50, 132], [160, 129], [270, 132], [50, 176], [160, 179], [270, 176],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="5" fill="#050807" />
      ))}
      {[
        [196, 150], [205, 145], [205, 155], [214, 140], [214, 150], [214, 160],
      ].map(([cx, cy]) => (
        <circle key={`b${cx}-${cy}`} cx={cx} cy={cy} r="4.3" fill={ivory} />
      ))}
      <circle cx="104" cy="153" r="4.3" fill="#d23b30" />
      {/* Chiroq o'chiq — mato qorong'i */}
      <motion.rect
        x="48" y="130" width="224" height="48" rx="5" fill="#000"
        animate={{ opacity: lit ? 0 : 0.55 }}
        transition={{ duration: 0.45 }}
      />
      {/* Holat belgisi (kassa ekranidagidek) */}
      <AnimatePresence mode="wait">
        <motion.g key={phase} {...fade}>
          <rect x="16" y="14" width={Math.max(104, chip.text.length * 6.4 + 22)} height="24" rx="12" fill={chip.bg} />
          <text x="28" y="30" fontSize="11" fontWeight="600" fill={chip.fg} fontFamily={phase === 2 ? MONO : undefined}>
            {chip.text}
          </text>
        </motion.g>
      </AnimatePresence>
      {/* Boshlash bosilgan payt — barmoq teginishi to'lqini */}
      {phase === 1 && !still && (
        <motion.circle
          cx="66" cy="26" r="6" fill="none" stroke={gold.hover} strokeWidth="2"
          initial={{ r: 4, opacity: 0.9 }}
          animate={{ r: 22, opacity: 0 }}
          transition={{ duration: 0.8 }}
        />
      )}
    </svg>
  );
};

/* ---------------------------------------------------- 2. Oflayn navbat */

const OFFLINE_PHASES = [1600, 3200, 2000, 1800] as const;

const WifiIcon = ({ x, y, ok }: { x: number; y: number; ok: boolean }) => {
  const color = ok ? emerald.glow : text.tertiary;
  return (
    <g transform={`translate(${x} ${y})`} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
      <path d="M-10 -2 A14 14 0 0 1 10 -2" />
      <path d="M-6 2 A8 8 0 0 1 6 2" />
      <circle cx="0" cy="6" r="1.6" fill={color} stroke="none" />
      {!ok && <line x1="-11" y1="-8" x2="11" y2="10" stroke={semantic.error} strokeWidth="2.2" />}
    </g>
  );
};

const OfflineScene = ({ play, still, label }: SceneProps) => {
  const cycle = usePhases(OFFLINE_PHASES, play);
  const phase = still ? 1 : cycle;
  const offline = phase === 1;
  const items = [label('sceneOfflineItem1'), label('sceneOfflineItem2'), label('sceneOfflineItem3')];

  const status =
    phase === 0
      ? { text: label('sceneOfflineOnline'), color: emerald.glow }
      : phase === 1
        ? { text: label('sceneOfflineQueued', { count: 3 }), color: semantic.warning }
        : phase === 2
          ? { text: label('sceneOfflineSending'), color: gold.base }
          : { text: label('sceneOfflineSent'), color: emerald.glow };

  return (
    <svg viewBox="0 0 320 200" role="img" aria-label={label('sceneOfflineTitle')}>
      {/* Kassa (planshet) */}
      <rect x="20" y="22" width="160" height="150" rx="14" fill={bg.bg2} stroke={border.strong} />
      <text x="34" y="44" fontSize="11" fontWeight="700" fill={text.primary}>{label('sceneOfflineCashier')}</text>
      <WifiIcon x={160} y={38} ok={phase !== 1} />
      {/* Navbatdagi amallar */}
      {items.map((item, i) => {
        const shown = phase === 1 || phase === 2 || still;
        const flying = phase === 2 && !still;
        return (
          <motion.g
            key={item}
            initial={false}
            animate={{
              opacity: shown ? (flying ? 0 : 1) : 0,
              x: flying ? 150 : shown ? 0 : -12,
              y: flying ? 70 - i * 32 : 0,
            }}
            transition={{ duration: flying ? 0.7 : 0.35, delay: flying ? i * 0.25 : phase === 1 ? i * 0.7 : 0 }}
          >
            <rect x="32" y={58 + i * 32} width="136" height="24" rx="8" fill={bg.bg3} stroke={border.base} />
            <circle cx="44" cy={70 + i * 32} r="3.2" fill={semantic.warning} />
            <text x="54" y={74 + i * 32} fontSize="10.5" fill={text.secondary}>{item}</text>
          </motion.g>
        );
      })}
      {/* Server (bulut) */}
      <motion.g animate={{ scale: phase === 3 ? 1.06 : 1 }} style={{ transformOrigin: '262px 104px' }}>
        <path
          d="M236 120 h56 a16 16 0 0 0 -4 -31 a22 22 0 0 0 -41 -6 a15 15 0 0 0 -11 37 z"
          fill={phase === 3 ? hexToRgba(emerald.glow, 0.16) : bg.bg2}
          stroke={phase === 3 ? emerald.glow : border.strong}
          strokeWidth="1.5"
        />
        <AnimatePresence>
          {phase === 3 && (
            <motion.path
              d="M252 104 l7 7 l13 -14"
              fill="none" stroke={emerald.glow} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
            />
          )}
        </AnimatePresence>
      </motion.g>
      {/* Ulanish chizig'i */}
      <line x1="184" y1="104" x2="232" y2="104" stroke={offline ? semantic.error : border.strong} strokeDasharray="4 5" strokeWidth="1.5" />
      {/* Holat qatori */}
      <AnimatePresence mode="wait">
        <motion.text key={phase} x="20" y="192" fontSize="11.5" fontWeight="600" fill={status.color} {...fade}>
          {status.text}
        </motion.text>
      </AnimatePresence>
    </svg>
  );
};

/* -------------------------------------------------------- 3. Chek va pul */

const MONEY_PHASES = [2000, 2600, 1800] as const;
const BARS = [52, 70, 61, 84, 76] as const;

const MoneyScene = ({ play, still, label }: SceneProps) => {
  const cycle = usePhases(MONEY_PHASES, play);
  const phase = still ? 2 : cycle;
  const grown = phase >= 1;
  const today = useTicker(play && phase === 1, 80, 1);
  const todayValue = 1_240_000 + (still || phase === 2 ? 32_000 : Math.min(32_000, today * 1_000));

  // [nom, summa, ixtiyoriy kichik izoh] — tor chekda vaqt alohida qatorda
  const rows: Array<[string, string, string?]> = [
    [label('sceneMoneyTable'), '20 000', '1:20:00'],
    [label('sceneMoneyBar'), '12 000'],
  ];

  return (
    <svg viewBox="0 0 320 200" role="img" aria-label={label('sceneMoneyTitle')}>
      <defs>
        <clipPath id="ms-paper"><rect x="40" y="52" width="112" height="132" /></clipPath>
      </defs>
      {/* Chek printeri */}
      <rect x="28" y="30" width="136" height="26" rx="8" fill={bg.bg3} stroke={border.strong} />
      <rect x="44" y="50" width="104" height="3" rx="1.5" fill="#050807" />
      <circle cx="148" cy="43" r="3" fill={phase === 0 ? emerald.glow : text.tertiary} />
      {/* Chek qog'ozi — printerdan chiqadi */}
      <g clipPath="url(#ms-paper)">
        <motion.g
          initial={false}
          animate={{ y: phase === 0 && !still ? [-130, 0] : 0 }}
          transition={{ duration: 1.6, ease: 'easeOut' }}
        >
          <rect x="48" y="52" width="96" height="126" fill={ivory} />
          <text x="96" y="72" fontSize="10" fontWeight="700" textAnchor="middle" fill="#2b2418">Billiard Club</text>
          <text x="96" y="85" fontSize="8.5" textAnchor="middle" fill="#6b6150">{label('sceneMoneyReceipt')}</text>
          {rows.map(([name, value, note], i) => (
            <g key={name}>
              <text x="56" y={100 + i * 20} fontSize="9" fill="#3d3526">{name}</text>
              <text x="136" y={100 + i * 20} fontSize="9" textAnchor="end" fill="#3d3526" fontFamily={MONO}>{value}</text>
              {note && <text x="56" y={109 + i * 20} fontSize="7.5" fill="#857a66" fontFamily={MONO}>{note}</text>}
            </g>
          ))}
          <line x1="56" y1="132" x2="136" y2="132" stroke="#b9ad94" strokeDasharray="3 3" />
          <text x="56" y="148" fontSize="10" fontWeight="700" fill="#2b2418">{label('sceneMoneyTotal')}</text>
          <text x="136" y="148" fontSize="10" fontWeight="700" textAnchor="end" fill="#2b2418" fontFamily={MONO}>32 000</text>
          <path d="M48 178 l6 -5 l6 5 l6 -5 l6 5 l6 -5 l6 5 l6 -5 l6 5 l6 -5 l6 5 l6 -5 l6 5 l6 -5 l6 5 l6 -5 l6 5 V178 Z" fill={bg.bg1} />
        </motion.g>
      </g>
      {/* Kunlik tushum grafigi */}
      <text x="186" y="40" fontSize="10.5" fill={text.tertiary}>{label('sceneMoneyToday')}</text>
      <text x="186" y="60" fontSize="15" fontWeight="700" fill={gold.base} fontFamily={MONO}>
        {todayValue.toLocaleString('ru-RU').replace(/,/g, ' ')}
      </text>
      {BARS.map((h, i) => {
        const last = i === BARS.length - 1;
        const height = last ? (grown ? h : 20) : h;
        return (
          <motion.rect
            key={i}
            x={188 + i * 22}
            width="14"
            rx="3"
            initial={false}
            animate={{ y: 176 - height, height }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
            fill={last ? gold.base : hexToRgba(emerald.bright, 0.55)}
          />
        );
      })}
      <line x1="182" y1="177" x2="304" y2="177" stroke={border.base} />
    </svg>
  );
};

/* ------------------------------------------- 4. Telefon + kompyuter sinxron */

const SYNC_PHASES = [1500, 1400, 2600, 900] as const;

const MiniTable = ({ x, y, w, h, busy }: { x: number; y: number; w: number; h: number; busy: boolean }) => (
  <g>
    <rect x={x} y={y} width={w} height={h} rx="4" fill={wood.base} />
    <motion.rect
      x={x + 3} y={y + 3} width={w - 6} height={h - 6} rx="2"
      initial={false}
      animate={{ fill: busy ? emerald.bright : '#123524', opacity: busy ? 1 : 0.55 }}
      transition={{ duration: 0.4 }}
    />
  </g>
);

const SyncScene = ({ play, still, label }: SceneProps) => {
  const cycle = usePhases(SYNC_PHASES, play);
  const phase = still ? 2 : cycle;
  // Stol 2: kompyuterda hisob-kitob qilindi (1-bosqich) → telefonda ham bo'sh (2-bosqich)
  const laptopBusy2 = phase === 0;
  const phoneBusy2 = phase === 0 || phase === 1;

  return (
    <svg viewBox="0 0 320 200" role="img" aria-label={label('sceneSyncTitle')}>
      {/* Noutbuk */}
      <rect x="16" y="34" width="176" height="112" rx="9" fill={bg.bg2} stroke={border.strong} />
      <path d="M6 154 h196 l-10 10 h-176 z" fill={bg.bg3} stroke={border.strong} />
      <MiniTable x={30} y={50} w={70} h={40} busy />
      <MiniTable x={108} y={50} w={70} h={40} busy={laptopBusy2} />
      <MiniTable x={30} y={96} w={70} h={40} busy={false} />
      <MiniTable x={108} y={96} w={70} h={40} busy />
      <text x="143" y="74" fontSize="10" fontWeight="700" textAnchor="middle" fill={laptopBusy2 ? text.primary : text.tertiary}>2</text>
      {/* Telefon */}
      <rect x="230" y="22" width="78" height="160" rx="14" fill={bg.bg2} stroke={border.strong} />
      <rect x="258" y="28" width="22" height="4" rx="2" fill={border.strong} />
      {[0, 1, 2, 3].map((i) => (
        <MiniTable key={i} x={240} y={60 + i * 28} w={58} h={22} busy={i === 1 ? phoneBusy2 : i !== 2} />
      ))}
      {/* Ma'lumot oqimi */}
      <line x1="196" y1="96" x2="226" y2="96" stroke={border.strong} strokeDasharray="3 4" />
      {phase === 1 && !still && (
        <motion.circle
          cy="96" r="4" fill={gold.base}
          initial={{ cx: 196, opacity: 1 }}
          animate={{ cx: 226, opacity: 0.2 }}
          transition={{ duration: 0.8, repeat: 1 }}
        />
      )}
      {/* Telefondagi bildirishnoma */}
      <AnimatePresence>
        {phase === 2 && (
          <motion.g
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35 }}
          >
            <rect x="196" y="4" width="118" height="44" rx="10" fill={bg.bg3} stroke={gold.line} />
            <text x="206" y="21" fontSize="9.5" fontWeight="700" fill={text.primary}>{label('sceneSyncNotifyTitle')}</text>
            <text x="206" y="37" fontSize="9.5" fill={gold.base} fontFamily={MONO}>45 000 {label('sceneSyncCurrency')}</text>
          </motion.g>
        )}
      </AnimatePresence>
    </svg>
  );
};

/* ------------------------------------------------------------- Bo'lim */

const SCENES = [
  { key: 'sceneLights', Component: LightsScene },
  { key: 'sceneOffline', Component: OfflineScene },
  { key: 'sceneMoney', Component: MoneyScene },
  { key: 'sceneSync', Component: SyncScene },
] as const;

/** Bitta sahna kartasi: o'zi ko'rinib turganda o'ynaydi */
const SceneCard = ({ sceneKey, children }: { sceneKey: string; children: (play: boolean) => ReactNode }) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.35 });
  return (
    <motion.article variants={fadeUp} className="lp-scene">
      <div ref={ref} className="lp-scene__stage">{children(inView)}</div>
      <h3>{t(`landing.${sceneKey}Title`)}</h3>
      <p>{t(`landing.${sceneKey}Desc`)}</p>
    </motion.article>
  );
};

const LiveScenes = () => {
  const { t } = useTranslation();
  const reduce = useReducedMotion() ?? false;
  const label = (key: string, params?: Record<string, unknown>) => t(`landing.${key}`, params);

  return (
    <section id="scenes" className="lp-section">
      <div className="lp-container">
        <SectionHeading
          overline={t('landing.scenesOverline')}
          title={t('landing.scenesTitle')}
          subtitle={t('landing.scenesSubtitle')}
        />
        <motion.div
          className="lp-scenes"
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.1 }}
        >
          {SCENES.map(({ key, Component }) => (
            <SceneCard key={key} sceneKey={key}>
              {(inView) => <Component play={inView && !reduce} still={reduce} label={label} />}
            </SceneCard>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default LiveScenes;
