import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { Button, Input, Segmented, Space, Tag, Typography } from 'antd';
import {
  AimOutlined,
  LogoutOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { GlassCard, PageHeader, PageTransition } from '../../components/ui';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { TOKENS } from '../../theme/tokens';
import { BilliardEngine } from './engine';
import {
  applyShot,
  createGame,
  rackSpecs,
  remainingByGroup,
  RUSSIAN_TARGET,
  type GameState,
  type GameType,
} from './rules';

const { Title, Text } = Typography;
const { gold, emerald, text, bg, border, semantic } = TOKENS.color;

type Phase = 'setup' | 'playing';
type Mode = 'aim' | 'ballInHand';

interface Interact {
  pointer: { x: number; y: number; inside: boolean };
  charging: boolean;
  chargeT: number;
  power: number;
  mode: Mode;
  english: { x: number; y: number };
}

/** Quvvat (0..1) → kiy soqqasi tezligi (piksel/kadr) */
const powerToVel = (engine: BilliardEngine, power: number) => engine.r * (0.8 + power * 1.95);

const BilliardGame = () => {
  const { t } = useTranslation();
  useDocumentHead('game.docTitle', 'game.docDesc');

  const [phase, setPhase] = useState<Phase>('setup');
  const [gameType, setGameType] = useState<GameType>('russian');
  const [name1, setName1] = useState('');
  const [name2, setName2] = useState('');
  const [game, setGameState] = useState<GameState | null>(null);
  const [round, setRound] = useState(0);
  const [spin, setSpin] = useState({ x: 0, y: 0 });

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const powerFillRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<BilliardEngine | null>(null);
  const gameRef = useRef<GameState | null>(null);
  const interactRef = useRef<Interact>({
    pointer: { x: 0, y: 0, inside: false },
    charging: false,
    chargeT: 0,
    power: 0,
    mode: 'aim',
    english: { x: 0, y: 0 },
  });

  const applyGame = useCallback((next: GameState) => {
    gameRef.current = next;
    setGameState(next);
  }, []);

  // Spin (ingliz) — control qiymatini loop o'qishi uchun ref ga ko'chiramiz
  useEffect(() => {
    interactRef.current.english = spin;
  }, [spin]);

  const startGame = useCallback(() => {
    const g = createGame(
      gameType,
      name1.trim() || t('game.player1Default'),
      name2.trim() || t('game.player2Default'),
    );
    applyGame(g);
    setSpin({ x: 0, y: 0 });
    setPhase('playing');
    setRound((r) => r + 1);
  }, [gameType, name1, name2, t, applyGame]);

  const newRound = useCallback(() => {
    const cur = gameRef.current;
    if (!cur) return;
    applyGame(createGame(cur.type, cur.players[0].name, cur.players[1].name));
    setSpin({ x: 0, y: 0 });
    setRound((r) => r + 1);
  }, [applyGame]);

  const exitGame = useCallback(() => {
    setPhase('setup');
    setGameState(null);
    gameRef.current = null;
  }, []);

  // ------------------------------------------------ O'yin sikli (canvas + rAF)
  useEffect(() => {
    if (phase !== 'playing') return;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const engine = new BilliardEngine();
    // Variant geometriyasi (shar/lyuza o'lchamlari) — setSize dan OLDIN
    engine.setVariant(gameRef.current?.type ?? 'russian');
    engineRef.current = engine;
    const S = interactRef.current;
    S.charging = false;
    S.chargeT = 0;
    S.power = 0;
    S.pointer = { x: 0, y: 0, inside: false };
    S.mode = 'aim';

    let raf = 0;
    let prev = 0;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      engine.setSize(w, h);
    };

    resize();
    engine.rack(rackSpecs(gameRef.current?.type ?? 'russian'));
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const drawCueGhost = (px: number, py: number) => {
      const ok = engine.validCuePlacement(px, py);
      ctx.beginPath();
      ctx.arc(px, py, engine.r, 0, Math.PI * 2);
      ctx.fillStyle = ok ? 'rgba(244,239,228,0.75)' : 'rgba(217,84,77,0.35)';
      ctx.fill();
      ctx.strokeStyle = ok ? 'rgba(75,212,140,0.9)' : 'rgba(217,84,77,0.9)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    };

    const loop = (ts: number) => {
      if (!prev) prev = ts;
      let dt = (ts - prev) / 16.6667;
      prev = ts;
      if (dt > 3) dt = 3;

      // Quvvat o'lchagich (uch burchak to'lqin: 0→1→0)
      if (S.charging) {
        S.chargeT += dt;
        const sec = (S.chargeT * 16.6667) / 1000;
        const period = 1.15;
        const ph = (sec % period) / period;
        S.power = ph < 0.5 ? ph * 2 : 2 - ph * 2;
      }
      if (powerFillRef.current) {
        powerFillRef.current.style.height = `${Math.round((S.charging ? S.power : 0) * 100)}%`;
      }

      engine.step(dt);
      engine.draw(ctx);

      const cur = gameRef.current;
      if (cur && !cur.gameOver) {
        if (S.mode === 'aim' && engine.canAim() && S.pointer.inside) {
          engine.drawAim(ctx, S.pointer.x, S.pointer.y, S.power, S.charging);
        } else if (S.mode === 'ballInHand' && S.pointer.inside) {
          drawCueGhost(S.pointer.x, S.pointer.y);
        }
      }

      // Zarba yakunlanib, natija tayyor bo'lsa — qoidalarni qo'llaymiz
      const res = engine.takeResult();
      if (res && cur && !cur.gameOver) {
        const next = applyShot(cur, res);
        applyGame(next);
        S.mode = next.ballInHand ? 'ballInHand' : 'aim';
      }

      raf = requestAnimationFrame(loop);
    };

    // -------- Pointer
    const toLocal = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onMove = (e: PointerEvent) => {
      const p = toLocal(e);
      S.pointer.x = p.x;
      S.pointer.y = p.y;
      S.pointer.inside = true;
    };
    const onLeave = () => {
      S.pointer.inside = false;
      if (S.charging) {
        S.charging = false;
        S.chargeT = 0;
        S.power = 0;
      }
    };
    const onDown = (e: PointerEvent) => {
      const p = toLocal(e);
      S.pointer.x = p.x;
      S.pointer.y = p.y;
      S.pointer.inside = true;
      const cur = gameRef.current;
      if (!cur || cur.gameOver) return;

      if (S.mode === 'ballInHand') {
        if (engine.validCuePlacement(p.x, p.y)) {
          engine.placeCue(p.x, p.y);
          S.mode = 'aim';
          applyGame({ ...cur, ballInHand: false });
        }
        return;
      }
      if (S.mode === 'aim' && engine.canAim()) {
        S.charging = true;
        S.chargeT = 0;
        S.power = 0;
      }
    };
    const onUp = () => {
      if (!S.charging) return;
      S.charging = false;
      const cue = engine.cue;
      if (cue && engine.canAim()) {
        const dx = S.pointer.x - cue.x;
        const dy = S.pointer.y - cue.y;
        engine.beginShot(dx, dy, powerToVel(engine, Math.max(0.12, S.power)), S.english);
      }
      S.chargeT = 0;
      S.power = 0;
      if (powerFillRef.current) powerFillRef.current.style.height = '0%';
    };

    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onLeave);

    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onLeave);
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, round]);

  /* ================================================================ SETUP */
  if (phase === 'setup') {
    return (
      <PageTransition>
        <PageHeader
          icon={<AimOutlined />}
          title={t('game.title')}
          subtitle={t('game.subtitle')}
        />
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <GlassCard padding={TOKENS.spacing.xl}>
            <Text style={{ color: text.tertiary, fontSize: 12, letterSpacing: 1, fontWeight: 700 }}>
              {t('game.chooseRule').toUpperCase()}
            </Text>
            <div style={{ marginTop: 10, marginBottom: 20 }}>
              <Segmented
                block
                size="large"
                value={gameType}
                onChange={(v) => setGameType(v as GameType)}
                options={[
                  { label: t('game.ruleRussian'), value: 'russian' },
                  { label: t('game.ruleAmerican'), value: 'american' },
                ]}
              />
              <Text style={{ display: 'block', marginTop: 10, color: text.secondary, fontSize: 13 }}>
                {gameType === 'russian' ? t('game.ruleRussianDesc') : t('game.ruleAmericanDesc')}
              </Text>
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 220px' }}>
                <Text style={{ fontSize: 12, color: text.tertiary }}>{t('game.player1')}</Text>
                <Input
                  size="large"
                  maxLength={20}
                  value={name1}
                  placeholder={t('game.player1Default')}
                  onChange={(e) => setName1(e.target.value)}
                  prefix={<span style={{ color: gold.base, fontWeight: 800 }}>1</span>}
                  onPressEnter={startGame}
                />
              </div>
              <div style={{ flex: '1 1 220px' }}>
                <Text style={{ fontSize: 12, color: text.tertiary }}>{t('game.player2')}</Text>
                <Input
                  size="large"
                  maxLength={20}
                  value={name2}
                  placeholder={t('game.player2Default')}
                  onChange={(e) => setName2(e.target.value)}
                  prefix={<span style={{ color: semantic.info, fontWeight: 800 }}>2</span>}
                  onPressEnter={startGame}
                />
              </div>
            </div>

            <Button
              type="primary"
              size="large"
              icon={<PlayCircleOutlined />}
              onClick={startGame}
              style={{ marginTop: 22, width: '100%', height: 48, fontWeight: 700 }}
            >
              {t('game.start')}
            </Button>

            <div
              style={{
                marginTop: 22,
                padding: 16,
                borderRadius: TOKENS.radius.md,
                background: 'rgba(0,0,0,0.18)',
                border: `1px solid ${border.subtle}`,
              }}
            >
              <Text strong style={{ color: gold.base, fontSize: 13 }}>
                {t('game.howToTitle')}
              </Text>
              <ul style={{ margin: '8px 0 0', paddingInlineStart: 18, color: text.secondary, fontSize: 13, lineHeight: 1.7 }}>
                <li>{t('game.howTo1')}</li>
                <li>{t('game.howTo2')}</li>
                <li>{t('game.howTo3')}</li>
              </ul>
            </div>
          </GlassCard>
        </div>
      </PageTransition>
    );
  }

  /* ============================================================== PLAYING */
  const cur = game;
  const activeName = cur ? cur.players[cur.turn].name : '';

  return (
    <PageTransition>
      <PageHeader
        icon={<AimOutlined />}
        title={t('game.title')}
        subtitle={cur?.type === 'russian' ? t('game.ruleRussian') : t('game.ruleAmerican')}
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={newRound}>
              {t('game.newRound')}
            </Button>
            <Button icon={<LogoutOutlined />} onClick={exitGame}>
              {t('game.exit')}
            </Button>
          </Space>
        }
      />

      {cur && (
        <>
          {/* Hisob tablosi */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <PlayerCard state={cur} index={0} accent={gold.base} />
            <PlayerCard state={cur} index={1} accent={semantic.info} />
          </div>

          {/* Holat / navbat qatori */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              marginBottom: 14,
              padding: '10px 14px',
              borderRadius: TOKENS.radius.md,
              background: bg.bg1,
              border: `1px solid ${cur.foul ? semantic.error : border.subtle}`,
            }}
          >
            <Tag color="gold" style={{ margin: 0, fontWeight: 700 }}>
              {t('game.turnLabel')}: {activeName}
            </Tag>
            <Text style={{ color: cur.foul ? semantic.error : text.secondary, fontSize: 13 }}>
              {t(`game.msg_${cur.messageKey}`, cur.messageParams)}
            </Text>
            {cur.ballInHand && !cur.gameOver && (
              <Tag color="green" style={{ margin: 0 }}>
                {t('game.ballInHand')}
              </Tag>
            )}
          </div>

          {/* O'yin maydoni */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 380px', minWidth: 280 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
                {/* Quvvat o'lchagich */}
                <div
                  title={t('game.power')}
                  style={{
                    width: 14,
                    borderRadius: TOKENS.radius.pill,
                    background: bg.bg2,
                    border: `1px solid ${border.base}`,
                    position: 'relative',
                    overflow: 'hidden',
                    flexShrink: 0,
                  }}
                >
                  <div
                    ref={powerFillRef}
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: '0%',
                      background: `linear-gradient(to top, ${semantic.success}, ${gold.base} 70%, ${semantic.error})`,
                      transition: 'none',
                    }}
                  />
                </div>

                {/* Stol */}
                <div
                  ref={wrapRef}
                  style={{
                    position: 'relative',
                    flex: 1,
                    borderRadius: TOKENS.radius.lg,
                    // Haqiqiy bilyard stoli nisbati — uzunlik:kenglik = 2:1
                    aspectRatio: '2 / 1',
                    overflow: 'hidden',
                    background:
                      'linear-gradient(145deg, #4a331f 0%, #241811 50%, #4a331f 100%)',
                    padding: 'clamp(8px, 1.8vw, 16px)',
                    boxShadow: `${TOKENS.shadow.level3}, inset 0 0 0 2px rgba(212,175,55,0.16)`,
                    cursor: 'crosshair',
                    touchAction: 'none',
                  }}
                >
                  <canvas
                    ref={canvasRef}
                    style={{
                      display: 'block',
                      width: '100%',
                      height: '100%',
                      borderRadius: TOKENS.radius.md,
                    }}
                  />

                  {cur.gameOver && cur.winner !== null && (
                    <WinnerOverlay
                      name={cur.players[cur.winner].name}
                      onAgain={newRound}
                      onExit={exitGame}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Boshqaruv paneli */}
            <div style={{ flex: '1 1 200px', maxWidth: 300, minWidth: 200 }}>
              <div
                style={{
                  padding: 16,
                  borderRadius: TOKENS.radius.md,
                  background: bg.bg1,
                  border: `1px solid ${border.subtle}`,
                }}
              >
                <Text strong style={{ fontSize: 13, color: text.primary }}>
                  {t('game.spin')}
                </Text>
                <Text style={{ display: 'block', fontSize: 11.5, color: text.tertiary, marginTop: 2 }}>
                  {t('game.spinHint')}
                </Text>
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
                  <SpinPad value={spin} onChange={setSpin} />
                </div>
                <Button
                  size="small"
                  block
                  onClick={() => setSpin({ x: 0, y: 0 })}
                  style={{ marginTop: 12 }}
                >
                  {t('game.spinReset')}
                </Button>
              </div>

              <div
                style={{
                  marginTop: 12,
                  padding: 14,
                  borderRadius: TOKENS.radius.md,
                  background: bg.bg1,
                  border: `1px solid ${border.subtle}`,
                  fontSize: 12.5,
                  color: text.secondary,
                  lineHeight: 1.7,
                }}
              >
                <AimOutlined style={{ color: gold.base }} /> {t('game.aimHint')}
              </div>
            </div>
          </div>
        </>
      )}
    </PageTransition>
  );
};

