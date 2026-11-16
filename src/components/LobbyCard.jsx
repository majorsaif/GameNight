import React, { useMemo, useState } from 'react';
import { BookOpen, Eye, Play, Settings2, UserPlus } from 'lucide-react';
import { endActivity, getLobbyParticipantIds } from '../hooks/useRoom';
import { saveLobbyRules, setSpectating, startFromLobby } from '../lib/lobby';
import { useToast } from './Toast';
import GameSettings, { summarizeRules, validateRules } from './GameSettings';
import RulesSheet from './RulesSheet';
import { AgentList, CaseFile, PaperButton, Stamp } from './props';
import { Button, ConfirmDialog, ScreenFooter, Sheet, playerName } from '../ui';

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
    <div className="animate-enter">
      <CaseFile
        name={game.name}
        meta={summarizeRules(game.type, rules).join(' · ')}
        action={<PaperButton icon={BookOpen} onClick={() => setShowRules(true)} className="px-3">Rules</PaperButton>}
      >
        <AgentList
          players={joinedPlayers}
          youId={userId}
          renderStamp={(player) => (player.id === room.hostId ? <Stamp tone="brown" tilt="right">Host</Stamp> : null)}
        />
        <p className="font-mono text-sm">
          {canStart
            ? `Ready to open the case with ${joinedPlayers.length} agents.`
            : `Need ${missing} more agent${missing === 1 ? '' : 's'} (${game.minPlayers} minimum).`}
        </p>
        {spectatingPlayers.length > 0 && (
          <p className="font-mono text-sm text-manila-ink/80">
            Watching: {spectatingPlayers.map((p) => playerName(p)).join(', ')}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <PaperButton icon={isSpectating ? UserPlus : Eye} onClick={handleToggleSpectate} disabled={busy}>
            {isSpectating ? 'Join the game' : 'Watch instead'}
          </PaperButton>
          {isHost && (
            <PaperButton
              icon={Settings2}
              disabled={busy}
              onClick={() => {
                setRulesError('');
                setEditRules({ ...rules });
              }}
            >
              Edit settings
            </PaperButton>
          )}
        </div>
        {!isHost && (
          <p className="text-center font-mono text-sm font-bold uppercase tracking-[0.12em] text-manila-ink/80">Waiting for the host to start</p>
        )}
      </CaseFile>

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
    </div>
  );
}
