import React, { useMemo, useState } from 'react';
import { getAvatarColor, getInitials } from '../utils/avatar';
import { getLobbyParticipantIds } from '../hooks/useRoom';
import { saveLobbyRules, setSpectating, startFromLobby } from '../lib/lobby';
import { endActivity } from '../hooks/useRoom';
import { useToast } from './Toast';
import ConfirmDialog from './ConfirmDialog';

const dossierCardClass = 'relative overflow-hidden bg-[#d4b483] border border-[#8b6b3f] rounded-2xl p-5 text-left shadow-xl';
const stampButtonClass = 'w-full bg-[#efe4cc]/90 hover:bg-[#f5ecd9] text-[#3a2a1a] border-2 border-dashed border-[#4a3622] font-mono uppercase tracking-widest font-semibold py-2.5 rounded-md transition-colors text-xs disabled:opacity-60';
const startEnabledClass = 'w-full bg-[#f7ecd8] hover:bg-[#fbf3e4] text-red-700 border-2 border-red-700 font-mono uppercase tracking-widest font-black py-3 rounded-md transition-colors text-xs';
const startDisabledClass = 'w-full bg-[#d8cbb2] text-[#8f8676] border-2 border-[#a79a85] font-mono uppercase tracking-widest font-bold py-3 rounded-md cursor-not-allowed text-xs';

/**
 * Shared lobby "case file" used by every social deduction game.
 * Everyone in the room is in the game by default; players can choose to spectate.
 */
export default function LobbyCard({
  caseName,
  type,
  room,
  lobbyState,
  userId,
  roomId,
  navigate,
  isHost,
  minPlayers,
  route,
  deal,
  renderRulesEditor,
  validateRules,
  summarizeRules,
  accent = 'bg-violet-600 hover:bg-violet-500'
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [editRules, setEditRules] = useState(null);
  const [rulesError, setRulesError] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);

  const participantIds = useMemo(() => getLobbyParticipantIds(room), [room]);
  const spectators = lobbyState?.spectators || [];
  const isSpectating = spectators.includes(userId);
  const joinedPlayers = (room.players || []).filter((p) => participantIds.includes(p.id));
  const spectatingPlayers = (room.players || []).filter((p) => spectators.includes(p.id));
  const canStart = participantIds.length >= minPlayers;
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
    const started = await startFromLobby(roomId, type, deal);
    if (started) navigate(`/room/${roomId}/games/${route}`);
  });

  const handleSaveRules = () => guarded(async () => {
    const error = validateRules?.(editRules, participantIds.length);
    if (error) {
      setRulesError(error);
      return;
    }
    await saveLobbyRules(roomId, type, editRules);
    setEditRules(null);
  });

  const handleToggleSpectate = () => guarded(() => setSpectating(roomId, userId, !isSpectating));

  return (
    <div className={dossierCardClass}>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
        <span className="-rotate-[20deg] text-[#3a2a1a]/10 text-5xl font-black uppercase tracking-[0.28em] whitespace-nowrap select-none">
          Confidential
        </span>
      </div>

      <div className="relative z-10 mb-4">
        <div className="inline-block -rotate-3 border-2 border-red-700 text-red-700 font-serif font-black uppercase tracking-[0.22em] text-[11px] px-3 py-1 mb-3">
          Case File
        </div>
        <p className="text-[#2f2418] font-mono font-bold uppercase tracking-widest text-sm">CASE: {caseName}</p>
        {summarizeRules && (
          <p className="text-[#4a3622] font-mono text-[11px] uppercase tracking-wide mt-1">{summarizeRules(rules)}</p>
        )}
        <div className="mt-3 h-px bg-[#4a3622]/45" />
      </div>

      <div className="relative z-10 bg-[#eadfca]/85 border border-[#8b6b3f]/45 rounded-xl p-4 mb-4">
        <p className="text-[#3a2a1a] text-[11px] font-mono uppercase tracking-widest mb-3">
          AGENTS ASSIGNED: {joinedPlayers.length}
        </p>
        <div className="space-y-2">
          {joinedPlayers.map((player) => (
            <div key={player.id} className="flex items-center gap-3 border border-[#8b6b3f]/35 bg-[#f3ead8]/80 rounded-md px-3 py-2">
              {player.photo ? (
                <img src={player.photo} alt="" className="w-8 h-8 rounded-full object-cover border border-[#4a3622]" />
              ) : (
                <div className={`w-8 h-8 ${getAvatarColor(player)} rounded-full border border-[#4a3622] flex items-center justify-center text-white text-xs font-bold`}>
                  {getInitials(player.displayNameForGame || player.displayName)}
                </div>
              )}
              <span className="text-[#2f2418] text-sm font-mono uppercase tracking-wide font-bold truncate">
                {player.displayNameForGame || player.displayName}{player.id === userId ? ' (you)' : ''}
              </span>
            </div>
          ))}
        </div>
        {spectatingPlayers.length > 0 && (
          <p className="text-[#5a4632] text-[11px] font-mono uppercase tracking-wide mt-3">
            Spectating: {spectatingPlayers.map((p) => p.displayNameForGame || p.displayName).join(', ')}
          </p>
        )}
      </div>

      <div className="relative z-10 space-y-3">
        <button onClick={handleToggleSpectate} disabled={busy} className={stampButtonClass}>
          {isSpectating ? 'Join Game' : 'Spectate Instead'}
        </button>

        {isHost && (
          <>
            <button
              onClick={() => {
                setRulesError('');
                setEditRules({ ...rules });
              }}
              disabled={busy}
              className={stampButtonClass}
            >
              Edit Rules
            </button>
            <button
              onClick={handleStartGame}
              disabled={!canStart || busy}
              className={canStart ? startEnabledClass : startDisabledClass}
            >
              {busy ? 'Starting...' : canStart ? `Start Game (${joinedPlayers.length})` : `Need ${minPlayers}+ players (${joinedPlayers.length})`}
            </button>
            <button
              onClick={() => setConfirmCancel(true)}
              disabled={busy}
              className="w-full text-[#5a4632] hover:text-red-800 font-mono uppercase tracking-widest text-[11px] py-1"
            >
              Cancel lobby
            </button>
          </>
        )}
        {!isHost && (
          <p className="text-center text-[#4a3622] font-mono text-[11px] uppercase tracking-widest">
            Waiting for the host to start
          </p>
        )}
      </div>

      {editRules && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-sm w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-white text-lg font-bold mb-6">Game Rules</h3>
            <div className="space-y-4">
              {renderRulesEditor(editRules, (patch) => {
                setRulesError('');
                setEditRules((prev) => ({ ...prev, ...patch }));
              }, participantIds.length)}
              {rulesError && <p className="text-red-400 text-sm">{rulesError}</p>}
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditRules(null)}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRules}
                disabled={busy}
                className={`flex-1 px-4 py-2 text-white rounded-lg font-bold transition-colors ${accent}`}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel this lobby?"
        message="The room goes back to picking a game."
        confirmLabel="Cancel lobby"
        cancelLabel="Keep it"
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

export function Toggle({ label, description, checked, onChange, onClass = 'bg-violet-600' }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-white font-semibold text-sm">{label}</p>
        {description && <p className="text-slate-400 text-xs">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`shrink-0 w-12 h-7 rounded-full transition-colors ${checked ? onClass : 'bg-slate-600'}`}
      >
        <div className={`w-5 h-5 bg-white rounded-full transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  );
}
