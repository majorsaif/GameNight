import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConfirmDialog from './ConfirmDialog';

export function GameLoading({ label = 'Loading game...' }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-14 w-14 border-t-2 border-b-2 border-violet-500 mx-auto mb-4" />
        <p className="text-slate-400">{label}</p>
      </div>
    </div>
  );
}

/**
 * Wraps a game screen with a small menu so players can always get back to the
 * room, and the host can end a game that's gone wrong.
 */
export default function GameShell({ roomId, isHost, gameName, onEndGame, children }) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);

  return (
    <div className="relative">
      {children}

      <div className="fixed top-3 right-3 z-40">
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label="Game menu"
          aria-expanded={menuOpen}
          className="w-10 h-10 rounded-full bg-black/40 border border-white/15 text-white/80 hover:text-white hover:bg-black/60 backdrop-blur flex items-center justify-center"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
          </svg>
        </button>
        {menuOpen && (
          <div className="absolute right-0 mt-2 w-56 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => navigate(`/room/${roomId}`)}
              className="w-full text-left px-4 py-3 text-sm text-slate-200 hover:bg-slate-800"
            >
              Back to room
            </button>
            {isHost && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmEnd(true);
                }}
                className="w-full text-left px-4 py-3 text-sm text-red-300 hover:bg-slate-800 border-t border-slate-800"
              >
                End {gameName} for everyone
              </button>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmEnd}
        title={`End ${gameName}?`}
        message="This ends the game for everyone and returns the room to the lobby."
        confirmLabel="End game"
        tone="danger"
        onCancel={() => setConfirmEnd(false)}
        onConfirm={async () => {
          setConfirmEnd(false);
          await onEndGame?.();
          navigate(`/room/${roomId}`);
        }}
      />
    </div>
  );
}
