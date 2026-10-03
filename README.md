# Tic Tac Toe Together

A browser tic-tac-toe game with online rooms, an unbeatable computer opponent, and a same-device two-player mode.

**Play:** [tic-tac-toe-together.sanjaykolapkar02.workers.dev](https://tic-tac-toe-together.sanjaykolapkar02.workers.dev/)

## Product specification

| Mode | Players | State | How it works |
| --- | --- | --- | --- |
| Online | Two browsers | Cloudflare D1 | Create a room, share its link, and take turns. |
| Computer | One browser | Browser memory | Play X against a minimax opponent playing O. |
| Same device | Two people on one browser | Browser memory | Alternate X and O on the same board. |

In online mode, the creator gets X and the first other browser to join gets O. A third browser cannot take a seat. The room creator shares the `?room=<id>` URL; the invitee joins from that URL. A returning player keeps the same seat while the browser retains its player cookie. Both players must press **Play again** after a finished round. Scores continue across rounds, and the starting mark alternates between X and O. In computer mode, the human starts each new round as X. Local modes reset on refresh.

The game uses a 3×3 board. A player wins with three marks in any row, column, or diagonal. A full board without a winning line is a tie. Each finished round increments the appropriate X, O, or tie score once. A room can be opened for seven days after creation. The URL alone identifies a room; each player's browser cookie identifies their seat.

## Architecture

```mermaid
flowchart LR
    A[Player X browser] -->|HTTPS: create, move, poll| W[Cloudflare Worker]
    B[Player O browser] -->|HTTPS: join, move, poll| W
    W -->|Prepared SQL statements| D[(Cloudflare D1: rooms)]
    A -.->|Computer and same-device play| LA[Browser-local game state]
    B -.->|Computer and same-device play| LB[Browser-local game state]
```

The UI is a React client in `app/page.tsx`, built with Next.js through Vinext for Cloudflare Workers. It calls the room API at `app/api/rooms/route.ts`. The route handles HTTP, the player cookie, and error responses. `db/rooms.ts` owns room persistence and seat checks. `lib/game.ts` owns board rules, scoring, rematches, and computer move selection. Online game state is authoritative in D1; the browser renders the latest server response. The computer and same-device modes use React state and do not call the room API.

When an online room is open, each browser sends a `GET` about once per second. The client accepts a response only if its room version is at least as new as the version already displayed. If polling fails, the UI shows **Reconnecting** and pauses moves until it receives a fresh response. Each fetch has a 12-second timeout.

### Source map

| Path | Responsibility |
| --- | --- |
| `app/page.tsx` and `app/globals.css` | Game screen, room flows, local modes, and styles. |
| `app/api/rooms/route.ts` | `GET` and `POST` HTTP interface, cookie handling, and response status. |
| `lib/game.ts` | Pure game rules, outcomes, scoring, round reset, and minimax computer opponent. |
| `db/rooms.ts` | D1 queries, player seats, expiry checks, and versioned updates. |
| `db/schema.ts` and `drizzle/` | Room schema and its checked-in SQL migration. |
| `cloudflare-deploy.json` | Worker name and existing D1 binding details. |
| `scripts/prepare-cloudflare-deploy.mjs` | Applies those details to the generated Wrangler config after a build. |
| `tests/multiplayer.test.mjs` | API checks for joining, turns, scoring, rematches, and races. |

The remaining `build/`, `scripts/`, and component files support the Vinext and Cloudflare build environment. Generated `dist/`, `node_modules/`, and local Wrangler state are excluded from Git.

## Online protocol

All online requests use `/api/rooms`. Responses are JSON and include `Cache-Control: no-store`. A successful room response has this shape:

```json
{
  "id": "0123456789abcdef0123456789abcdef",
  "version": 3,
  "role": "X",
  "joined": true,
  "game": {
    "board": ["X", null, null, null, "O", null, null, null, null],
    "turn": "X",
    "round": 1,
    "scores": { "X": 0, "O": 0, "ties": 0 },
    "ready": []
  }
}
```

| Request | Purpose | Relevant body or query |
| --- | --- | --- |
| `POST /api/rooms` | Create room; creator receives X. | `{ "action": "create" }` |
| `POST /api/rooms` | Claim O or return the existing seat. | `{ "action": "join", "id": "<room-id>" }` |
| `GET /api/rooms?id=<room-id>` | Read the current room for an existing player. | Player cookie required. |
| `POST /api/rooms` | Place a mark at a zero-based board index. | `{ "action": "move", "id": "<room-id>", "index": 4, "version": 3 }` |
| `POST /api/rooms` | Mark a player ready for the next round. | `{ "action": "ready", "id": "<room-id>", "version": 4 }` |

`move` and `ready` include the version the browser last saw. The API rejects stale versions with HTTP 409, so a delayed tab cannot overwrite a newer move. It also rejects moves before O joins, out-of-turn moves, occupied cells, and moves after the round ends. `ready` is accepted only after a win or tie. The next round begins when both seats are ready.

Expected error statuses are **400** for malformed actions, **403** for an unseated browser, **404** for an invalid or expired room, **409** for a full room or conflicting game action, **413** for a request body over 2 KB, and **503** when storage is unavailable. Errors use `{ "error": "..." }`.

## Data and consistency

The `rooms` D1 table is defined in `db/schema.ts`:

| Column | Meaning |
| --- | --- |
| `id` | Random 32-character room ID; primary key. |
| `x_token` | SHA-256 hash of X's browser token. |
| `o_token` | Hash of O's token, or `NULL` until someone joins. |
| `state` | JSON game state: board, turn, round, scores, and ready players. |
| `version` | Integer incremented by each accepted room update. |
| `expires_at` | Room expiration time in Unix milliseconds. |

Room updates use `UPDATE ... WHERE id = ? AND version = ? RETURNING *`. If two requests compete for the same version, only one update can win. The server can retry an update up to three times; a move based on a stale client version returns HTTP 409. Expired rooms are unavailable immediately, and expired rows are deleted when a new room is created. There is no scheduled cleanup job.

The server sets a random `ttt_player` cookie for a browser and stores only its SHA-256 hash in D1. The cookie has `HttpOnly`, `SameSite=Lax`, a 30-day maximum age, and `Secure` on HTTPS. The API checks the request origin when an `Origin` header is present and uses prepared SQL statements. Room responses never include player token hashes. There are no accounts, profiles, or global leaderboards.

## Run locally

Requires Node.js 22.13 or newer.

```sh
npm install
npm run build
npx wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_closed_lake.sql
npm run dev
```

The SQL command initializes the local D1 database; run it only once for a fresh local database. `npm run dev` prints the local URL. To preview the built Worker against the same local state, use `npm start`. Computer and same-device modes can run without a D1 connection.

## Deploy to Cloudflare

Wrangler must be signed in to the Cloudflare account that owns the D1 database in `cloudflare-deploy.json`. The `DB` binding is required by the server code. Run from the repository root:

```sh
npx wrangler login
npm install
npm run build
node scripts/prepare-cloudflare-deploy.mjs
npx wrangler deploy --config dist/server/wrangler.json
```

For a **new, empty remote database**, apply the checked-in schema once between the prepare and deploy commands:

```sh
npx wrangler d1 execute DB --remote --config dist/server/wrangler.json --file drizzle/0000_closed_lake.sql
```

The build regenerates `dist/server/wrangler.json` with a placeholder D1 ID. Always run `prepare-cloudflare-deploy.mjs` after building so Wrangler deploys with the correct Worker name and database binding. Subsequent app deployments need only the build, prepare, and deploy commands. Do not rerun the initial schema on a database that already has the `rooms` table.

## Capacity and current limits

The implementation polls once per second per open online room tab. A two-player room therefore makes approximately 7,200 room-read requests per hour, plus joins and moves. Request consumption depends on time with the room open more than on the total number of registered players. The present design has no accounts, fixed room count cap, WebSocket updates, rate limiting, or automatic migration between databases. For greater traffic, reducing poll frequency is the smallest change; a push-based room coordinator would remove periodic reads but require a different synchronization path.

## Implementation checks

```sh
node tests/multiplayer.test.mjs
node node_modules/typescript/bin/tsc --noEmit
```

The multiplayer check covers seat assignment, a full room, turn enforcement, a winning round, score persistence after refresh, rematch readiness, stale moves, and concurrent joins.
