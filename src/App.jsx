import React from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import OnboardingScreen from './components/OnboardingScreen';
import WelcomeScreen from './components/WelcomeScreen';
import HomeScreen from './components/HomeScreen';
import GamesScreen from './components/GamesScreen';
import WheelSpin from './components/ForfeitWheel';
import MafiaGame from './components/MafiaGame';
import WordImposterGame from './wordImposter/WordImposterGame';
import SpyfallGame from './spyfall/SpyfallGame';
import OnePhoneHome from './onephone/OnePhoneHome';
import OnePhoneGames from './onephone/OnePhoneGames';
import OnePhoneMafia from './onephone/modes/OnePhoneMafia';
import OnePhoneMafiaLobby from './onephone/modes/OnePhoneMafiaLobby';
import { useLocation } from 'react-router-dom';

function OnePhoneGamePlaceholder({ title }) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col">
      <header className="relative z-40 w-full max-w-md mx-auto px-4 sm:px-6 py-4">
        <div className="flex justify-between items-center">
          <div className="h-8" />
          <button
            onClick={() => navigate('/one-phone')}
            className="flex items-center justify-center w-11 h-11 bg-slate-800 border border-slate-700 rounded-full text-slate-300 hover:text-violet-300 hover:bg-slate-700 transition-colors"
            title="Back to Pass & Play"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
      </header>

      <main className="relative z-0 flex-1 w-full max-w-md mx-auto px-4 sm:px-6 py-6 flex flex-col items-center justify-center text-center gap-5">
        <div className="text-6xl">🎮</div>
        <h1 className="text-4xl font-black text-white">{title}</h1>
        <p className="text-slate-400 max-w-sm">
          This one-phone game screen is a placeholder for now.
        </p>
        <button
          onClick={() => navigate('/one-phone')}
          className="px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold transition-colors"
        >
          Back to Pass &amp; Play
        </button>
      </main>
    </div>
  );
}

function OnePhoneMafiaRoute() {
  const location = useLocation();

  const routeState = location.state || {};
  if (!routeState.started) {
    return <OnePhoneMafiaLobby players={Array.isArray(routeState.players) ? routeState.players : []} />;
  }

  const players = Array.isArray(routeState.players) ? routeState.players : [];
  const narrator = routeState.narrator || null;
  const rules = routeState.rules || {
    mafiaCount: 1,
    doctorEnabled: true,
    detectiveEnabled: true
  };

  return <OnePhoneMafia players={players} narrator={narrator} rules={rules} />;
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/onboarding" element={<OnboardingScreen />} />
        <Route path="/" element={<WelcomeScreen />} />
        <Route path="/one-phone" element={<OnePhoneHome />} />
        <Route path="/one-phone/games" element={<OnePhoneGames />} />
        <Route path="/one-phone/mafia" element={<OnePhoneMafiaRoute />} />
        <Route path="/one-phone/word-imposter" element={<OnePhoneGamePlaceholder title="Word Imposter" />} />
        <Route path="/one-phone/spyfall" element={<OnePhoneGamePlaceholder title="Spyfall" />} />
        <Route path="/room/:roomId" element={<HomeScreen />} />
        <Route path="/room/:roomId/games" element={<GamesScreen />} />
        <Route path="/room/:roomId/games/mafia" element={<MafiaGame />} />
        <Route path="/room/:roomId/games/word-imposter" element={<WordImposterGame />} />
        <Route path="/room/:roomId/games/spyfall" element={<SpyfallGame />} />
        <Route path="/wheel" element={<WheelSpin />} />
      </Routes>
    </Router>
  );
}

export default App;
