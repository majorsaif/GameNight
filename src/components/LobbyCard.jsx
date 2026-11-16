import React, { useMemo, useState } from 'react';
import { BookOpen, Eye, Play, Settings2, UserPlus } from 'lucide-react';
import { endActivity, getLobbyParticipantIds } from '../hooks/useRoom';
import { saveLobbyRules, setSpectating, startFromLobby } from '../lib/lobby';
import { ACCENT_TINT } from '../games/catalog';
import { useToast } from './Toast';
import GameSettings, { summarizeRules, validateRules } from './GameSettings';
import RulesSheet from './RulesSheet';

// Temporary re-export while Pass & Play is rebuilt on the design system.
export { Toggle } from '../ui';
import { Avatar, Badge, Button, Card, ConfirmDialog, Notice, ScreenFooter, Sheet, cn, playerName } from '../ui';

/**
 * Lobby for any game. Everyone in the room is in the game by default; players
 * can choose to watch instead. The host starts from the pinned action bar.
 */
export default function LobbyCard({ game, deal, room, lobbyState, userId, roomId, navigate, isHost }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [editRules, setEditRules] = useState(null);
  const [rulesError, setRulesError] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [showRules, setShowRules] = useState(false);

  const participantIds = useMemo(() => getLobbyParticipantIds(room), [room]);
  const spectators = lobbyState?.spectators || [];
  const isSpectating = spectators.includes(userId);
  const joinedPlayers = (room.players || []).filter((p) => participantIds.includes(p.id));
  const spectatingPlayers = (room.players || []).filter((p) => spectators.includes(p.id));
  const missing = Math.max(0, game.minPlayers - participantIds.length);
  const canStart = missing === 0;
  const rules = lobbyState?.rules || {};
  const Icon = game.icon;

  const guarded = async (fn) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (error) {
      console.error(error);
      toast.error(error?.message && !error.code ? error.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleStartGame = () => guarded(async () => {
    const started = await startFromLobby(roomId, game.type, deal);
    if (started) navigate(`/room/${roomId}/games/${game.route}`);
  });

  const handleSaveRules = () => guarded(async () => {
    const error = validateRules(game.type, editRules, participantIds.length);
    if (error) {
      setRulesError(error);
      return;
    }
    await saveLobbyRules(roomId, game.type, editRules);
    setEditRules(null);
  });

  const handleToggleSpectate = () => guarded(() => setSpectating(roomId, userId, !isSpectating));

  return (
    <Card padding="none" className="animate-enter overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        <span className={cn('inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full', ACCENT_TINT[game.accent])}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-semibold text-ink">{game.name}</h2>
          <p className="text-sm text-ink-muted">Lobby open</p>
        </div>
        <Button variant="ghost" size="sm" icon={BookOpen} onClick={() => setShowRules(true)}>Rules</Button>
      </div>

      <ul className="flex flex-wrap gap-2 border-t border-line px-4 py-3" aria-label="Game settings">
        {summarizeRules(game.type, rules).map((item) => (
          <li key={item}><Badge>{item}</Badge></li>
        ))}
      </ul>

      <div className="border-t border-line p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-ink">Playing</h3>
          <Badge tone={canStart ? 'success' : 'warning'}>
            {canStart ? `${joinedPlayers.length} ready` : `${joinedPlayers.length} of ${game.minPlayers} needed`}
          </Badge>
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-2">
          {joinedPlayers.map((player) => (
            <li key={player.id} className="flex min-w-0 items-center gap-2 rounded-control bg-surface-raised p-2">
              <Avatar player={player} size="sm" />
              <span className="min-w-0 truncate text-sm font-medium text-ink">
                {playerName(player)}{player.id === userId ? ' (you)' : ''}
              </span>
            </li>
          ))}
        </ul>
        {spectatingPlayers.length > 0 && (
          <p className="mt-3 text-sm text-ink-faint">
            Watching: {spectatingPlayers.map((p) => playerName(p)).join(', ')}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" icon={isSpectating ? UserPlus : Eye} onClick={handleToggleSpectate} disabled={busy}>
            {isSpectating ? 'Join the game' : 'Watch instead'}
          </Button>
          {isHost && (
            <Button
              variant="secondary"
              size="sm"
              icon={Settings2}
              disabled={busy}
              onClick={() => {
                setRulesError('');
                setEditRules({ ...rules });
              }}
            >
              Edit settings
            </Button>
          )}
        </div>
      </div>

      {!isHost && (
        <div className="border-t border-line p-4">
          <Notice>Waiting for the host to start the game.</Notice>
        </div>
      )}

      {isHost && (
        <ScreenFooter>
          <Button size="lg" block icon={Play} onClick={handleStartGame} disabled={!canStart} loading={busy && canStart}>
            {canStart ? `Start ${game.name}` : `Need ${missing} more player${missing === 1 ? '' : 's'}`}
          </Button>
          <Button variant="ghost" block onClick={() => setConfirmCancel(true)} disabled={busy}>Cancel lobby</Button>
        </ScreenFooter>
      )}

      <RulesSheet open={showRules} onClose={() => setShowRules(false)} rules={game.rules} />

      <Sheet
        open={Boolean(editRules)}
        onClose={() => setEditRules(null)}
        title={`${game.name} settings`}
        footer={(
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setEditRules(null)}>Cancel</Button>
            <Button className="flex-1" onClick={handleSaveRules} loading={busy}>Save</Button>
          </div>
        )}
      >
        {editRules && (
          <>
            <GameSettings
              type={game.type}
              rules={editRules}
              playerCount={participantIds.length}
              onChange={(patch) => {
                setRulesError('');
                setEditRules((prev) => ({ ...prev, ...patch }));
              }}
            />
            {rulesError && <p role="alert" className="mt-3 text-sm text-danger">{rulesError}</p>}
          </>
        )}
      </Sheet>

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel this lobby?"
        message="The room goes back to choosing a game. Nobody leaves the room."
        confirmLabel="Cancel lobby"
        cancelLabel="Keep lobby"
        tone="danger"
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => {
          setConfirmCancel(false);
          guarded(() => endActivity(roomId));
        }}
      />
    </Card>
  );
}
