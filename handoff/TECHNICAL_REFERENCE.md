# Technical reference

## Source map

| Path | Responsibility |
| --- | --- |
| `public/index.html` | Application shell and script/style loading |
| `public/app.js` | Vanilla-JS rendering, UI state, forms, API requests, polling and dialogs |
| `public/style.css`, `public/tokens.css` | Responsive layouts and visual tokens |
| `public/favicon.svg` | App icon |
| `src/server.js` | Node HTTP server, static assets, API routing, authorization, cookies, input validation |
| `src/store.js` | SQLite initialization, state snapshot persistence and session database |
| `src/pairing.js` | Pairing heuristic, warning calculation, group validation, demo fixture |
| `test/pairing.test.js`, `test/server.test.js` | Node built-in test-runner tests |
| `Dockerfile` | Node 24 container serving frontend and backend together |
| `.railway/railway.ts` | Original deployment's infrastructure definition |
| `package-lock.json` | Locked development dependency tree |
| `docs/verification.md` | Historical QA record |
| `docs/screenshots/` | Fictional demo screenshots, not live database exports |

No React, Express, ORM, frontend bundler or external auth provider is used. No runtime npm dependency install is required. Docker copies only package.json, src and public, not developer documentation or test files.

## Storage and concurrency

`createStore` opens `data/pair-up.sqlite` (or `$DATA_DIR/pair-up.sqlite`) in persistent mode, or `:memory:` for RAM mode. SQLite WAL and a 5-second busy timeout are enabled.

Tables:

- `state(id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)`: one JSON snapshot, containing users and rooms.
- `sessions(token TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, expires INTEGER NOT NULL)`: hashed opaque cookie tokens, account or door kind, millisecond expiry.

The state snapshot is loaded into JavaScript memory once; mutations update that object and save the whole snapshot. It is NOT a normalized users/pairs SQL schema. Do not edit the database underneath the running process: its in-memory snapshot can overwrite external edits. Do not run multiple application replicas against the same dataset; they would have independent stale state even if SQLite serializes writes. A future scale-out version needs transactional database-backed reads/writes and likely a redesigned schema.

Users carry id, name, email/password hash (null for door-only users), role, profile, and memberCode. Rooms contain title, revision, round, stage, roster, groups, firstGroups, undo, source, and creation time. Live room key is `live`; demo keys are `demo:<coach-id>`. Room group state stores arrays of user IDs; API views turn them into objects with IDs and computed warnings.

Skill levels: 1 Beginner, 2 Intermediate, 3 Advanced. Intensity: 1 Light, 2 Medium, 3 Hard. Preference: `same`, `above`, or `any`. A roster member is eligible only when present and not skipping. Class cap is 60; pairing requires at least two eligible members. A trio handles odd totals.

Stage progression: open → draft → confirmed. Next round requires confirmed Round 1, copies first-round groups, and opens Round 2. Check-ins are restricted to unconfirmed Round 1. Roster/check-in edits invalidate current draft groups and undo history. New class is an explicit reset with typed `NEW CLASS`, not a daily automatic rollover. Class-only skill edits do not alter saved member self-assessments.

Coach writes include the room's latest `revision`. A stale revision returns 409. This is optimistic concurrency within the single process, not multi-server coordination.

## Pairing behavior

The browser initializes `source='automatic'`; live classes always request automatic, regardless of demo selection. Mode switches, resets and Round 2 restore automatic source. Fixed suggestions are accepted only for the original eligible Round 1 demo roster.

Automatic pairing runs 32 seeded shuffled starts. Each start constructs a trio if needed, greedily pairs remaining members, then attempts local swaps for up to eight passes. The lowest-cost grouping is retained. Production supplies a fresh random seed; tests can supply deterministic seeds.

Group cost priorities:

1. Skill gap greater than one level or Light/Hard clash: each warning adds 10,000.
2. Repeated partners in Round 2: warning adds 1,000.
3. Smaller skill differences add 2 per level; intensity differences add 3 per level.
4. Unmet same/one-level-above preferences add 4 for each relevant member relationship.

Warnings remain visible for unresolved conflicts. The heuristic does not prove a flagged pairing is unavoidable and does not guarantee a global optimum. Confirming flagged groups requires explicit coach acknowledgment. Undo stores up to 50 pairing checkpoints. Fixed demo includes the intended Ethan/ Daniel level-gap warning; swapping Natalie/Sam demonstrates additional intensity clashes.

## API conventions

Use same-origin JSON requests. Writes require `Content-Type: application/json`; body limit is 20 KB. When an Origin header is present it must match the expected application origin. Cookies supply authentication; no client-side bearer token API is provided. JSON errors have an `error` message. Frontend polling interval is five seconds.

