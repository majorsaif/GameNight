import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../firebase';
import { getInitials, getAvatarColor } from '../utils/avatar';
import { getRandomWord } from '../wordImposter/words';

export default function WordImposterLobbyCard({
  lobbyState,
  roomPlayers,
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
  const roomPlayersByUid = new Map((roomPlayers || []).map((player) => [player.id, player]));
  const getLobbyPlayerPhoto = (uid) => {
    const matchingRoomPlayer = roomPlayersByUid.get(uid);
    return matchingRoomPlayer?.photo || null;
  };
  const gameRules = lobbyState?.rules || rules;
  const [showRulesEdit, setShowRulesEdit] = useState(showRulesModal);
  const [editRules, setEditRules] = useState({
    imposterCount: String(gameRules.imposterCount || '1'),
    showCategory: gameRules.showCategory !== false
  });
  const [imposterCountError, setImposterCountError] = useState('');

  useEffect(() => {
    if (showRulesEdit) {
      setEditRules({
        imposterCount: String(gameRules.imposterCount || '1'),
        showCategory: gameRules.showCategory !== false
      });
      setImposterCountError('');
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

    if (latestLobbyPlayers.length < 3) {
      alert(`Need at least 3 players to start (${latestLobbyPlayers.length})`);
      return;
    }

    const roomPlayers = Array.isArray(currentRoom.players) ? currentRoom.players : [];
    const roomPlayersById = new Map(roomPlayers.map((player) => [player.id, player]));
    const latestGamePlayersById = new Map(latestGamePlayers.map((player) => [player.uid, player]));
    const playersToAssign = latestLobbyPlayers
      .map((playerId) => {
        const existingActivityPlayer = latestGamePlayersById.get(playerId);
        if (existingActivityPlayer) {
          return {
            uid: existingActivityPlayer.uid,
            displayName: existingActivityPlayer.displayName,
            avatarColor: existingActivityPlayer.avatarColor || getAvatarColor({ id: existingActivityPlayer.uid, displayName: existingActivityPlayer.displayName }, roomId)
          };
        }

        const roomPlayer = roomPlayersById.get(playerId);
        if (!roomPlayer) return null;

        return {
          uid: roomPlayer.id,
          displayName: roomPlayer.displayNameForGame || roomPlayer.displayName,
          avatarColor: roomPlayer.avatarColor || getAvatarColor(roomPlayer, roomId)
        };
      })
      .filter(Boolean);

    if (playersToAssign.length < 3) {
      alert('Need at least 3 players to start');
      return;
    }

    // Parse imposter count
    const imposterCount = typeof editRules.imposterCount === 'string'
      ? parseInt(editRules.imposterCount, 10)
      : editRules.imposterCount;

    if (isNaN(imposterCount) || imposterCount < 1) {
      alert('Invalid number of imposters');
      return;
    }

    // Validate 1/3 limit
    const maxAllowed = Math.max(1, Math.floor(latestLobbyPlayers.length / 3));
    if (imposterCount > maxAllowed) {
      alert(`Too many imposters! With ${latestLobbyPlayers.length} players you can have a maximum of ${maxAllowed} imposter(s)`);
      return;
    }

    // Shuffle and assign imposters
    const shuffled = [...playersToAssign].sort(() => Math.random() - 0.5);
    const imposterIds = shuffled.slice(0, imposterCount).map(p => p.uid);

    // Pick random word
    const { word, category } = getRandomWord();

    // Random starting player and direction
    const startingPlayer = playersToAssign[Math.floor(Math.random() * playersToAssign.length)];
    const direction = Math.random() < 0.5 ? 'clockwise' : 'anticlockwise';

    const finalRules = {
      imposterCount: imposterCount,
      showCategory: editRules.showCategory
    };

    await updateDoc(roomRef, {
      'activeActivity.phase': 'word-reveal',
      'activeActivity.word': word,
      'activeActivity.category': category,
      'activeActivity.rules': finalRules,
      'activeActivity.imposterIds': imposterIds,
      'activeActivity.players': playersToAssign,
      'activeActivity.startingPlayerId': startingPlayer.uid,
      'activeActivity.direction': direction,
      'activeActivity.readyVotes': [],
      'activeActivity.votes': {},
      'activeActivity.eliminatedUid': null,
      'activeActivity.winner': null,
      'activeActivity.wordRevealed': null,
      'activeActivity.roundNumber': 1,
      lastActivity: serverTimestamp()
    });

    navigate(`/room/${roomId}/games/word-imposter`);
  };

  const handleSaveRules = async () => {
    if (!isHost) return;

    setImposterCountError('');

    const imposterCountValue = editRules.imposterCount.toString().trim();
    if (!imposterCountValue) {
      setImposterCountError('Number of imposters is required');
      return;
    }

    const imposterCount = parseInt(imposterCountValue, 10);
    if (isNaN(imposterCount) || imposterCount < 1) {
      setImposterCountError('Number of imposters must be at least 1');
      return;
    }

    const totalPlayers = lobbyPlayers.length;
    const maxAllowed = Math.max(1, Math.floor(totalPlayers / 3));
    if (imposterCount > maxAllowed) {
      setImposterCountError(`Too many imposters! With ${totalPlayers} players you can have a maximum of ${maxAllowed} imposter(s)`);
      return;
    }

    const roomRef = doc(db, 'rooms', roomId);
    const finalRules = {
      imposterCount: imposterCount,
      showCategory: editRules.showCategory
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
  const canStart = lobbyPlayers.length >= 3;

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

  const joinedPlayers = allPlayers.filter((player) => lobbyPlayers.includes(player.uid));
  const dossierCardClass = 'relative overflow-hidden bg-[#d4b483] border border-[#8b6b3f] rounded-2xl p-5 text-left shadow-xl';
  const stampButtonClass = 'w-full bg-[#efe4cc]/90 hover:bg-[#f5ecd9] text-[#3a2a1a] border-2 border-dashed border-[#4a3622] font-mono uppercase tracking-widest font-semibold py-2.5 rounded-md transition-colors text-xs';
  const startEnabledClass = 'w-full bg-[#f7ecd8] hover:bg-[#fbf3e4] text-red-700 border-2 border-red-700 font-mono uppercase tracking-widest font-black py-3 rounded-md transition-colors text-xs';
  const startDisabledClass = 'w-full bg-[#d8cbb2] text-[#8f8676] border-2 border-[#a79a85] font-mono uppercase tracking-widest font-bold py-3 rounded-md cursor-not-allowed text-xs';

  const renderDossierHeader = () => (
    <div className="relative z-10 mb-4">
      <div className="inline-block -rotate-3 border-2 border-red-700 text-red-700 font-serif font-black uppercase tracking-[0.22em] text-[11px] px-3 py-1 mb-3">
        Case File
      </div>
      <p className="text-[#2f2418] font-mono font-bold uppercase tracking-widest text-sm">CASE: WORD IMPOSTER</p>
      <div className="mt-3 h-px bg-[#4a3622]/45" />
    </div>
  );

  const renderPlayerList = () => (
    <div className="relative z-10 bg-[#eadfca]/85 border border-[#8b6b3f]/45 rounded-xl p-4 mb-4">
      <p className="text-[#3a2a1a] text-[11px] font-mono uppercase tracking-widest mb-3">
        Agents Assigned: ({lobbyPlayers.length})
      </p>
      <div className="space-y-2">
        {joinedPlayers.map((player) => {
          const playerPhoto = getLobbyPlayerPhoto(player.uid) || player.photo || player.photoURL || null;
          return (
            <div
              key={player.uid}
              className="flex items-center gap-3 border border-[#8b6b3f]/35 bg-[#f3ead8]/80 rounded-md px-3 py-2"
            >
              {playerPhoto ? (
                <img src={playerPhoto} alt={player.displayName} className="w-8 h-8 rounded-full object-cover border border-[#4a3622]" />
              ) : (
                <div className={`w-8 h-8 ${player.avatarColor} rounded-full border border-[#4a3622] flex items-center justify-center text-white text-xs font-bold`}>
                  {getInitials(player.displayName)}
                </div>
              )}
              <span className="text-[#2f2418] text-sm font-mono uppercase tracking-wide font-bold">{player.displayName}</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  if (isHost) {
    return (
      <div className={dossierCardClass}>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="-rotate-[20deg] text-[#3a2a1a]/10 text-5xl font-black uppercase tracking-[0.28em] whitespace-nowrap select-none">
            Classified
          </span>
        </div>

        {renderDossierHeader()}
        {renderPlayerList()}

        <div className="relative z-10 space-y-3">
          <button
            onClick={() => setShowRulesEdit(true)}
            className={stampButtonClass}
          >
            Edit Rules
          </button>
          <button
            onClick={handleStartGame}
            disabled={!canStart}
            className={canStart ? startEnabledClass : startDisabledClass}
          >
            {canStart ? `Start Game (${lobbyPlayers.length})` : `Need 3+ (${lobbyPlayers.length})`}
          </button>
        </div>

        {/* Rules Modal */}
        {showRulesEdit && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-sm w-full max-h-[90vh] overflow-y-auto">
              <h3 className="text-white text-lg font-bold mb-6">Game Rules</h3>

              <div className="space-y-4">
                <div>
                  <label className="text-white font-semibold block mb-2 text-sm">Number of Imposters</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={editRules.imposterCount}
                    onChange={(e) => {
                      setEditRules({ ...editRules, imposterCount: e.target.value });
                      setImposterCountError('');
                    }}
                    placeholder="Enter number"
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500"
                  />
                  {imposterCountError && (
                    <p className="text-red-400 text-sm mt-2">{imposterCountError}</p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-white font-semibold text-sm">Show Category to Imposter</label>
                      <p className="text-slate-400 text-xs">Imposters see the category but not the word</p>
                    </div>
                    <button
                      onClick={() => setEditRules({ ...editRules, showCategory: !editRules.showCategory })}
                      className={`w-12 h-7 rounded-full transition-colors ${
                        editRules.showCategory ? 'bg-teal-600' : 'bg-slate-600'
                      }`}
                    >
                      <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                        editRules.showCategory ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>
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
                  className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg font-bold transition-colors"
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
    <div className={dossierCardClass}>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="-rotate-[20deg] text-[#3a2a1a]/10 text-5xl font-black uppercase tracking-[0.28em] whitespace-nowrap select-none">
          Classified
        </span>
      </div>

      {renderDossierHeader()}
      {renderPlayerList()}

      {/* Spectate / Join Game toggle */}
      {hasJoined ? (
        <button
          onClick={handleSpectate}
          className={`relative z-10 ${stampButtonClass}`}
        >
          Spectate
        </button>
      ) : isSpectating ? (
        <button
          onClick={handleJoinFromSpectate}
          className={`relative z-10 ${stampButtonClass}`}
        >
          Join Game
        </button>
      ) : (
        <button
          onClick={handleJoinLobby}
          className={`relative z-10 ${stampButtonClass}`}
        >
          Join Lobby
        </button>
      )}
    </div>
  );
}
