import React, { Suspense, lazy as reactLazy } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { ToastProvider } from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import { LoadingScreen } from './ui';
import WelcomeScreen from './components/WelcomeScreen';
import OnboardingScreen from './components/OnboardingScreen';
import HomeScreen from './components/HomeScreen';
import NotFound from './components/NotFound';
import { isStagingBuild } from './firebase';

// After a new deploy, files from the old build are gone. A tab that was open
// across the deploy reloads once to pick up the new build instead of crashing.
const RELOAD_KEY = 'gamenight_chunk_reload';
function lazy(load) {
  return reactLazy(() => load()
    .then((module) => {
      try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* storage unavailable */ }
      return module;
    })
    .catch((error) => {
      let alreadyTried = false;
      try {
        alreadyTried = sessionStorage.getItem(RELOAD_KEY) === '1';
        if (!alreadyTried) sessionStorage.setItem(RELOAD_KEY, '1');
      } catch { alreadyTried = true; }
      if (!alreadyTried) {
        window.location.reload();
        return new Promise(() => {});
      }
      throw error;
    }));
}

// Game screens are loaded on demand so the first page loads fast
const GamesScreen = lazy(() => import('./components/GamesScreen'));
const MafiaGame = lazy(() => import('./components/MafiaGame'));
const WordImposterGame = lazy(() => import('./wordImposter/WordImposterGame'));
const SpyfallGame = lazy(() => import('./spyfall/SpyfallGame'));
const PrivacyPage = lazy(() => import('./components/PrivacyPage'));
const JoinByCode = lazy(() => import('./components/JoinByCode'));
const OnePhoneHome = lazy(() => import('./onephone/OnePhoneHome'));
const OnePhoneGames = lazy(() => import('./onephone/OnePhoneGames'));
const OnePhoneMafiaRoute = lazy(() => import('./onephone/OnePhoneMafiaRoute'));
const OnePhoneWordImposter = lazy(() => import('./onephone/modes/OnePhoneWordImposter'));
const OnePhoneSpyfall = lazy(() => import('./onephone/modes/OnePhoneSpyfall'));

function App() {
  return (
    <ErrorBoundary>
      {isStagingBuild && (
        <div className="pointer-events-none fixed left-1/2 top-0 z-[200] -translate-x-1/2 rounded-b-sm bg-warning px-2 text-xs font-semibold text-black">
          Staging
        </div>
      )}
      <ToastProvider>
        <AuthProvider>
          <Router>
            <Suspense fallback={<LoadingScreen />}>
              <Routes>
                <Route path="/onboarding" element={<OnboardingScreen />} />
                <Route path="/" element={<WelcomeScreen />} />
                <Route path="/join/:code" element={<JoinByCode />} />
                <Route path="/one-phone" element={<OnePhoneHome />} />
                <Route path="/one-phone/games" element={<OnePhoneGames />} />
                <Route path="/one-phone/mafia" element={<OnePhoneMafiaRoute />} />
                <Route path="/one-phone/word-imposter" element={<OnePhoneWordImposter />} />
                <Route path="/one-phone/spyfall" element={<OnePhoneSpyfall />} />
                <Route path="/room/:roomId" element={<HomeScreen />} />
                <Route path="/room/:roomId/games" element={<GamesScreen />} />
                <Route path="/room/:roomId/games/mafia" element={<MafiaGame />} />
                <Route path="/room/:roomId/games/word-imposter" element={<WordImposterGame />} />
                <Route path="/room/:roomId/games/spyfall" element={<SpyfallGame />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </Router>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
