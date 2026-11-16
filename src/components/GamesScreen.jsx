import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Lock, Users } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useRoom } from '../hooks/useRoom';
import { openLobby } from '../lib/lobby';
import { GAMES, GAME_LIST } from '../games/catalog';
import { useToast } from './Toast';
import GameSettings, { DEFAULT_RULES, validateRules } from './GameSettings';
import { Badge, Button, Card, ConfirmDialog, LoadingScreen, Notice, Screen, ScreenHeader, Sheet } from '../ui';

/** One game in a list: artwork, name, one-line pitch and player count. */
export function GameCard({ game, playerCount = null, disabled = false, onSelect }) {
  const short = playerCount != null && playerCount < game.minPlayers;
  return (
    <Card
      as="button"
      type="button"
      padding="none"
      disabled={disabled}
      onClick={onSelect}
      className="group flex w-full flex-col overflow-hidden text-left transition-colors duration-150 hover:border-line-strong disabled:cursor-not-allowed"
    >
      <span className="block w-full overflow-hidden border-b border-line">
        <img src={game.art} alt="" className="aspect-[16/8] w-full scale-110 object-cover" />
      </span>
      <span className="flex w-full flex-1 flex-col gap-2 p-4">
        <span className="flex items-center justify-between gap-3">
          <span className="text-xl font-semibold text-ink">{game.name}</span>
          <Badge tone={short ? 'warning' : 'neutral'} icon={Users}>{game.minPlayers}+ players</Badge>
        </span>
        <span className="text-sm text-ink-muted">{game.tagline}</span>
      </span>
    </Card>
  );
}

export default function GamesScreen() {
  const navigate = useNavigate();
  const toast = useToast();
  const { roomId } = useParams();
  const { user, loading: authLoading } = useAuth();
  const { isHost, room, loading } = useRoom(roomId, user);
  const [busy, setBusy] = useState(false);
  const [setupType, setSetupType] = useState(null);
  const [rules, setRules] = useState(DEFAULT_RULES);
  const [rulesError, setRulesError] = useState('');
  const [confirmReplace, setConfirmReplace] = useState(false);

  useEffect(() => {
    document.title = 'Choose a game | Its Games Night';
  }, []);

  const playerCount = room?.players?.length || 0;
  const setupGame = setupType ? GAMES[setupType] : null;
  const hasRunningActivity = Boolean(room?.activeActivity && GAMES[room.activeActivity.type]);

  const handleSelect = (type) => {
    if (!isHost) {
      toast.info('Only the host can choose a game.');
      return;
    }
    setRulesError('');
    setSetupType(type);
  };

  const launch = async () => {
    if (!isHost || !roomId || busy || !setupType) return;
    setBusy(true);
    try {
      await openLobby(roomId, setupType, rules[setupType]);
      setSetupType(null);
      navigate(`/room/${roomId}`);
    } catch (error) {
      console.error('Could not open lobby:', error);
      toast.error("Couldn't open the lobby. Try again.");
    } finally {
      setBusy(false);
      setConfirmReplace(false);
    }
  };

  const handleOpenLobby = () => {
    // Only block settings that can never work; more players can still join the lobby
    const error = playerCount >= setupGame.minPlayers ? validateRules(setupType, rules[setupType], playerCount) : null;
    if (error) {
      setRulesError(error);
      return;
    }
    // Opening a new lobby replaces whatever is running
    if (hasRunningActivity) {
      setConfirmReplace(true);
      return;
    }
    launch();
  };

  if (!authLoading && !user) return <Navigate to="/onboarding" replace state={{ redirectTo: `/room/${roomId}` }} />;
  if (authLoading || loading) return <LoadingScreen label="Loading games" />;
  if (!room) return <Navigate to={`/room/${roomId}`} replace />;

  return (
    <Screen
      width="wide"
      header={<ScreenHeader width="wide" title="Choose a game" onBack={() => navigate(`/room/${roomId}`)} backLabel="Back to room" />}
    >
      {!isHost && (
        <Notice icon={Lock} className="mt-2">Only the host can choose a game. Have a look at what&apos;s on offer.</Notice>
      )}
      <ul className="grid animate-enter gap-4 pt-2 md:grid-cols-3">
        {GAME_LIST.map((game) => (
          <li key={game.type} className="flex">
            <GameCard game={game} playerCount={playerCount} onSelect={() => handleSelect(game.type)} />
          </li>
        ))}
      </ul>

      <Sheet
        open={Boolean(setupGame)}
        onClose={() => setSetupType(null)}
        title={setupGame ? `${setupGame.name} settings` : ''}
        description="You can change these again in the lobby."
        footer={<Button size="lg" block onClick={handleOpenLobby} loading={busy}>Open lobby</Button>}
      >
        {setupGame && (
          <>
            <GameSettings
              type={setupType}
              rules={rules[setupType]}
              playerCount={playerCount}
              onChange={(patch) => {
                setRulesError('');
                setRules((prev) => ({ ...prev, [setupType]: { ...prev[setupType], ...patch } }));
              }}
            />
            {rulesError && <p role="alert" className="mt-3 text-sm text-danger">{rulesError}</p>}
          </>
        )}
      </Sheet>

      <ConfirmDialog
        open={confirmReplace}
        title="Replace the current game?"
        message="A game is already open in this room. Opening a new lobby ends it for everyone."
        confirmLabel="Open new lobby"
        cancelLabel="Keep current game"
        tone="danger"
        onCancel={() => setConfirmReplace(false)}
        onConfirm={launch}
      />
    </Screen>
  );
}
