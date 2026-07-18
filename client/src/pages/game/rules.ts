/**
 * O'yin qoidalari dvigateli — 2 kishilik HOTSEAT (bir ekran, navbatli).
 *
 * Ikki rejim:
 *  • `russian` — Rus bilyardi (piramida). 15 fil suyagi shar + qizil biток.
 *    Har tushirilgan shar = 1 ochko; kim birinchi 8 ochko yig'sa — g'olib.
 *    Scratch (biток tushsa) yoki sharsiz zarba = faul → navbat + qo'lda joylash.
 *  • `american` — Amerika pul (8-ball). Toʼliq (1–7) va chiziqli (9–15) guruhlar,
 *    oxirida qora 8. Ochiq stol guruh biriktirilgunча; oʼz guruhini tozalab,
 *    8 ni qoidaga koʼra tushirgan gʼolib. Faul → qoʼlda joylash (ball-in-hand).
 *
 * MUHIM: bu modul i18n dan XOLI — `messageKey` (game.* kaliti) qaytaradi,
 * matnni komponent tarjima qiladi.
 */

export type GameType = 'russian' | 'american';
export type Group = 'solid' | 'stripe';
export type BallKind = 'cue' | 'solid' | 'stripe' | 'eight' | 'plain';

export interface BallSpec {
  number: number; // 0 = kiy soqqasi
  kind: BallKind;
  color: string;
}

/** Zarba natijasi — engine yozadi, rules o'qiydi */
export interface ShotResult {
  potted: number[]; // shu zarbada tushgan OBYEKT shar raqamlari (tartibda)
  cueScratched: boolean; // kiy soqqasi tushdimi
  firstContact: number | null; // kiy soqqasi birinchi urgan obyekt shar (null — hech biri)
  eightPotted: boolean;
}

export interface PlayerState {
  name: string;
  group: Group | null; // faqat american: biriktirilgan guruh
  score: number; // faqat russian: ochko
}

export interface GameState {
  type: GameType;
  players: [PlayerState, PlayerState];
  turn: 0 | 1;
  open: boolean; // american: stol ochiq (guruhlar biriktirilmagan)
  broke: boolean; // birinchi (break) zarba olindimi
  ballsOnTable: number[]; // stolda qolgan OBYEKT sharlar (8 ni ham o'z ichiga oladi)
  ballInHand: boolean; // raqib kiy soqqasini xohlagan joyga qo'yadi
  gameOver: boolean;
  winner: 0 | 1 | null;
  foul: boolean;
  messageKey: string; // game.<key>
  messageParams?: Record<string, string | number>;
}

const IVORY = '#f2ede1';
const CUE_RED = '#cf3a2e';
const CUE_WHITE = '#f4efe4';

/** Amerika pul shar ranglari (raqam → rang) */
const POOL_COLORS: Record<number, string> = {
  1: '#e8b923',
  2: '#1f5fd0',
  3: '#cf2f2a',
  4: '#7b3fb5',
  5: '#e07b1a',
  6: '#1f9d55',
  7: '#8f2d2d',
  8: '#17140f',
  9: '#e8b923',
  10: '#1f5fd0',
  11: '#cf2f2a',
  12: '#7b3fb5',
  13: '#e07b1a',
  14: '#1f9d55',
  15: '#8f2d2d',
};

/** Standart 8-ball rakka tartibi — 8 markazda, orqa burchaklar aralash */
const POOL_RACK_ORDER = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 6, 13, 7, 14, 15];

/** Rus bilyardi g'alaba uchun kerakli ochko (16 shardan) */
export const RUSSIAN_TARGET = 8;

export const groupOf = (n: number): Group | null => {
  if (n >= 1 && n <= 7) return 'solid';
  if (n >= 9 && n <= 15) return 'stripe';
  return null; // 8
};

/** Sharlar spetsifikatsiyasi (engine terish uchun) */
export const rackSpecs = (type: GameType): BallSpec[] => {
  if (type === 'russian') {
    const specs: BallSpec[] = [{ number: 0, kind: 'cue', color: CUE_RED }];
    for (let n = 1; n <= 15; n++) specs.push({ number: n, kind: 'plain', color: IVORY });
    return specs;
  }
  const specs: BallSpec[] = [{ number: 0, kind: 'cue', color: CUE_WHITE }];
  for (const n of POOL_RACK_ORDER) {
    const kind: BallKind = n === 8 ? 'eight' : n <= 7 ? 'solid' : 'stripe';
    specs.push({ number: n, kind, color: POOL_COLORS[n] });
  }
  return specs;
};

export const createGame = (type: GameType, name1: string, name2: string): GameState => ({
  type,
  players: [
    { name: name1, group: null, score: 0 },
    { name: name2, group: null, score: 0 },
  ],
  turn: 0,
  open: true,
  broke: false,
  ballsOnTable: Array.from({ length: 15 }, (_, i) => i + 1),
  ballInHand: false,
  gameOver: false,
  winner: null,
  foul: false,
  messageKey: 'break',
  messageParams: undefined,
});

/** Chuqur nusxa (mutatsiyasiz yangilash uchun) */
const clone = (s: GameState): GameState => ({
  ...s,
  players: [{ ...s.players[0] }, { ...s.players[1] }],
  ballsOnTable: [...s.ballsOnTable],
});

/** Zarbani qo'llash — yangi GameState qaytaradi */
export const applyShot = (prev: GameState, shot: ShotResult): GameState => {
  if (prev.gameOver) return prev;
  return prev.type === 'russian' ? applyRussian(prev, shot) : applyAmerican(prev, shot);
};

