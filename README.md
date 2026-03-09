# GameNight

GameNight is a React + Vite party-room app powered by Firebase Auth (anonymous) and Firestore.

Users set a local display name and optional profile photo, then host or join live rooms with invite codes. Rooms support interactive activities including vote flows, wheel spins, and Mafia.

Live and usable: https://itsgamesnight.com

## Current Stack

- React 19
- React Router
- Firebase Auth (anonymous)
- Firestore (real-time room state)
- Tailwind CSS
- Vite

## What Works Today

- Onboarding flow (`/onboarding`)
  - Name is required (`gamenight_nickname`)
  - Optional profile photo stored as base64 (`gamenight_photo`)
- Silent auth
  - Firebase anonymous auth starts in background via `useAuth`
  - No provider sign-in UI
- Room system
  - Host a room and generate 6-character code
  - Join a room by invite code
  - Real-time player list and room activity updates
- Activities
  - Vote modal + active vote state
  - Forfeit wheel (player or custom wheel)
  - Mafia lobby + game route
- Profile/settings
  - Change display name
  - Add/change/remove photo
  - Log Out clears all `gamenight_*` keys and restarts anonymous auth
- Startup cleanup
  - On app boot (`main.jsx`), stale rooms are cleaned from Firestore once
  - Deletes rooms older than 12 hours using `lastActivity`, or `createdAt` fallback when `lastActivity` is missing

## Routes

- `/onboarding` - first-time setup (name + optional photo)
- `/` - welcome/home hub (host or join by code)
- `/room/:roomId` - live room screen (host/player views)
- `/room/:roomId/games` - games browser
- `/room/:roomId/games/mafia` - mafia game screen
- `/wheel` - wheel component route
- `/profile` - profile editor and logout

## Environment Variables

Create a `.env` file in the project root:

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Also ensure in Firebase console:

- Anonymous Auth is enabled
- Firestore is created and accessible by your rules for intended usage

## Setup

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

## Key Files

- `src/main.jsx` - app bootstrap + one-time startup room cleanup call
- `src/utils/roomCleanup.js` - Firestore stale-room query + batch delete
- `src/firebase.js` - Firebase app/auth/firestore initialization
- `src/hooks/useAuth.js` - local profile state + anonymous auth lifecycle
- `src/hooks/useRoom.js` - room CRUD, join/leave, real-time sync, activities
- `src/components/OnboardingScreen.jsx` - local profile setup UI
- `src/components/WelcomeScreen.jsx` - host/join entry screen
- `src/components/HomeScreen.jsx` - room UI, host/player actions, activity launch
- `src/components/ProfileScreen.jsx` - profile editing and logout

## Data Notes

- Room documents are stored in the Firestore `rooms` collection.
- Players include identity and avatar metadata used across room/game UIs.
- Current local/session storage keys in use include:
  - `gamenight_nickname`
  - `gamenight_photo`
  - `gamesnight_active_room`
  - `gamesnight_rooms` (used by avatar utility helpers)

## NPM Scripts

- `npm run dev` - start development server
- `npm run build` - production build
- `npm run preview` - preview production build locally
