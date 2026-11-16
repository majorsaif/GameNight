import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, X } from 'lucide-react';
import { getAvatarColor } from '../utils/avatar';
import { MAX_NAME_LENGTH, sanitizeName } from '../lib/profiles';
import { loadPassPlayPlayers, PASS_PLAY_MAX_PLAYERS, savePassPlayPlayers } from './passPlay';
import { useToast } from '../components/Toast';
import { Avatar, Button, EmptyState, IconButton, Input, Screen, ScreenHeader, SectionHeading } from '../ui';

const MIN_PLAYERS = 3;

function createPlayerId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createPlayer(displayName) {
  const id = createPlayerId();

  return {
    id,
    displayName,
    avatarColor: getAvatarColor({ id })
  };
}

export default function OnePhoneHome() {
  const navigate = useNavigate();
  const toast = useToast();
  // Kept on this device so a refresh or going back doesn't lose the group
  const [players, setPlayers] = useState(() => loadPassPlayPlayers());
  const [playerName, setPlayerName] = useState('');

  useEffect(() => {
    savePassPlayPlayers(players);
  }, [players]);

  useEffect(() => {
    document.title = 'Pass & Play | Its Games Night';
  }, []);

  const handleAddPlayer = (event) => {
    event.preventDefault();

    const displayName = sanitizeName(playerName);
    if (!displayName) return;
    if (players.length >= PASS_PLAY_MAX_PLAYERS) {
      toast.error(`Pass & Play supports up to ${PASS_PLAY_MAX_PLAYERS} players.`);
      return;
    }
    if (players.some((p) => p.displayName.toLowerCase() === displayName.toLowerCase())) {
      toast.error(`${displayName} is already playing. Try adding an initial.`);
      return;
    }

    setPlayers((currentPlayers) => [...currentPlayers, createPlayer(displayName)]);
    setPlayerName('');
  };

  const handleRemovePlayer = (playerId) => {
    setPlayers((currentPlayers) => currentPlayers.filter((player) => player.id !== playerId));
  };

  const missing = Math.max(0, MIN_PLAYERS - players.length);

  return (
    <Screen
      header={<ScreenHeader title="Pass & Play" onBack={() => navigate('/')} backLabel="Back to home" />}
      footer={(
        <Button size="lg" block disabled={missing > 0} onClick={() => navigate('/one-phone/games')}>
          {missing > 0 ? `Add ${missing} more player${missing === 1 ? '' : 's'}` : 'Choose a game'}
        </Button>
      )}
    >
      <div className="flex animate-enter flex-col gap-section pt-2">
        <p className="text-base text-ink-muted">
          Add everyone who&apos;s playing. One phone gets passed around, so nobody needs to join anything.
        </p>

        <form onSubmit={handleAddPlayer} className="flex items-end gap-3">
          <Input
            label="Player name"
            value={playerName}
            onChange={(event) => setPlayerName(event.target.value)}
            placeholder="e.g. Sam"
            maxLength={MAX_NAME_LENGTH}
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="done"
          />
          <Button type="submit" variant="secondary" disabled={!sanitizeName(playerName)}>Add</Button>
        </form>

        <section>
          <SectionHeading count={players.length}>Players</SectionHeading>
          {players.length === 0 ? (
            <EmptyState icon={Users} title="No players yet" message="Games need at least 3 players." />
          ) : (
            <ul className="divide-y divide-line rounded-card border border-line bg-surface">
              {players.map((player) => (
                <li key={player.id} className="flex min-h-16 items-center gap-3 py-2 pl-4 pr-2">
                  <Avatar player={player} />
                  <span className="min-w-0 flex-1 truncate text-base font-medium text-ink">{player.displayName}</span>
                  <IconButton
                    icon={X}
                    tone="danger"
                    label={`Remove ${player.displayName}`}
                    className="border-transparent bg-transparent"
                    onClick={() => handleRemovePlayer(player.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Screen>
  );
}