/* ---------------------------------------------------------- O'yinchi karta */

const PlayerCard = ({
  state,
  index,
  accent,
}: {
  state: GameState;
  index: 0 | 1;
  accent: string;
}) => {
  const { t } = useTranslation();
  const p = state.players[index];
  const active = state.turn === index && !state.gameOver;
  const isRussian = state.type === 'russian';
  const remaining = remainingByGroup(state, p.group);

  return (
    <div
      style={{
        flex: '1 1 200px',
        padding: '12px 16px',
        borderRadius: TOKENS.radius.md,
        background: active ? emerald.deep : bg.bg1,
        border: `1px solid ${active ? gold.line : border.subtle}`,
        boxShadow: active ? TOKENS.shadow.glowActive : 'none',
        transition: 'background .2s, border-color .2s',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: '50%',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          color: bg.bg0,
          background: accent,
        }}
      >
        {index + 1}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <Text strong ellipsis style={{ display: 'block', fontSize: 14, color: text.primary }}>
          {p.name}
        </Text>
        {isRussian ? (
          <Text style={{ fontSize: 12, color: text.tertiary }}>
            {t('game.score')}: <b style={{ color: gold.base }}>{p.score}</b> / {RUSSIAN_TARGET}
          </Text>
        ) : (
          <Text style={{ fontSize: 12, color: text.tertiary }}>
            {p.group
              ? `${t(p.group === 'solid' ? 'game.solids' : 'game.stripes')} · ${t('game.remaining')}: ${remaining}`
              : t('game.open')}
          </Text>
        )}
      </div>
      {active && (
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: '50%',
            background: TOKENS.color.neonGreen,
            boxShadow: `0 0 8px ${TOKENS.color.neonGreen}`,
            flexShrink: 0,
          }}
        />
      )}
    </div>
  );
};

