# Its Games Night

Free party games you play together in the same room, each on your own phone.
One person hosts, everyone else joins with a 6-character code or an invite link.
No app install and no sign-up.

**Live:** https://www.itsgamesnight.com

| Game | Players | What happens |
| --- | --- | --- |
| **Mafia** | 4+ | Hidden roles (Mafia, Doctor, Detective, Civilians), timed night turns with sound cues, day discussion and ballot voting. |
| **Word Imposter** | 3+ | Everyone gets a secret word except the imposter(s), who get a decoy word or none. Describe, vote, unmask. |
| **Spyfall** | 3+ | Everyone knows the location except the spy. Question each other before time runs out. |
| **Spin the Wheel** | 2+ | Pick a random player or spin a custom wheel of forfeits. |

## Stack

- React 19 + React Router 7, built with Vite, styled with Tailwind CSS
- Firebase Anonymous Auth + Cloud Firestore (real-time room state)
- Hosted on Vercel (Hobby). Firebase runs on the free Spark plan, so it can never bill you; at worst it pauses until the daily quota resets.

## How it works

- **Rooms** are documents in `rooms/{roomId}`, with `playerIds` (used by the security rules), `players`, `hostId` and an `activeActivity` (the current game).
- **Games are state machines.** The rules for each game live in pure, unit-tested modules:
  - `src/games/mafia/logic.js`
  - `src/games/wordImposter/logic.js`
  - `src/games/spyfall/logic.js`
- **Every phase change is a guarded transaction** (`transitionActivity` in `src/lib/activity.js`). It only applies if the game is still in the expected phase (`phaseId`), so two phones can never double-advance a phase.
- **The game keeps going without the host.** Timed phases are advanced by the host, and if the host's phone sleeps or they leave, the other players step in automatically after a few seconds (`useAutoAdvance`).
- **Votes and "ready" clicks** use `arrayUnion`/per-player fields, so simultaneous taps never overwrite each other.
- **Profile photos** are compressed on-device (max 24 KB) and stored once in `profiles/{uid}`, not in every room update. This keeps Firestore bandwidth low.
- **Expired rooms** (12h idle) are swept by clients, at most once every 6h per device. The security rules only allow deleting rooms that have actually expired.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in from Firebase console > Project settings > Your apps
npm run dev
```

Use the staging Firebase project (`gamenight-ca21d`) for testing: put its config in `.env.staging.local` and run `npm run dev:staging`.

```bash
npm test        # game logic unit tests (Vitest)
npm run lint    # ESLint
npm run build   # production build into dist/
```

## Security rules

`firestore.rules` is the source of truth. Deploy it from the Firebase console (Firestore > Rules: paste and Publish) or with the Firebase CLI:

```bash
npx firebase-tools deploy --only firestore:rules            # production (gamenight-a9307)
npx firebase-tools deploy --only firestore:rules -P staging # staging (gamenight-ca21d)
```

What they enforce:
- Only signed-in (anonymous) users can read rooms, and listing is limited to small queries (code lookups).
- Only members can change a room. Non-members can only add themselves.
- Only the host can remove other players or hand over hosting. Players can only remove themselves.
- Rooms can only be deleted by their host, by the last player, or once they have expired.
- Users can only write their own profile photo, up to about 40 KB.

## Deploying

Pushing to `main` deploys to production on Vercel. Pull requests get preview deployments.
Environment variables (`VITE_FIREBASE_*`) are set in Vercel > Project > Settings > Environment Variables.

## Free-tier budget (rough)

Firestore Spark limits are 50k reads, 20k writes and 20k deletes per day, plus 10 GiB of outbound data per month.
A typical 8-player Mafia game uses roughly 100 to 150 writes and about 1k reads. That leaves room for well over 100 games a day before the quota pauses things.

## Project layout

```
src/
  components/     screens, lobby cards, shared UI (Toast, ConfirmDialog, GameShell)
  games/          pure game logic + tests
  hooks/          useAuth (context), useRoom (room data + photos)
  lib/            activity transitions, lobby helpers, profiles, randomness
  spyfall/, wordImposter/, mafia/   game screens and content (locations, words, sounds)
  rules/          "How to play" text shown in the lobby
firestore.rules   security rules
```
