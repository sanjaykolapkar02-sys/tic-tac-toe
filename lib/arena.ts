import { freshGame, type Game, type Mark } from './game';

export type GameKind = 'ttt' | 'rps';
export type Choice = 'rock' | 'paper' | 'scissors';
export const choices: Choice[] = ['rock', 'paper', 'scissors'];
export const gameNames = { ttt: 'Tic-tac-toe', rps: 'Rock-paper-scissors' };
type Shared = { pendingSwitch?: { kind: GameKind; ready: Mark[] } };
export type RpsGame = Shared & {
  kind: 'rps';
  round: number;
  scores: Game['scores'];
  ready: Mark[];
  picks: Record<Mark, Choice | null>;
  submitted: Record<Mark, boolean>;
  startedAtVersion: number;
};
export type ArenaGame = (Game & Shared & { kind: 'ttt' }) | RpsGame;

export function freshArena(kind: GameKind, version = 0): ArenaGame {
  return kind === 'ttt' ? { ...freshGame(), kind } : {
    kind, round: 1, scores: { X: 0, O: 0, ties: 0 }, ready: [],
    picks: { X: null, O: null }, submitted: { X: false, O: false }, startedAtVersion: version,
  };
}
export function rpsOutcome(picks: RpsGame['picks']): Mark | 'tie' | null {
  const { X, O } = picks;
  if (!X || !O) return null;
  if (X === O) return 'tie';
  return (X === 'rock' && O === 'scissors') || (X === 'paper' && O === 'rock') || (X === 'scissors' && O === 'paper') ? 'X' : 'O';
}
export function choose(game: RpsGame, role: Mark, choice: Choice): RpsGame {
  if (!choices.includes(choice)) throw new Error('Choose rock, paper, or scissors.');
  if (game.picks[role]) throw new Error('Your choice is locked for this round.');
  const next = structuredClone(game);
  next.picks[role] = choice;
  next.submitted[role] = true;
  const winner = rpsOutcome(next.picks);
  if (winner) next.scores[winner === 'tie' ? 'ties' : winner]++;
  return next;
}
export function nextRpsRound(game: RpsGame, version = 0): RpsGame {
  return { ...game, round: game.round + 1, ready: [], picks: { X: null, O: null }, submitted: { X: false, O: false }, startedAtVersion: version };
}
