# Verification record

Local verification, November 12, 2026 (America/Los_Angeles).

## Automated tests

`npm test` initially could not open loopback sockets inside the restricted shell. Re-running with local networking permission passed all 10 tests:

1. Fixed demo contains exactly the intended level-gap flag.
2. Automatic grouping covers each member once at sizes 2, 3, 6, 7, 20, 21, 34, 35, and 60, including the correct trio rule.
3. Compatible input is grouped without skill/intensity violations.
4. Round 2 avoids repeats where a compatible tested arrangement exists; unavoidable two-person repeats are flagged.
5. Invalid coverage and one-person input are rejected.
6. Coach authorization, wrong invitations, origin rejection, password hashing, and logout.
7. Live check-in, stale revision rejection, confirmation, member-data privacy, and second round.
8. Demo isolation, fixed suggestions, swapping, undo, and changed-roster rejection.
9. Scoped door session, revoked coach login, first/returning door check-in, and closing door access.
10. SQLite persistence across store restarts; fresh RAM storage.

## Browser walkthrough

Checked in the browser at desktop width and 390×844 mobile:

- Coach sign-in and empty live class.
- Fictional demo roster and fixed pairing source.
- Skippable shake transition and suggested pairs.
- Natalie/Sam swap creates two intensity warnings; Undo restores the original state.
- Explicit confirmation of the initial flagged demo pair.
- Names-only call-out and transition to Round 2.
- Attendance change removes Arjun; nine eligible members produce one trio and three pairs.
- Mobile layout has no horizontal overflow (`scrollWidth === innerWidth === 390`).
- Shared-door activation, first-visit choices, confirmation, next member, private-code lookup, and returning-visit layout.
- Door close, coach reauthentication, and personal-phone check-in confirmation.
- No browser console errors recorded during the walkthrough.

Visual inspection is based on the Figma browser reference, not connector-extracted assets. Testing does not establish full WCAG conformance or production security certification.

Additional checks: a varied 60-member roster produced valid coverage in 262 ms on the local machine. Calculated contrast ratios: white body text 18.33:1, secondary text on member tiles 6.51:1, white primary-button text 5.70:1, warning text 10.23:1, compatibility text 9.00:1. Mode selectors and explanation controls use at least 44px targets. Route transitions focus the heading; native dialogs trap keyboard focus. A desktop preview is saved in `screenshots/coach-desktop.png`.

## Deployment

Deployed directly from local source without GitHub to https://pair-up-production.up.railway.app.

- Railway project: Pair Up — CPEN 441; single Node 24 Docker service, volume mounted at `/data`.
- Production `/api/health` returned `{"ok":true,"storage":"sqlite"}`.
- Production API checks passed: coach account creation, Secure/HttpOnly cookies, unauthorized-role rejection, cross-origin rejection, fixed demo, swap warnings, undo, confirmation, Round 2 automatic pairing, scoped door access, and logout.
- Restarted Railway service successfully, then signed into the same coach account in the browser, verifying account persistence across an actual service restart.
- Deployed browser showed demo suggestions with five pairs and the intended level-gap warning; no console errors recorded. Screenshot: `screenshots/production.png`.
- Final automated test run: 10 passed, 0 failed.
- Infrastructure plan retains the generated domain and volume (0 additions, 0 destructions); Railway reports only the explicit Docker builder setting as a change. The successful deployment used the Dockerfile.

A real check-in appeared during final verification and was left untouched. Production demo checks remain separate from the live class.
