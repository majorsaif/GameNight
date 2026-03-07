import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../firebase';
import { getInitials, getAvatarColor } from '../utils/avatar';

export default function MafiaLobbyCard({ 
  lobbyState, 
  userId, 
  roomId, 
  navigate, 
  isHost, 
  rules,
  setRules,
  showRulesModal,
  setShowRulesModal
}) {
  const lobbyPlayers = lobbyState?.lobbyPlayers || [];
  const allPlayers = lobbyState?.players || [];
  const gameRules = lobbyState?.rules || rules;
  const [showRulesEdit, setShowRulesEdit] = useState(showRulesModal);
  const [editRules, setEditRules] = useState({ ...gameRules, mafiaCount: String(gameRules.mafiaCount || '1') });
  const [mafiaCountError, setMafiaCountError] = useState('');

  // Re-initialize editRules when modal is opened or gameRules change
  useEffect(() => {
    if (showRulesEdit) {
      setEditRules({ ...gameRules, mafiaCount: String(gameRules.mafiaCount || '1') });
      setMafiaCountError('');
    }
  }, [showRulesEdit, gameRules]);

  const handleJoinLobby = async () => {
    const roomRef = doc(db, 'rooms', roomId);
    if (!lobbyPlayers.includes(userId)) {
      await updateDoc(roomRef, {
        'activeActivity.lobbyPlayers': arrayUnion(userId),
        lastActivity: serverTimestamp()
      });
    }
  };

  const handleLeaveLobby = async () => {
    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(roomRef, {
      'activeActivity.lobbyPlayers': arrayRemove(userId),
      lastActivity: serverTimestamp()
    });
  };

  const handleStartGame = async () => {
    const roomRef = doc(db, 'rooms', roomId);
    const roomDoc = await getDoc(roomRef);

    if (!roomDoc.exists()) {
      alert('Room not found');
      return;
    }

    const currentRoom = roomDoc.data();
    const currentActivity = currentRoom.activeActivity || {};
    const latestLobbyPlayers = Array.isArray(currentActivity.lobbyPlayers) ? currentActivity.lobbyPlayers : [];
    const latestGamePlayers = Array.isArray(currentActivity.players) ? currentActivity.players : allPlayers;

    if (latestLobbyPlayers.length < 4) {
      alert(`Need at least 4 players to start (${latestLobbyPlayers.length})`);
      return;
    }

    const roomPlayers = Array.isArray(currentRoom.players) ? currentRoom.players : [];
    const roomPlayersById = new Map(roomPlayers.map((player) => [player.id, player]));
    const latestGamePlayersById = new Map(latestGamePlayers.map((player) => [player.uid, player]));
    const playersToAssign = latestLobbyPlayers
      .map((playerId) => {
        const existingActivityPlayer = latestGamePlayersById.get(playerId);
        if (existingActivityPlayer) return existingActivityPlayer;

        const roomPlayer = roomPlayersById.get(playerId);
        if (!roomPlayer) return null;

        return {
          uid: roomPlayer.id,
          displayName: roomPlayer.displayNameForGame || roomPlayer.displayName,
          avatarColor: roomPlayer.avatarColor,
          isAlive: true,
          role: null
        };
      })
      .filter(Boolean);
    
    if (playersToAssign.length < 4) {
      alert('Need at least 4 players to start');
      return;
    }

    // Parse mafiaCount from editRules
    const mafiaCount = typeof editRules.mafiaCount === 'string' 
      ? parseInt(editRules.mafiaCount, 10) 
      : editRules.mafiaCount;

    if (isNaN(mafiaCount) || mafiaCount < 1) {
      alert('Invalid number of mafias');
      return;
    }

    // Check 25% limit based on lobby players
    const maxAllowed = Math.max(1, Math.floor(latestLobbyPlayers.length * 0.25));
    if (mafiaCount > maxAllowed) {
      alert(`Too many mafias! With ${latestLobbyPlayers.length} players, you can have a maximum of ${maxAllowed} mafia.`);
      return;
    }

    // Shuffle players
    const shuffled = [...playersToAssign].sort(() => Math.random() - 0.5);
    
    // Assign roles
    const withRoles = shuffled.map((player, index) => {
      let role = 'civilian';
      
      if (index < mafiaCount) {
        role = 'mafia';
      } else if (editRules.doctor && index === mafiaCount) {
        role = 'doctor';
      } else if (editRules.detective && index === mafiaCount + (editRules.doctor ? 1 : 0)) {
        role = 'detective';
      }
      
      return { ...player, role };
    });

    // Start game at roles phase
    const finalRules = {
      ...editRules,
      mafiaCount: mafiaCount
    };

    await updateDoc(roomRef, {
      'activeActivity.phase': 'roles',
      'activeActivity.players': withRoles,
      'activeActivity.rules': finalRules,
      'activeActivity.phaseStartedAt': serverTimestamp(),
      'activeActivity.phaseDurationMs': 30000,
      lastActivity: serverTimestamp()
    });

    navigate(`/room/${roomId}/games/mafia`);
  };

  const handleSaveRules = async () => {
    if (!isHost) return;

    setMafiaCountError('');

    // Validate mafia count
    const mafiaCountValue = editRules.mafiaCount.toString().trim();
    if (!mafiaCountValue) {
      setMafiaCountError('Number of mafias is required');
      return;
    }

    const mafiaCount = parseInt(mafiaCountValue, 10);
    if (isNaN(mafiaCount) || mafiaCount < 1) {
      setMafiaCountError('Number of mafias must be at least 1');
      return;
    }

    // Check 25% limit based on current lobby players
    const totalPlayers = lobbyPlayers.length;
    const maxAllowed = Math.max(1, Math.floor(totalPlayers * 0.25));
    if (mafiaCount > maxAllowed) {
      setMafiaCountError(`Too many mafias! With ${totalPlayers} players, you can have a maximum of ${maxAllowed} mafia.`);
      return;
    }

    const roomRef = doc(db, 'rooms', roomId);
    const finalRules = {
      ...editRules,
      mafiaCount: mafiaCount
    };
    
    await updateDoc(roomRef, {
      'activeActivity.rules': finalRules,
      lastActivity: serverTimestamp()
    });
    setShowRulesEdit(false);
  };

  const handleCancelGame = async () => {
    if (!isHost) return;
    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(roomRef, {
      activeActivity: null,
      lastActivity: serverTimestamp()
    });
  };

  const spectators = lobbyState?.spectators || [];
  const isSpectating = spectators.includes(userId);
  const hasJoined = lobbyPlayers.includes(userId);
  const canStart = lobbyPlayers.length >= 4;

  const handleSpectate = async () => {
    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(roomRef, {
      'activeActivity.lobbyPlayers': arrayRemove(userId),
      'activeActivity.spectators': arrayUnion(userId),
      lastActivity: serverTimestamp()
    });
  };

  const handleJoinFromSpectate = async () => {
    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(roomRef, {
      'activeActivity.spectators': arrayRemove(userId),
      'activeActivity.lobbyPlayers': arrayUnion(userId),
      lastActivity: serverTimestamp()
    });
  };

  if (isHost) {
    return (
      <div className="bg-gradient-to-br from-red-600 to-rose-700 rounded-2xl p-6 text-left shadow-xl">
        <div className="mb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="text-3xl">🔪</div>
            <div>
              <h3 className="text-white font-bold text-lg">Mafia Lobby</h3>
              <p className="text-red-100 text-sm">Configure & wait for players</p>
            </div>
          </div>
        </div>

        {/* Players Joined */}
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 mb-4">
          <h4 className="text-white font-semibold mb-3 text-sm">
            Players Joined ({lobbyPlayers.length})
          </h4>
          <div className="space-y-2">
            {allPlayers.filter(p => lobbyPlayers.includes(p.uid)).map(player => (
              <div
                key={player.uid}
                className="flex items-center gap-3 bg-red-800/50 rounded-lg px-3 py-2"
              >
                <div className={`w-8 h-8 ${player.avatarColor} rounded-full flex items-center justify-center text-white text-xs font-bold`}>
                  {getInitials(player.displayName)}
                </div>
                <span className="text-white text-sm font-medium">{player.displayName}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Rules and Buttons */}
        <div className="space-y-3">
          <button
            onClick={() => setShowRulesEdit(true)}
            className="w-full bg-red-700 hover:bg-red-600 text-white font-semibold py-2 rounded-lg transition-colors text-sm"
          >
            Edit Rules
          </button>
          <button
            onClick={handleStartGame}
            disabled={!canStart}
            className="w-full bg-gradient-to-r from-white to-slate-200 hover:from-slate-100 hover:to-slate-300 disabled:from-slate-600 disabled:to-slate-600 text-red-700 disabled:text-slate-400 font-bold py-2 rounded-lg transition-colors"
          >
            {canStart ? `Start Game (${lobbyPlayers.length})` : `Need 4+ (${lobbyPlayers.length})`}
          </button>
          <button
            onClick={handleCancelGame}
            className="w-full bg-red-800 hover:bg-red-900 text-white font-semibold py-2 rounded-lg transition-colors text-sm"
          >
            Cancel
          </button>
        </div>

        {/* Rules Modal */}
        {showRulesEdit && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-sm w-full max-h-[90vh] overflow-y-auto">
              <h3 className="text-white text-lg font-bold mb-6">Game Rules</h3>

              <div className="space-y-4">
                <div>
                  <label className="text-white font-semibold block mb-2 text-sm">Number of Mafias</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={editRules.mafiaCount}
                    onChange={(e) => {
                      setEditRules({ ...editRules, mafiaCount: e.target.value });
                      setMafiaCountError('');
                    }}
                    placeholder="Enter number"
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500"
                  />
                  {mafiaCountError && (
                    <p className="text-red-400 text-sm mt-2">{mafiaCountError}</p>
                  )}
                </div>

                <div>
                  <label className="text-white font-semibold flex items-center gap-3 mb-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editRules.doctor}
                      onChange={(e) => setEditRules({ ...editRules, doctor: e.target.checked })}
                      className="w-4 h-4"
                    />
                    Doctor ⚕️
                  </label>
                  <p className="text-slate-400 text-xs">Can save one player each night</p>
                </div>

                <div>
                  <label className="text-white font-semibold flex items-center gap-3 mb-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editRules.detective}
                      onChange={(e) => setEditRules({ ...editRules, detective: e.target.checked })}
                      className="w-4 h-4"
                    />
                    Detective 🔍
                  </label>
                  <p className="text-slate-400 text-xs">Can investigate one player each night</p>
                </div>

                <div>
                  <label className="text-white font-semibold block mb-2 text-sm">Discussion Time</label>
                  <select
                    value={editRules.discussionTime}
                    onChange={(e) => setEditRules({ ...editRules, discussionTime: parseInt(e.target.value) })}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white"
                  >
                    <option value={1}>1 minute</option>
                    <option value={2}>2 minutes</option>
                    <option value={3}>3 minutes</option>
                    <option value={5}>5 minutes</option>
                  </select>
                </div>

                <div>
                  <label className="text-white font-semibold block mb-2 text-sm">Voting Time</label>
                  <select
                    value={editRules.votingTime}
                    onChange={(e) => setEditRules({ ...editRules, votingTime: parseFloat(e.target.value) })}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white"
                  >
                    <option value={0.5}>30 seconds</option>
                    <option value={1}>1 minute</option>
                    <option value={2}>2 minutes</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowRulesEdit(false)}
                  className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveRules}
                  className="flex-1 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg font-bold transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Player view
  return (
    <div className="bg-gradient-to-br from-red-600 to-rose-700 rounded-2xl p-6 text-left shadow-xl">
      <div className="mb-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="text-3xl">🔪</div>
          <div>
            <h3 className="text-white font-bold text-lg">Mafia Lobby</h3>
            <p className="text-red-100 text-sm">{hasJoined ? 'You\'ve joined!' : 'Ready to join?'}</p>
          </div>
        </div>
      </div>

      {/* Players Joined */}
      <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 mb-4">
        <h4 className="text-white font-semibold mb-3 text-sm">
          Players Joined ({lobbyPlayers.length})
        </h4>
        <div className="space-y-2">
          {allPlayers.filter(p => lobbyPlayers.includes(p.uid)).map(player => (
            <div
              key={player.uid}
              className="flex items-center gap-3 bg-red-800/50 rounded-lg px-3 py-2"
            >
              <div className={`w-8 h-8 ${player.avatarColor} rounded-full flex items-center justify-center text-white text-xs font-bold`}>
                {getInitials(player.displayName)}
              </div>
              <span className="text-white text-sm font-medium">{player.displayName}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Spectate / Join Game toggle */}
      {hasJoined ? (
        <button
          onClick={handleSpectate}
          className="w-full bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
          Spectate
        </button>
      ) : isSpectating ? (
        <button
          onClick={handleJoinFromSpectate}
          className="w-full bg-white hover:bg-slate-100 text-red-700 font-bold py-2 rounded-lg transition-colors"
        >
          Join Game
        </button>
      ) : (
        <button
          onClick={handleJoinLobby}
          className="w-full bg-white hover:bg-slate-100 text-red-700 font-bold py-2 rounded-lg transition-colors"
        >
          Join Lobby
        </button>
      )}
    </div>
  );
}
