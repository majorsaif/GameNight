import React, { useState } from 'react';
import { doc, updateDoc, serverTimestamp, arrayUnion, arrayRemove } from 'firebase/firestore';
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
  const [editRules, setEditRules] = useState(gameRules);

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
    if (lobbyPlayers.length < 4) {
      alert('Need at least 4 players to start');
      return;
    }

    const roomRef = doc(db, 'rooms', roomId);
    const playersToAssign = allPlayers.filter(p => lobbyPlayers.includes(p.uid));
    
    if (playersToAssign.length < 4) {
      alert('Need at least 4 players to start');
      return;
    }

    // Shuffle players
    const shuffled = [...playersToAssign].sort(() => Math.random() - 0.5);
    
    // Assign roles
    const withRoles = shuffled.map((player, index) => {
      let role = 'civilian';
      
      if (index < editRules.mafiaCount) {
        role = 'mafia';
      } else if (editRules.doctor && index === editRules.mafiaCount) {
        role = 'doctor';
      } else if (editRules.detective && index === editRules.mafiaCount + (editRules.doctor ? 1 : 0)) {
        role = 'detective';
      }
      
      return { ...player, role };
    });

    // Start game at roles phase
    await updateDoc(roomRef, {
      'activeActivity.phase': 'roles',
      'activeActivity.players': withRoles,
      'activeActivity.rules': editRules,
      'activeActivity.phaseStartedAt': serverTimestamp(),
      'activeActivity.phaseDurationMs': 30000,
      lastActivity: serverTimestamp()
    });

    navigate(`/room/${roomId}/games/mafia`);
  };

  const handleSaveRules = async () => {
    if (!isHost) return;
    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(roomRef, {
      'activeActivity.rules': editRules,
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

  const hasJoined = lobbyPlayers.includes(userId);
  const canStart = lobbyPlayers.length >= 4;

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
                    type="number"
                    min="1"
                    max="3"
                    value={editRules.mafiaCount}
                    onChange={(e) => setEditRules({ ...editRules, mafiaCount: parseInt(e.target.value) || 1 })}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white"
                  />
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

      {/* Join/Leave Button */}
      {!hasJoined ? (
        <button
          onClick={handleJoinLobby}
          className="w-full bg-white hover:bg-slate-100 text-red-700 font-bold py-2 rounded-lg transition-colors"
        >
          Join Lobby
        </button>
      ) : (
        <button
          onClick={handleLeaveLobby}
          className="w-full bg-red-800 hover:bg-red-900 text-white font-semibold py-2 rounded-lg transition-colors"
        >
          Leave Lobby
        </button>
      )}
    </div>
  );
}
