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
const db = moduleUrl('../db/rooms.ts', [["import { env } from 'cloudflare:workers';", 'const env = { DB: globalThis.__testDatabase };'], ["'../lib/game'", JSON.stringify(game)]]);
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
sqlite.close();
