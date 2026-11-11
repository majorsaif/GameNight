import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { ToastProvider } from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import { GameLoading } from './components/GameShell';
import WelcomeScreen from './components/WelcomeScreen';
import OnboardingScreen from './components/OnboardingScreen';
import HomeScreen from './components/HomeScreen';
import NotFound from './components/NotFound';
import { isStagingBuild } from './firebase';

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
const OnePhoneWheel = lazy(() => import('./onephone/modes/OnePhoneWheel'));

function App() {
  return (
    <ErrorBoundary>
      {isStagingBuild && (
        <div className="fixed bottom-2 left-2 z-[200] px-2 py-1 rounded bg-amber-500 text-black text-[10px] font-bold uppercase tracking-wider pointer-events-none">
          Staging
        </div>
      )}
      <ToastProvider>
        <AuthProvider>
          <Router>
            <Suspense fallback={<GameLoading label="Loading..." />}>
              <Routes>
                <Route path="/onboarding" element={<OnboardingScreen />} />
                <Route path="/" element={<WelcomeScreen />} />
                <Route path="/join/:code" element={<JoinByCode />} />
                <Route path="/one-phone" element={<OnePhoneHome />} />
                <Route path="/one-phone/games" element={<OnePhoneGames />} />
                <Route path="/one-phone/mafia" element={<OnePhoneMafiaRoute />} />
                <Route path="/one-phone/word-imposter" element={<OnePhoneWordImposter />} />
                <Route path="/one-phone/spyfall" element={<OnePhoneSpyfall />} />
                <Route path="/one-phone/wheel" element={<OnePhoneWheel />} />
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