/* -------------------------------------------------------------- Spin pad */

const SpinPad = ({
  value,
  onChange,
}: {
  value: { x: number; y: number };
  onChange: (v: { x: number; y: number }) => void;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const size = 96;
  const R = size / 2 - 8;

  const update = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let dx = e.clientX - rect.left - size / 2;
    let dy = e.clientY - rect.top - size / 2;
    const len = Math.hypot(dx, dy);
    if (len > R) {
      dx = (dx / len) * R;
      dy = (dy / len) * R;
    }
    onChange({ x: +(dx / R).toFixed(2), y: +(-dy / R).toFixed(2) });
  };

  return (
    <div
      ref={ref}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1) update(e);
      }}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        position: 'relative',
        cursor: 'pointer',
        touchAction: 'none',
        background: 'radial-gradient(circle at 35% 30%, #ffffff, #d9d3c4 60%, #b7b0a0)',
        boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.35)',
        border: `2px solid ${border.strong}`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 2,
          height: '100%',
          background: 'rgba(0,0,0,0.12)',
          transform: 'translateX(-50%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: '100%',
          height: 2,
          background: 'rgba(0,0,0,0.12)',
          transform: 'translateY(-50%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: `calc(50% + ${value.x * R}px)`,
          top: `calc(50% + ${-value.y * R}px)`,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: '#cf3a2e',
          border: '2px solid #fff',
          transform: 'translate(-50%, -50%)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
        }}
      />
    </div>
  );
};

/* --------------------------------------------------------- G'olib overlay */

const WinnerOverlay = ({
  name,
  onAgain,
  onExit,
}: {
  name: string;
  onAgain: () => void;
  onExit: () => void;
}) => {
  const { t } = useTranslation();
  const overlay: CSSProperties = {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    background: 'rgba(8, 12, 10, 0.72)',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    textAlign: 'center',
    padding: 20,
  };
  return (
    <div style={overlay}>
      <TrophyOutlined style={{ fontSize: 52, color: gold.base }} />
      <Title level={3} style={{ margin: 0, color: text.primary }}>
        {t('game.winnerText', { name })}
      </Title>
      <Text style={{ color: text.secondary }}>{t('game.winnerSub')}</Text>
      <Space style={{ marginTop: 8 }}>
        <Button type="primary" icon={<ReloadOutlined />} onClick={onAgain}>
          {t('game.playAgain')}
        </Button>
        <Button icon={<LogoutOutlined />} onClick={onExit}>
          {t('game.exit')}
        </Button>
      </Space>
    </div>
  );
};

export default BilliardGame;
