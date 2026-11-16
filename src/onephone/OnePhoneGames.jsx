import React, { useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { GAMES } from '../games/catalog';
import GameCard from '../components/GameCard';
import { Screen, ScreenHeader } from '../ui';
import { loadPassPlayPlayers } from './passPlay';

// Pass & Play Mafia needs a narrator on top of the usual four players
const PASS_PLAY_GAMES = [
  { ...GAMES.mafia, minPlayers: GAMES.mafia.minPlayers + 1, tagline: 'One of you narrates. Everyone else gets a secret role.' },
  GAMES.wordImposter,
  GAMES.spyfall
];

export default function OnePhoneGames() {
  const navigate = useNavigate();
  const players = loadPassPlayPlayers();

  useEffect(() => {
    document.title = 'Choose a game | Pass & Play';
  }, []);

  if (players.length === 0) return <Navigate to="/one-phone" replace />;

  const open = (game) => {
    if (game.type === 'mafia') navigate('/one-phone/mafia', { state: { players } });
    else navigate(`/one-phone/${game.route}`);
  };

  return (
    <Screen
      width="wide"
      header={<ScreenHeader width="wide" title="Choose a game" onBack={() => navigate('/one-phone')} backLabel="Back to players" />}
    >
      <ul className="grid animate-enter gap-4 pt-2 md:grid-cols-3">
        {PASS_PLAY_GAMES.map((game) => (
          <li key={game.type} className="flex">
            <GameCard game={game} playerCount={players.length} onSelect={() => open(game)} />
          </li>
        ))}
      </ul>
    </Screen>
  );
}
