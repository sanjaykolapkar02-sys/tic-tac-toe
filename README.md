# Tic Tac Toe Together

Play tic-tac-toe online with a friend, against the computer, or on the same device.

**Live game:** [tic-tac-toe-together.sanjaykolapkar02.workers.dev](https://tic-tac-toe-together.sanjaykolapkar02.workers.dev/)

## Features

- Create an online room and share its invite link.
- Keep turns and scores synchronized between both players.
- Rejoin your seat after refreshing the page.
- Rooms expire after seven days; invite links are shareable during that time.
- Play against an unbeatable computer or pass one device between two players.

## Run locally

Requires Node.js 22.13 or newer.

```sh
npm install
npm run dev
```

Open the local URL printed in your terminal.

## Deploy to Cloudflare

The app runs on Cloudflare Workers and stores multiplayer rooms in Cloudflare D1. The database name, ID, and `DB` binding are in [`cloudflare-deploy.json`](cloudflare-deploy.json). Wrangler must be signed in to the Cloudflare account that owns that database.

```sh
npx wrangler login
npm run build
node scripts/prepare-cloudflare-deploy.mjs
npx wrangler deploy --config dist/server/wrangler.json
```

For the first deployment to a new database, apply the included schema once before deploying:

```sh
npx wrangler d1 execute DB --remote --config dist/server/wrangler.json --file drizzle/0000_closed_lake.sql
```

## Checks

```sh
node tests/multiplayer.test.mjs
node node_modules/typescript/bin/tsc --noEmit
```
