import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import OnboardingScreen from './components/OnboardingScreen';
import WelcomeScreen from './components/WelcomeScreen';
import HomeScreen from './components/HomeScreen';
import GamesScreen from './components/GamesScreen';
import WheelSpin from './components/ForfeitWheel';
import MafiaGame from './components/MafiaGame';
import WordImposterGame from './wordImposter/WordImposterGame';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/onboarding" element={<OnboardingScreen />} />
        <Route path="/" element={<WelcomeScreen />} />
        <Route path="/room/:roomId" element={<HomeScreen />} />
        <Route path="/room/:roomId/games" element={<GamesScreen />} />
        <Route path="/room/:roomId/games/mafia" element={<MafiaGame />} />
        <Route path="/room/:roomId/games/word-imposter" element={<WordImposterGame />} />
        <Route path="/wheel" element={<WheelSpin />} />
      </Routes>
    </Router>
  );
}

export default App;