| Method / route | Use |
| --- | --- |
| GET `/api/health` | `{ok, storage}` |
| POST `/api/register` | `{name,email,password,role,invite?}`; invite required for coach |
| POST `/api/login` | `{email,password}`; sets account cookie |
| POST `/api/logout` | Revokes account session |
| GET `/api/me` | Current safe user, storage mode, door-session presence |
| POST `/api/profile` | `{level,intensity,preference}` |
| POST `/api/checkin` | Profile fields plus `skip` |
| GET `/api/member/status` | Own check-in and confirmed partner names |
| POST `/api/door/open` | Coach-only; creates door cookie, revokes current coach session |
| POST `/api/door/close` | Revokes door cookie |
| POST `/api/door/lookup` | `{code}`; restricted door session required |
| POST `/api/door/checkin` | `{code,...profile,skip}` or `{name,...profile,skip}` for first visit |
| GET `/api/coach/room?mode=live` | Shared class view; `mode=demo` returns private demo |
| POST `/api/coach/member?mode=live` | `{revision,id,level?,present?,skip?}` |
| POST `/api/coach/suggest?mode=live` | `{revision,source:'automatic'}` |
| POST `/api/coach/swap?mode=live` | `{revision,a,b}` user IDs in different groups |
| POST `/api/coach/undo?mode=live` | `{revision}` |
| POST `/api/coach/confirm?mode=live` | `{revision,acceptWarnings}` |
| POST `/api/coach/next-round?mode=live` | `{revision}` |
| POST `/api/coach/reset?mode=live` | `{revision,confirm:'NEW CLASS',title?}` |

There is no `/api/auth/login` route: use `/api/login`. All coach write routes support `mode=demo` as well. Read the implementation for exact error handling before writing integration scripts.

## Configuration

| Variable | Default / purpose |
| --- | --- |
| `PORT` | 3000; listens on 0.0.0.0 |
| `STORAGE_MODE` | `sqlite`; alternative `memory` |
| `DATA_DIR` | `./data` locally; Docker sets `/data` |
| `NODE_ENV` | Docker sets `production`; enables Secure cookies/HSTS |
| `COACH_INVITE_CODE` | If omitted, generated/read from DATA_DIR/coach-invite.txt |
| `APP_ORIGIN` | Optional exact origin override; otherwise protocol from production mode plus request host |

The code does not parse .env files. Environment values must be supplied by the shell, an explicit Node env-file invocation, or Railway Variables. Keep APP_ORIGIN aligned with the actual HTTPS domain if set.

Passwords use salted asynchronous scrypt. Account sessions last seven days, door sessions eight hours. Cookies are HttpOnly/SameSite=Strict and Secure in production; database tokens are SHA-256 hashed. Server authorization protects coach routes; members receive only their own data and confirmed partners. CSP restricts scripts/styles/connections to same origin. Auth and kiosk operations have in-memory rate limits; 429 means wait for the 15-minute window. This is a prototype's security implementation, not an audited platform.

## Data fixtures and demo walkthrough

For a fresh copy, use Create account → Coach with the local invitation, then Demo class. The 11 fictional names are Priya, Arjun, Ethan, Daniel, Natalie, Chloe, Maya, Leo, Sam, Marcus and Omar (opts out). Use automatic suggestions to exercise the real heuristic, or select fixed demo explicitly to reproduce Figma's warning scenario. Confirm and move to Hour 2 to test attendance and avoidance of repeats. Use Live class only with intended check-ins.

For local live-data testing, use personal accounts in separate browser profiles or unlock Door check-in and create fictional door visitors. There is no shipped production-seeding command or startup seed. The historical `(Mock)` production records were inserted through authenticated door check-in APIs, preserving existing users. Do not silently seed or clear production as part of deployment.

## Troubleshooting

- `node:sqlite` missing: use Node 24 (not an older system Node).
- Experimental SQLite warning: may occur on supported Node versions; check actual exit status/tests.
- Port in use: choose PORT=3011 or stop your old local server.
- Login works locally but not on HTTP in production mode: Secure cookies require HTTPS.
- Empty local roster: the archive does not contain the production database; use Demo class or check in local members.
- Existing account absent after restart: verify STORAGE_MODE, DATA_DIR and volume mount; RAM mode deliberately resets.
- 409 stale class: refresh before retrying with the current revision. Do not bypass conflict checking.
- Check-in closed: class is confirmed or in Round 2; follow coach workflow rather than resetting unexpectedly.
- Coach account gets signed out when opening door mode: intended isolation; sign in again after closing door mode.
- 403 during signup: use the correct invitation for this installation. Local and Railway invitations differ.
- Railway login succeeds but project missing: check the CLI account and accepted project membership.
- ZIP update does not change live app: local edits require a new successful `railway up` deployment.
