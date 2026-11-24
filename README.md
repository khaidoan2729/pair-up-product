# Pair Up — full product prototype

CPEN 441 Group 2. A working member and coach application based on the team's Pair Up Figma. This is separate from the D6 controlled-study app in `../pair-up`.

## Run locally

Requires Node 22.13+ (Node 24 recommended). No runtime dependencies, package installation, database service, or frontend build is required. The Railway SDK is a development dependency used only for deployment configuration.

```sh
npm start
```

Open http://localhost:3000. Default storage is SQLite in `data/pair-up.sqlite`.

```sh
STORAGE_MODE=memory npm start       # disposable accounts and classes
PORT=3011 npm start                # alternative port
DATA_DIR=/path/to/storage npm start
npm test
```

The same SQLite-backed repository uses `:memory:` in RAM mode. No server-state logic is mocked in RAM mode. A restart loses RAM data; SQLite accounts, sessions, profiles, attendance, and pairings survive. Do not switch storage modes while collecting data you intend to keep.

## First coach

At startup, the server creates a random invitation in `data/coach-invite.txt`, unless `COACH_INVITE_CODE` is provided. Keep this secret. Open Create account → Coach and enter this invitation. Members can sign up normally without an invitation. Coaches can also check in as members.

There are no public default passwords. Deployment credentials and local test credentials, if created during setup, are kept in `.local/` and are excluded from deployment. Never publish that directory or the data directory.

## Member flow

1. Create an account or sign in on a personal phone.
2. On the first visit choose skill, intensity, and preferred partner.
3. On later visits reuse the profile or change today's intensity. Opt out of pairing without giving a reason.
4. Check in. When the coach confirms, partner names appear automatically (polling every five seconds).
5. Find a private door code in My account for shared-device visits.

## Shared door phone

1. A coach signs in on the shared device and selects Open door check-in.
2. Enabling door mode revokes this device's coach login. A separate eight-hour cookie permits only check-in operations.
3. Returning members enter their private code; first visitors can create a name-and-preferences door profile without a password. The code is shown on confirmation for their next visit.
4. Next member clears the previous person's information. Confirmation auto-clears after 30 seconds; incomplete profiles clear after 90 seconds of inactivity.
5. Close door mode and sign in again to access coach controls.

Door-created profiles are not email accounts and cannot log into personal mode. Personal accounts can use both modes with the same code. Account linking, email verification, and password-recovery email are not implemented.

## Coach flow

- Live class displays real check-ins, automatically refreshed. Skills and preferences are coach-only.
- Edit a member's skill, attendance, or opt-out status. Skill edits apply to this class, not their saved self-assessment.
- Shake generates suggestions; the animation can be skipped and honors reduced-motion preferences.
- Select two names in different groups to swap. Undo reverses pairing actions. Warnings remain visible; confirmation requires explicit acknowledgment if warnings exist.
- Confirm switches to names-only call-out and publishes partner names to members.
- Re-pair for Hour 2 opens attendance editing, then generates new suggestions accounting for Round 1 partners.
- New class clears the active roster/pairs but preserves accounts. Typed confirmation is required. There is no attendance archive in this prototype.

Confirmed rounds reject late check-ins; the member is directed to the coach. Membership changes invalidate drafts. Revision checks reject stale edits from another coach device.

## Demo versus automatic pairing

Each coach has an independent fictional demo class, separate from live users. The demo has the 11 Figma names, with Omar opting out. Round 1 can use the five fixed Figma-style pairs, including the Ethan/Daniel level-gap warning. Swapping Natalie and Sam demonstrates the intensity warnings. Reset demo restores its original roster.

Automatic pairing operates on eligible, present members in either class. It performs 32 seeded multi-start greedy solutions followed by local swaps. Skill gaps above one level and Light/Hard clashes receive dominant penalties, prior partners receive a lower penalty, and preferences and smaller differences receive soft penalties. Every member appears exactly once, with exactly one trio for odd totals. At least two members are required; the class limit is 60.

This is a heuristic, not a guarantee of globally optimal or safe boxing matches. Unresolved compatibility and repeat-partner conflicts are shown for coach review. No claim is made that a flagged combination is mathematically unavoidable.

## Deploy without GitHub

Live app: https://pair-up-production.up.railway.app

The Dockerfile serves frontend and API together on one Node 24 Railway service. The existing deployment has a persistent volume at `/data`. Private coach credentials and the invitation code are in `.local/production-access.json` on this computer.

To update the existing deployment from this directory:

```sh
railway login
railway link --project e356ec53-1f40-4fa7-b898-d452861a8de0
railway up --service pair-up
```

Infrastructure is defined in `.railway/railway.ts`. For infrastructure changes, run `npm ci`, then `railway config plan` and review the proposed changes before `railway config apply`. Application uploads do not require GitHub.

CLI setup flags may vary by version; consult `railway --help`. Attach the volume to the app service before deployment. Use a single replica with this SQLite deployment. The Dockerfile sets `NODE_ENV=production`, `STORAGE_MODE=sqlite`, and `DATA_DIR=/data`. Railway supplies `PORT`. Set a private `COACH_INVITE_CODE` variable for provisioning coaches. Set `APP_ORIGIN` to the deployed HTTPS origin if needed; otherwise origin checks use the request host.

Do not use `--no-gitignore`: normal uploads exclude local data and secrets. No GitHub repository is needed. Railway service and volume charges apply under your existing plan.

## Security and prototype boundaries

- Scrypt password hashes; random, hashed server-side sessions; HttpOnly/SameSite cookies, Secure cookies in production.
- Server-side role authorization, scoped kiosk sessions, origin checks, JSON-only writes, request-size limits, rate limiting, escaped text output, restrictive CSP, and HTTPS security headers.
- Member APIs expose only the current member's preferences and confirmed partner names, not the roster's skill/intensity data.
- Public signup has no email verification, password reset, or MFA. This is a single-club course prototype, not a production membership platform.
- Back up the persistent Railway volume before consequential use. RAM mode is deliberately disposable.
- Fictional demo data is not research evidence. Maintain the course AI-use log separately.

## Design reference

https://www.figma.com/design/X1LPA8jNRf6EAIEdUQClLk/CPEN-441-G2-%E2%80%93-Pair-Up--Magic-Ball--Prototype?node-id=22-355

The connector could not extract the file because of account permissions; all nine screens/overlays were visually inspected in Figma's browser viewer. The UI preserves the dark palette, purple controls, crystal-ball motif, check-in choices, skill overlay, suggestions, swap warning, call-out, and Hour 2 flow. The crystal ball is a CSS recreation, not an exported original asset. Desktop layouts and account screens extend the phone-first reference.
