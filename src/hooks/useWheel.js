import { useState, useCallback } from 'react';

/**
 * Custom hook for managing forfeit wheel spinning logic
 */
export function useWheel(players) {
  const [isSpinning, setIsSpinning] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [rotation, setRotation] = useState(0);

  const spin = useCallback(() => {
    if (isSpinning || !players || players.length === 0) return;

    setIsSpinning(true);
    setSelectedPlayer(null);

    // Random number of full rotations (3-5) plus random position
    const minSpins = 3;
    const maxSpins = 5;
    const spins = Math.random() * (maxSpins - minSpins) + minSpins;
    
    // Pick a random winner
    const winnerIndex = Math.floor(Math.random() * players.length);
    const segmentAngle = 360 / players.length;
    const targetAngle = 360 * spins + (winnerIndex * segmentAngle);
    
    setRotation(targetAngle);

    // After animation completes, show the winner
    setTimeout(() => {
      setSelectedPlayer(players[winnerIndex]);
      setIsSpinning(false);
    }, 4000); // Match the animation duration
  }, [players, isSpinning]);

  const reset = useCallback(() => {
    setSelectedPlayer(null);
    setRotation(0);
  }, []);

  return {
    isSpinning,
    selectedPlayer,
    rotation,
    spin,
    reset
  };
}
