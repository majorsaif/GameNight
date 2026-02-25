import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import WelcomeScreen from './components/WelcomeScreen';
import HomeScreen from './components/HomeScreen';
import GamesScreen from './components/GamesScreen';
import WheelSpin from './components/ForfeitWheel';
import ProfileScreen from './components/ProfileScreen';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<WelcomeScreen />} />
        <Route path="/room/:roomId" element={<HomeScreen />} />
        <Route path="/room/:roomId/games" element={<GamesScreen />} />
        <Route path="/wheel" element={<WheelSpin />} />
        <Route path="/profile" element={<ProfileScreen />} />
      </Routes>
    </Router>
  );
}

export default App;
