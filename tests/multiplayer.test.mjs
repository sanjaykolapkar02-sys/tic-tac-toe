import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('../drizzle/0000_closed_lake.sql', import.meta.url), 'utf8'));
const database = {
  prepare(sql) {
    return { bind(...values) {
      return { first: async () => sqlite.prepare(sql).get(...values) ?? null, run: () => sqlite.prepare(sql).run(...values) };
    } };
  },
  async batch(statements) {
    sqlite.exec('BEGIN');
    try { const results = statements.map(statement => statement.run()); sqlite.exec('COMMIT'); return results; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  },
};
globalThis.__testDatabase = database;
function moduleUrl(file, replacements = []) {
  let code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  for (const [from, to] of replacements) code = code.replace(from, to);
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}
const game = moduleUrl('../lib/game.ts');
const arena = moduleUrl('../lib/arena.ts', [["'./game'", JSON.stringify(game)]]);
const db = moduleUrl('../db/rooms.ts', [["import { env } from 'cloudflare:workers';", 'const env = { DB: globalThis.__testDatabase };'], ["'../lib/game'", JSON.stringify(game)], ["'../lib/arena'", JSON.stringify(arena)]]);
const api = await import(moduleUrl('../app/api/rooms/route.ts', [["'../../../db/rooms'", JSON.stringify(db)]]));
function player() {
  let cookie = '';
  return async (body, status = 200, id) => {
    const response = await api[body ? 'POST' : 'GET'](new Request(`https://game.test/api/rooms${id ? `?id=${id}` : ''}`, {
      method: body ? 'POST' : 'GET', headers: { cookie, origin: 'https://game.test', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    }));
    assert.equal(response.status, status, await response.clone().text());
    if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    return response.json();
  };
}
const x = player(), o = player(), outsider = player();
let room = await x({ action: 'create' });
const id = room.id;
assert.equal(room.role, 'X');
await x({ action: 'move', id, index: 0, version: room.version }, 409);
await outsider(undefined, 403, id);
room = await o({ action: 'join', id });
assert.equal(room.role, 'O');
await outsider({ action: 'join', id }, 409);
await outsider({ action: 'move', id, index: 0, version: room.version }, 403);
await o({ action: 'move', id, index: 0, version: room.version }, 409);
for (const [client, index] of [[x, 0], [o, 3], [x, 1], [o, 4], [x, 2]]) {
  room = await client({ action: 'move', id, index, version: room.version });
}
assert.equal(room.game.scores.X, 1);
await x({ action: 'move', id, index: 5, version: room.version }, 409);
const restored = await x(undefined, 200, id);
assert.deepEqual(restored.game, room.game);
room = await x({ action: 'ready', id, version: room.version });
assert.equal(room.game.round, 1);
room = await o({ action: 'ready', id, version: room.version });
assert.equal(room.game.round, 2);
assert.equal(room.game.turn, 'O');
assert.equal(room.game.scores.X, 1);
const staleVersion = room.version;
room = await o({ action: 'move', id, index: 4, version: staleVersion });
await o({ action: 'move', id, index: 0, version: staleVersion }, 409);
const concurrentRoom = await x({ action: 'create' });
const candidates = [player(), player()];
const joins = await Promise.all(candidates.map(client => client({ action: 'join', id: concurrentRoom.id }).catch(() => null)));
assert.equal(joins.filter(Boolean).length, 1);
console.log('Passed: two players, private seats, full room, turns, win scoring, refresh recovery, rematch, stale moves, concurrent joins.');

// Existing deployed rooms have no kind field. They continue as tic-tac-toe.
const legacyState = JSON.parse(sqlite.prepare('SELECT state FROM rooms WHERE id = ?').get(id).state);
delete legacyState.kind;
sqlite.prepare('UPDATE rooms SET state = ? WHERE id = ?').run(JSON.stringify(legacyState), id);
assert.equal((await x(undefined, 200, id)).game.kind, 'ttt');

const { rpsOutcome } = await import(arena);
const expected = { rock: { rock: 'tie', paper: 'O', scissors: 'X' }, paper: { rock: 'X', paper: 'tie', scissors: 'O' }, scissors: { rock: 'O', paper: 'X', scissors: 'tie' } };
for (const X of Object.keys(expected)) for (const O of Object.keys(expected)) assert.equal(rpsOutcome({ X, O }), expected[X][O]);

const a = player(), b = player();
await a({ action: 'create', kind: 'invalid' }, 400);
let rps = await a({ action: 'create', kind: 'rps' });
const rpsId = rps.id;
await a({ action: 'choose', id: rpsId, choice: 'rock', version: rps.version }, 409);
rps = await b({ action: 'join', id: rpsId });
await outsider({ action: 'choose', id: rpsId, choice: 'paper', version: rps.version }, 403);
await a({ action: 'choose', id: rpsId, choice: 'lizard', version: rps.version }, 409);
await a({ action: 'move', id: rpsId, index: 0, version: rps.version }, 409);
await a({ action: 'ready', id: rpsId, version: rps.version }, 409);
const sharedVersion = rps.version;
rps = await a({ action: 'choose', id: rpsId, choice: 'rock', version: sharedVersion });
assert.equal(rps.game.picks.X, 'rock');
const hidden = await b(undefined, 200, rpsId);
assert.equal(hidden.game.picks.X, null);
assert.equal(hidden.game.submitted.X, true);
assert.deepEqual(hidden.game.scores, { X: 0, O: 0, ties: 0 });
assert.equal(JSON.stringify(hidden).includes('rock'), false);
assert.equal((await a(undefined, 200, rpsId)).game.picks.X, 'rock');
await a({ action: 'choose', id: rpsId, choice: 'scissors', version: rps.version }, 409);
// Both browsers chose from the same displayed version; the second is merged.
rps = await b({ action: 'choose', id: rpsId, choice: 'scissors', version: sharedVersion });
assert.deepEqual(rps.game.picks, { X: 'rock', O: 'scissors' });
assert.equal(rps.game.scores.X, 1);
assert.deepEqual((await a(undefined, 200, rpsId)).game.picks, rps.game.picks);
await b({ action: 'choose', id: rpsId, choice: 'paper', version: rps.version }, 409);
rps = await a({ action: 'ready', id: rpsId, version: rps.version });
assert.equal(rps.game.round, 1);
rps = await b({ action: 'ready', id: rpsId, version: rps.version });
assert.equal(rps.game.round, 2);
assert.equal(rps.game.scores.X, 1);
assert.deepEqual(rps.game.picks, { X: null, O: null });
await a({ action: 'choose', id: rpsId, choice: 'rock', version: sharedVersion }, 409);

// Concurrent choices reveal once and award exactly one point.
const concurrentVersion = rps.version;
await Promise.all([
  a({ action: 'choose', id: rpsId, choice: 'paper', version: concurrentVersion }),
  b({ action: 'choose', id: rpsId, choice: 'paper', version: concurrentVersion }),
]);
rps = await a(undefined, 200, rpsId);
assert.equal(rps.game.scores.ties, 1);
assert.equal(rps.game.scores.X, 1);

// A game switch needs both players. It can be declined or cancelled.
rps = await a({ action: 'switch', id: rpsId, kind: 'ttt', version: rps.version });
assert.equal(rps.game.kind, 'rps');
assert.deepEqual(rps.game.pendingSwitch, { kind: 'ttt', ready: ['X'] });
rps = await b({ action: 'switch', id: rpsId, kind: 'rps', version: rps.version });
assert.equal(rps.game.pendingSwitch, undefined);
rps = await a({ action: 'switch', id: rpsId, kind: 'ttt', version: rps.version });
const beforeSwitch = rps.version;
rps = await b({ action: 'switch', id: rpsId, kind: 'ttt', version: rps.version });
assert.equal(rps.id, rpsId);
assert.equal(rps.game.kind, 'ttt');
assert.deepEqual(rps.game.scores, { X: 0, O: 0, ties: 0 });
await a({ action: 'choose', id: rpsId, choice: 'rock', version: rps.version }, 409);
await a({ action: 'move', id: rpsId, index: 0, version: beforeSwitch }, 409);
rps = await a({ action: 'move', id: rpsId, index: 0, version: rps.version });
assert.equal(rps.game.board[0], 'X');
rps = await a({ action: 'switch', id: rpsId, kind: 'rps', version: rps.version });
rps = await b({ action: 'switch', id: rpsId, kind: 'rps', version: rps.version });
assert.equal(rps.game.kind, 'rps');
await a({ action: 'choose', id: rpsId, choice: 'rock', version: sharedVersion }, 409);
assert.equal((await b(undefined, 200, rpsId)).role, 'O');
console.log('Passed: all nine RPS outcomes, secret choices, choice locking, simultaneous choices, single scoring, rematch, old request rejection, legacy rooms, and mutual game switching in the same room.');
sqlite.close();
