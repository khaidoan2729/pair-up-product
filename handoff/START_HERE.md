# Pair Up: teammate and AI-agent handoff

Prepared November 18, 2026. Read this file first, then `README.md`, `handoff/TECHNICAL_REFERENCE.md`, and `docs/verification.md`. This archive contains editable source, not just a built website. No GitHub repository is required.

## Project context and agreed requirements

Pair Up is CPEN 441 Group 2's full product prototype for a boxing club. Members check in with skill, desired intensity, and partner preferences; coaches review attendance, generate suggestions, adjust groups, and confirm partners. It follows the team's Figma, with additional authentication and desktop layouts.

Design reference: https://www.figma.com/design/X1LPA8jNRf6EAIEdUQClLk/CPEN-441-G2-%E2%80%93-Pair-Up--Magic-Ball--Prototype?node-id=22-355

This is NOT the separate D6 pilot experiment. The original workspace also had a sibling `pair-up` directory for that study; it is intentionally absent from this archive. Do not add the study's counterbalanced trial schedule or timing requirements to this product without asking. The user pivoted to the full product associated with D7. Confirm current course submission requirements independently; this archive is an engineering handoff, not the course specification.

User preferences already established:

- Keep a real backend and accounts; support persistent SQLite AND optional disposable RAM storage.
- Use persistent storage on Railway. RAM mode is for deliberate local testing.
- Automatic pairing is the default. Fixed fictional suggestions are optional and restricted to Round 1 of the original demo roster.
- Support personal-phone sign-in/check-in and a shared door device unlocked by a coach.
- Preserve the Figma's dark palette, purple controls, crystal-ball motif, and coach workflows.
- Deploy frontend and backend together to Railway; GitHub was intentionally not required.
- Work autonomously on ordinary implementation/testing, but obtain human login access when necessary and protect existing live data.

## What already works

Member accounts and role-based coach accounts; first/returning check-in; profile and intensity preferences; skip pairing; private member code for the door device; confirmed partner display refreshed every five seconds.

Coach roster with class-only skill/attendance/skip edits; optional fixed demo or automatic suggestions; skippable shake animation; compatibility warnings; swapping two members across groups; undo; explicit acceptance of flagged groups before confirming; names-only call-out; Round 2 attendance changes and repeat-partner avoidance.

Door mode revokes that device's normal coach session and uses a restricted eight-hour cookie. Returning members use private codes; first visitors can create door-only profiles. Door-only profiles do not have passwords or personal-account sign-in. Confirmation clears after 30 seconds; incomplete forms clear after 90 seconds idle.

One live class is shared by all coaches. Each coach has their own fictional demo class. These are not multiple independent clubs. Live edits use revision checks to reject stale writes.

## First local run

1. Extract the ZIP. Open a terminal in `pair-up-product` (the directory containing `package.json`).
2. Install Node.js 24 LTS. Verify `node --version` and `npm --version`. Node 22.13+ is declared supported; Node 24 matches deployment.
3. Run `npm start`, then open http://localhost:3000.
4. The server creates `data/pair-up.sqlite` and a private `data/coach-invite.txt` on first start. Read that invitation locally. In the app choose Create account, select Coach, and enter it. Choose your own email-format identifier and password of at least 10 characters. No email verification is implemented.
5. Sign in as the coach and choose Demo class for immediate fictional data. Live class starts empty in a fresh local database.
6. In another browser profile or private window, register a member and check in. The coach's Live class will update. Separate browser profiles avoid replacing the same session cookie.

No dependency installation or frontend build is necessary to start the application or run tests: runtime code uses Node built-ins. `npm ci` installs the lockfile's development dependencies when needed for Railway infrastructure configuration. The package named `railway` is the infrastructure SDK, NOT the `@railway/cli` command-line tool.

Commands for macOS/Linux/WSL:

```sh
npm start                         # persistent local SQLite
npm test                          # isolated test databases and local HTTP servers
npm run dev                       # watch mode, disposable RAM accounts/class state
PORT=3011 npm start                # use another port
DATA_DIR=./scratch-data npm start  # separate persistent local database
STORAGE_MODE=memory npm start      # disposable state without watch
```

On Windows PowerShell set variables separately, e.g. `$env:STORAGE_MODE='memory'; npm start`. `npm run dev` uses POSIX environment syntax; use WSL or equivalent PowerShell commands. The app does not automatically load `.env`; set environment variables in the shell or hosting settings. `NODE_ENV=production` enables Secure cookies: use ordinary development mode on local HTTP.

