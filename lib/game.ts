export type Mark = 'X' | 'O';
export type Game = {
  board: (Mark | null)[];
  turn: Mark;
  round: number;
  scores: { X: number; O: number; ties: number };
  ready: Mark[];
};
export const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
export function outcome(board: Game['board']): { winner: Mark | 'tie'; line: number[] } | null {
  for (const line of lines) {
    const [a,b,c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return { winner: board[a]!, line };
  }
  return board.every(Boolean) ? { winner: 'tie' as const, line: [] } : null;
}
export function freshGame(): Game {
  return { board: Array(9).fill(null), turn: 'X', round: 1, scores: { X: 0, O: 0, ties: 0 }, ready: [] };
}
export function move(game: Game, mark: Mark, index: number): Game {
  if (!Number.isInteger(index) || index < 0 || index > 8) throw new Error('Choose a square on the board.');
  if (outcome(game.board)) throw new Error('This round has finished.');
  if (game.turn !== mark) throw new Error('Wait for your turn.');
  if (game.board[index]) throw new Error('That square is already taken.');
  const next = structuredClone(game);
  next.board[index] = mark;
  const result = outcome(next.board);
  if (result) next.scores[result.winner === 'tie' ? 'ties' : result.winner]++;
  else next.turn = mark === 'X' ? 'O' : 'X';
  return next;
}
export function nextRound(game: Game): Game {
  return { ...game, board: Array(9).fill(null), round: game.round + 1, turn: game.round % 2 ? 'O' : 'X', ready: [] };
}
export function computerMove(board: Game['board']): number {
  function evaluate(squares: Game['board'], player: Mark, depth: number): number {
    const result = outcome(squares);
    if (result) return result.winner === 'O' ? 10 - depth : result.winner === 'X' ? depth - 10 : 0;
    const values = squares.flatMap((mark, index) => {
      if (mark) return [];
      const next = [...squares]; next[index] = player;
      return [evaluate(next, player === 'X' ? 'O' : 'X', depth + 1)];
    });
    return player === 'O' ? Math.max(...values) : Math.min(...values);
  }
  let best = -Infinity, choice = 0;
  board.forEach((mark, index) => {
    if (mark) return;
    const next = [...board]; next[index] = 'O';
    const score = evaluate(next, 'X', 1);
    if (score > best) { best = score; choice = index; }
  });
  return choice;
}
