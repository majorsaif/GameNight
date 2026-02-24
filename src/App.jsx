import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import WelcomeScreen from './components/WelcomeScreen';
import HomeScreen from './components/HomeScreen';
import ForfeitWheel from './components/ForfeitWheel';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<WelcomeScreen />} />
        <Route path="/room/:roomId" element={<HomeScreen />} />
        <Route path="/wheel" element={<ForfeitWheel />} />
      </Routes>
    </Router>
  );
}

export default App;
