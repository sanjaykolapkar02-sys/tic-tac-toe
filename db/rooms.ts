import { env } from 'cloudflare:workers';
import { freshGame, move, nextRound, outcome, type Game, type Mark } from '../lib/game';

type Row = { id: string; x_token: string; o_token: string | null; state: string; version: number; expires_at: number };
export class GameError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
function database() {
  if (!env.DB) throw new Error('Game database unavailable');
  return env.DB;
}
function view(row: Row, token: string) {
  const role = row.x_token === token ? 'X' : row.o_token === token ? 'O' : null;
  if (!role) throw new GameError('Join this room to play.', 403);
  return { id: row.id, version: row.version, game: JSON.parse(row.state) as Game, role, joined: Boolean(row.o_token) };
}
export async function getRoom(id: string, token: string) {
  const row = await read(id);
  return view(row, token);
}
async function read(id: string) {
  if (!/^[a-f0-9]{32}$/.test(id)) throw new GameError('This room link is invalid.', 404);
  const row = await database().prepare('SELECT * FROM rooms WHERE id = ? AND expires_at > ?').bind(id, Date.now()).first<Row>();
  if (!row) throw new GameError('This room expired or does not exist. Create a new one.', 404);
  return row;
}
export async function createRoom(token: string) {
  const id = crypto.randomUUID().replaceAll('-', '');
  const state = JSON.stringify(freshGame());
  const expires = Date.now() + 7 * 24 * 60 * 60 * 1000;
  await database().batch([
    database().prepare('DELETE FROM rooms WHERE expires_at < ?').bind(Date.now()),
    database().prepare('INSERT INTO rooms (id, x_token, state, version, expires_at) VALUES (?, ?, ?, 0, ?)').bind(id, token, state, expires),
  ]);
  return getRoom(id, token);
}
export async function updateRoom(id: string, token: string, action: string, index?: number, version?: number) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await read(id);
    let opponent = row.o_token;
    let game: Game = JSON.parse(row.state);
    if (action === 'join') {
      if (row.x_token === token || row.o_token === token) return view(row, token);
      if (row.o_token) throw new GameError('This room already has two players. Create another room.', 409);
      opponent = token;
    } else {
      const role: Mark | null = row.x_token === token ? 'X' : row.o_token === token ? 'O' : null;
      if (!role) throw new GameError('You are not a player in this room.', 403);
      if (!row.o_token) throw new GameError('Wait for the second player to join.', 409);
      if (version !== row.version) throw new GameError('The board changed. Please try again.', 409);
      if (action === 'move') {
        try { game = move(game, role, index as number); }
        catch (error) { throw new GameError((error as Error).message, 409); }
      } else if (action === 'ready') {
        if (!outcome(game.board)) throw new GameError('Finish this round first.', 409);
        if (!game.ready.includes(role)) game.ready.push(role);
        if (game.ready.length === 2) game = nextRound(game);
      } else throw new GameError('Unknown game action.');
    }
    const changed = await database().prepare('UPDATE rooms SET o_token = ?, state = ?, version = version + 1 WHERE id = ? AND version = ? RETURNING *')
      .bind(opponent, JSON.stringify(game), id, row.version).first<Row>();
    if (changed) return view(changed, token);
  }
  throw new GameError('The room is busy. Please try again.', 409);
}