Stopping/restarting SQLite mode preserves accounts/classes. RAM mode loses them on restart. Even RAM mode may write a local coach invitation file unless `COACH_INVITE_CODE` is supplied. There is no default public password.

## Live deployment and existing data

- App: https://pair-up-production.up.railway.app
- Dashboard: https://railway.com/project/e356ec53-1f40-4fa7-b898-d452861a8de0
- Project: Pair Up — CPEN 441
- Project ID: `e356ec53-1f40-4fa7-b898-d452861a8de0`
- Environment: `production` (`d7f572cb-c6f4-4444-a139-1a5224032b4c`)
- Service: `pair-up` (`d789e1b9-9f7e-4047-945e-eab7631fa0c4`)
- Volume: `pair-up-volume`, mounted at `/data`; SQLite file `/data/pair-up.sqlite`.
- One service, one replica, region `us-west2`; volume provisioned at 5 GB during setup.

These identifiers are routing information, not credentials. Status and class attendance may have changed since initial verification.

After initial deployment, Andrew requested 11 fictional members added to the LIVE database. They are labeled `(Mock)`, use varied skills/intensities, and one opts out. There was also an existing real check-in which was preserved. These records persist on Railway; they are NOT automatically seeded into a fresh database. The code's Demo class is independently available on every installation and contains the original 11 fictional names without the suffix. No production database or account passwords are in this ZIP.

A coach account named Andrew Coach was created with email-format login `andrew.coach@pairup.local`. Ask Andrew to share access privately if necessary, or use the existing production invitation to register your own coach. App coach access and Railway deployment access are two separate systems. The app's coach invitation is not a Railway token.

## How the original Railway authentication worked

Andrew did NOT paste an API key. The agent started Railway CLI login, opened the device-authorization page, and Andrew signed in and authorized the CLI in the browser. A refreshed device-code approval was scoped to his workspace and the Pair Up project. The consent screen included workspace/project administration, SSH-key management, and persistent sign-in; Andrew explicitly approved. Railway then authenticated the CLI, which uploaded local source. No Railway password was embedded in application code. Device codes were temporary, not reusable deployment credentials.

Do not copy Andrew's local Railway authentication files or ask him to send his account password. The ZIP intentionally contains neither. A teammate's AI agent can run CLI commands after the teammate authorizes their own login.

## Updating the existing Railway deployment (recommended)

1. Andrew opens Project Settings → Members in the linked dashboard and invites the teammate with suitable project access. The teammate accepts using their own Railway account. This handoff does not itself grant access or send an invitation.
2. Install the official CLI and authenticate:

```sh
npm install -g @railway/cli
railway login
railway whoami
```

Complete the browser sign-in/consent. In a headless environment, `railway login --browserless` prints a URL and pairing code to approve in a browser. The human should authorize the intended account/project.

3. In the extracted source directory, link the existing project:

```sh
railway link --project e356ec53-1f40-4fa7-b898-d452861a8de0
railway status
```

If prompted, select production and pair-up. Verify the target shown by `railway status` before deployment. CLI login/link state is machine-specific and is not supplied by the ZIP.

4. Make and test changes locally, then upload:

```sh
npm test
railway up --service pair-up --environment production
```

`railway up` compresses and uploads the current local directory. Railway builds the root Dockerfile and runs the new container. This is source upload, not a Git push. The volume survives a normal application redeploy. Do not detach/delete the volume, reset the live class, or change storage mode as part of a routine update.

5. Verify deployment success in Railway. Check:

```sh
curl -fsS https://pair-up-production.up.railway.app/api/health
```

Expected JSON: `{"ok":true,"storage":"sqlite"}`. Then sign in through the browser, check the roster, and exercise Demo class. Health alone does not prove login/pairing/persistence. Test real-class mutations only when authorized.

If deployment fails, inspect Railway build/deploy logs; `railway logs --help` describes CLI options. A queued upload is not a successful deployment. Previous deployments can be redeployed through Railway, but rolling back code does not undo database changes.

## Creating a separate Railway deployment

For a teammate-owned copy, create a new project and an empty service named pair-up in their Railway dashboard, then link that project with `railway link`. Before the first deployment:

