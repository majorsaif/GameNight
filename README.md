# GameNight

A React web app for managing game nights, built with Vite and React Router.

## Project Structure

```
GameNight/
├── src/
│   ├── components/
│   │   ├── WelcomeScreen.jsx    # Landing page with Host/Join options
│   │   ├── WelcomeScreen.css
│   │   ├── HomeScreen.jsx        # Room page with host/player views
│   │   └── HomeScreen.css
│   ├── hooks/
│   │   ├── useAuth.js            # Mock auth hook (Firebase ready)
│   │   └── useRoom.js            # Mock room data hook (Firestore ready)
│   ├── App.jsx                   # Router setup
│   ├── main.jsx                  # React entry point
│   └── index.css                 # Global styles
├── index.html
├── vite.config.js
└── package.json
```

## Features

- **WelcomeScreen** (`/`):
  - Host a Game Night button
  - Join with room code input
  - My Nights section (placeholder for saved games)

- **HomeScreen** (`/room/:roomId`):
  - Conditional rendering based on host status
  - Host view: Player list, Games button, Forfeit Wheel, End Game Night
  - Player view: Player list, Games button, Forfeit Wheel, Leave Game
  - Settings icon in top right corner
  - Room code display

## Architecture

All data-fetching logic is encapsulated in custom hooks:

- **`useAuth()`** - Returns mock user object
  - Ready to swap with Firebase anonymous auth
  
- **`useRoom(roomId)`** - Returns mock room data
  - Ready to swap with Firestore real-time listener
  - Includes `isHost` helper for conditional rendering

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Development

The app is currently running with mock data. When ready to integrate Firebase:

1. Install Firebase: `npm install firebase`
2. Update `useAuth.js` to use Firebase Authentication
3. Update `useRoom.js` to use Firestore listeners
4. Components will work without changes (data layer is abstracted)

## Routes

- `/` - Welcome screen
- `/room/:roomId` - Room screen (host or player view)