/* -------------------------------------------------------------- Rus bilyardi */

function applyRussian(prev: GameState, shot: ShotResult): GameState {
  const s = clone(prev);
  const shooter = s.turn;
  const other = (1 - shooter) as 0 | 1;
  s.broke = true;
  s.foul = false;
  s.messageParams = undefined;

  const pottedObjs = shot.potted.filter((n) => n !== 0);
  s.ballsOnTable = s.ballsOnTable.filter((n) => !pottedObjs.includes(n));

  const foul = shot.cueScratched || shot.firstContact === null;
  if (foul) {
    s.foul = true;
    s.turn = other;
    s.ballInHand = true;
    s.messageKey = shot.cueScratched ? 'foulScratch' : 'foulNoContact';
    return finishRussianIfCleared(s);
  }

  const points = pottedObjs.length;
  s.players[shooter].score += points;
  s.ballInHand = false;

  if (s.players[shooter].score >= RUSSIAN_TARGET) {
    s.gameOver = true;
    s.winner = shooter;
    s.messageKey = 'win';
    return s;
  }

  if (points > 0) {
    s.turn = shooter; // davom etadi
    s.messageKey = 'continue';
    s.messageParams = { n: points };
  } else {
    s.turn = other;
    s.messageKey = 'miss';
  }
  return finishRussianIfCleared(s);
}

/** Stol bo'shab qolsa (kamdan-kam) — ko'p ochkoli g'olib */
function finishRussianIfCleared(s: GameState): GameState {
  if (!s.gameOver && s.ballsOnTable.length === 0) {
    s.gameOver = true;
    s.winner = s.players[0].score >= s.players[1].score ? 0 : 1;
    s.messageKey = 'win';
  }
  return s;
}

/* ------------------------------------------------------------ Amerika 8-ball */

function applyAmerican(prev: GameState, shot: ShotResult): GameState {
  const s = clone(prev);
  const shooter = s.turn;
  const other = (1 - shooter) as 0 | 1;
  const wasOpen = s.open;
  const sg = s.players[shooter].group;
  const wasBreak = !s.broke;
  s.broke = true;
  s.foul = false;
  s.messageParams = undefined;

  // Zarbagacha holat
  const myBefore = sg ? s.ballsOnTable.filter((n) => groupOf(n) === sg) : [];
  const onEight = sg !== null && myBefore.length === 0;

  // Birinchi kontakt qonuniyligi
  let illegalFirst = false;
  if (shot.firstContact !== null && !wasBreak) {
    const fcGroup = groupOf(shot.firstContact);
    if (wasOpen) {
      if (shot.firstContact === 8) illegalFirst = true; // ochiq stolda 8 ni birinchi urish — faul
    } else if (onEight) {
      if (shot.firstContact !== 8) illegalFirst = true; // faqat 8 qolgan
    } else if (fcGroup !== sg) {
      illegalFirst = true; // o'z guruhini birinchi urishi shart
    }
  }

  const scratch = shot.cueScratched;
  const noContact = shot.firstContact === null;
  const foul = scratch || noContact || illegalFirst;

  // 8 tushdimi — o'yin yakuni
  if (shot.eightPotted) {
    s.gameOver = true;
    const legal8 = onEight && !foul && shot.firstContact === 8;
    s.winner = legal8 ? shooter : other;
    s.foul = !legal8;
    s.messageKey = legal8 ? 'win' : 'lose8';
    return s;
  }

  const pottedObjs = shot.potted.filter((n) => n !== 0 && n !== 8);
  s.ballsOnTable = s.ballsOnTable.filter((n) => !shot.potted.includes(n));

  if (foul) {
    s.foul = true;
    s.turn = other;
    s.ballInHand = true;
    s.messageKey = scratch ? 'foulScratch' : noContact ? 'foulNoContact' : 'foulWrongBall';
    return s;
  }

  s.ballInHand = false;

  // Ochiq stol + shar tushdi → guruh biriktiriladi
  if (wasOpen && pottedObjs.length > 0) {
    const grp = groupOf(pottedObjs[0]);
    if (grp) {
      s.players[shooter].group = grp;
      s.players[other].group = grp === 'solid' ? 'stripe' : 'solid';
      s.open = false;
      s.turn = shooter;
      s.messageKey = grp === 'solid' ? 'assignedSolids' : 'assignedStripes';
      s.messageParams = { name: s.players[shooter].name };
      return s;
    }
  }

  if (wasOpen) {
    // Qonuniy zarba, lekin shar tushmadi — stol ochiq qoladi, navbat o'tadi
    s.turn = other;
    s.messageKey = 'miss';
    return s;
  }

  // Guruh biriktirilgan — o'z sharini tushirsa davom etadi
  const mineNow = s.players[shooter].group;
  const pottedMine = pottedObjs.some((n) => groupOf(n) === mineNow);
  if (pottedMine) {
    s.turn = shooter;
    s.messageKey = 'continue';
    s.messageParams = { n: pottedObjs.length };
  } else {
    s.turn = other;
    s.messageKey = 'miss';
  }
  return s;
}

/** UI uchun: american guruh bo'yicha qolgan sharlar soni */
export const remainingByGroup = (s: GameState, group: Group | null): number => {
  if (!group) return 0;
  return s.ballsOnTable.filter((n) => groupOf(n) === group).length;
};