- Add a persistent volume to the service with mount path `/data`.
- Keep one replica. Configure Dockerfile builds and health check `/api/health`.
- Set `STORAGE_MODE=sqlite`, `DATA_DIR=/data`, `PORT=3000`, and a new private `COACH_INVITE_CODE` in service Variables. The Dockerfile already sets production mode, storage mode, directory, and port defaults. The original deployment also set `RAILWAY_DEPLOYMENT_OVERLAP_SECONDS=0`.
- Use a newly generated invitation (for example `node -e "console.log(require('node:crypto').randomBytes(24).toString('base64url'))"`), not Andrew's existing secret.
- Run `railway up --service pair-up` from the source directory. Generate a public Railway domain targeting port 3000 in Networking or with `railway domain --service pair-up --port 3000`.
- Register a new coach using your new invitation. Accounts from the old deployment will not exist in this new database.

`.railway/railway.ts` describes the ORIGINAL project's infrastructure and domain. It is not portable unchanged: update project name, domain and resource settings for a new deployment before applying it. Never apply the original generated domain to a second project. Basic Docker source deployment does not require applying this infrastructure file.

## Infrastructure configuration and data operations

For an intentional infrastructure change, install dev dependencies with `npm ci`, then run `railway config plan` and inspect the target and all proposed actions. Only then run `railway config apply` if the changes are intended. The file manages this service/volume as a partial and leaves environment variables unmanaged. Do not inadvertently remove the volume/domain or overwrite secrets. The initial post-deployment plan reported only the explicit Docker builder setting as a difference; inspect fresh output rather than assuming no drift.

SQLite is a file on Railway's persistent volume, not a separate managed database service. Source ZIPs and code rollbacks do not back it up. Before database migrations or transferring production data, arrange a consistent backup through Railway's supported volume/backup tooling, or a SQLite-aware backup procedure. Do not simply copy a live `.sqlite` file and ignore its WAL. Restore a copy into an isolated environment and verify before touching production. Never distribute a database snapshot casually: it contains account information, hashes, profiles, and class state. Persistent storage is not itself a backup strategy.

## Validation and known limits

The original deployment passed 10 automated tests and production checks for login, role restrictions, cookies/origin validation, pairing/swap/undo/confirmation, Round 2, and scoped door mode. A real Railway restart followed by successful coach sign-in verified persistence. See `docs/verification.md` for historical detail and screenshots. Re-run tests for your own changes; historical evidence is not a guarantee about current hosting state.

No password reset, email verification, MFA, email delivery, user administration, class archive, multi-club isolation, or account-linking workflow is implemented. New class clears the current roster/pairs while preserving users. The server stores the application state as a JSON snapshot inside SQLite; see the technical reference before changing it. Pairing is a heuristic, not an optimality or safety guarantee. The coach reviews warnings and makes the final choice.

Figma extraction through the connector was unavailable during implementation; the screens were inspected visually in the browser. The ball is CSS artwork, not an exported original asset. No claim of pixel-perfect parity or full WCAG certification is made.

## Instructions for the next AI agent

Read the handoff and actual source before editing. Preserve the existing product scope and user preferences above. Inspect live state read-only if needed; do not assume it still matches screenshots. Use an isolated local database for tests. Keep credentials and production data out of commits, archives, logs, and screenshots. Do not ship a seeded public coach password or auto-reset production at startup. Do not replace automatic pairing with fixed data. Do not add a separate frontend host unnecessarily: the current same-origin server avoids cross-origin session complications.

For a normal change: understand the affected flow, implement locally, run relevant tests, verify responsive browser behavior, then deploy only to the intended authorized project. Report what changed, test evidence, live URL, and limitations. Before adding a schema migration, design backup/rollback and compatibility handling. If moving to multiple instances, redesign state synchronization/database access first.

This ZIP is also suitable as a starting Git repository. Review its contents, run `git init`, and commit source and documentation. Keep the supplied ignore files. Do not commit any credentials/database files generated after extraction. GitHub integration can be added later, but it was not part of the original deployment.

## Official Railway references (checked November 18, 2026)

- CLI installation: https://docs.railway.com/cli
- Browser/device login: https://docs.railway.com/cli/login
- Local source upload: https://docs.railway.com/cli/up
- Project invitations: https://docs.railway.com/projects

CLI flags/UI labels can evolve; consult current `railway <command> --help` if they differ.
