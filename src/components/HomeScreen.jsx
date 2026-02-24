import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRoom, updatePlayerNameForGame, leaveRoom } from '../hooks/useRoom';
import { useAuth } from '../hooks/useAuth';

const getInitials = (name) => {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const getAvatarColor = (name) => {
  if (!name) return 'bg-purple-600';
  const colors = [
    'bg-purple-600',
    'bg-blue-600',
    'bg-pink-600',
    'bg-indigo-600',
    'bg-violet-600',
    'bg-fuchsia-600',
    'bg-cyan-600',
  ];
  const index = name.charCodeAt(0) % colors.length;
  return colors[index];
};

export default function HomeScreen() {
  const { roomId } = useParams();
  const { user, loading: userLoading } = useAuth();
  const { room, loading: roomLoading, error, isHost } = useRoom(
    roomId, 
    user?.id, 
    user?.displayName,
    user?.avatar || null
  );
  const navigate = useNavigate();
  const [showSettings, setShowSettings] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [gameDisplayName, setGameDisplayName] = useState(room?.players.find(p => p.id === user?.id)?.displayNameForGame || user?.displayName || '');
  const settingsRef = useRef(null);

  // Close settings menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (settingsRef.current && !settingsRef.current.contains(event.target)) {
        setShowSettings(false);
      }
    }

    if (showSettings) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showSettings]);

  const handleLeaveRoom = () => {
    if (roomId && user?.id) {
      leaveRoom(roomId, user.id);
    }
    setShowSettings(false);
    navigate('/');
  };

  const handleSaveGameName = () => {
    if (gameDisplayName.trim()) {
      updatePlayerNameForGame(roomId, user?.id, gameDisplayName.trim());
      setShowRenameModal(false);
    }
  };

  // Get the display name for the current player (use game-specific name if set)
  const getCurrentPlayerName = () => {
    if (!room || !user) return '';
    const player = room.players.find(p => p.id === user.id);
    if (!player) return user.displayName;
    return player.displayNameForGame || player.displayName;
  };

  if (userLoading || roomLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex justify-center items-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-violet-500 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading room...</p>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col justify-center items-center text-center gap-6 px-4">
        <div className="text-6xl">😕</div>
        <h2 className="text-3xl font-bold text-slate-300">Room unavailable</h2>
        <p className="text-slate-500">{error || "This room doesn't exist or has ended."}</p>
        <button 
          onClick={handleLeaveRoom}
          className="px-8 py-3 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-xl transition-colors"
        >
          Back to Home
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col">
      {/* Top Bar */}
      <header className="relative z-40 bg-slate-900/50 backdrop-blur-sm border-b border-slate-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center gap-4">
          {/* Room Code */}
          <div className="flex-1 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 text-xs font-medium">Code:</span>
              <div className="bg-slate-800 border-2 border-violet-500/50 rounded-lg px-3 py-1">
                <span className="text-violet-400 font-black text-base tracking-widest">{room.code}</span>
              </div>
            </div>
          </div>

          {/* Settings Dropdown */}
          <div className="relative" ref={settingsRef}>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="text-violet-400/80 hover:text-violet-300 hover:bg-violet-500/10 p-2 rounded-lg transition-colors"
              title="Settings"
            >
              <span className="material-symbols-outlined text-3xl">settings</span>
            </button>
            
            {showSettings && (
              <div className="absolute right-0 mt-2 w-56 bg-slate-800 border border-slate-700 rounded-xl shadow-xl shadow-black/50 overflow-hidden z-50">
                <div className="divide-y divide-slate-700/60">
                  <button
                    onClick={() => {
                      setShowRenameModal(true);
                      setShowSettings(false);
                    }}
                    className="relative z-10 flex w-full items-center px-4 py-3 text-left text-slate-300 hover:bg-slate-700 transition-colors font-medium first:rounded-t-xl"
                  >
                    Change nickname
                  </button>
                  <button
                    onClick={handleLeaveRoom}
                    className="relative z-10 flex w-full items-center px-4 py-3 text-left text-red-400 hover:bg-slate-700 transition-colors font-medium last:rounded-b-xl"
                  >
                    Leave Room
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-0 flex-1 w-full max-w-md mx-auto px-6 py-8">
        {isHost ? (
          <HostView room={room} getCurrentPlayerName={getCurrentPlayerName} />
        ) : (
          <PlayerView room={room} getCurrentPlayerName={getCurrentPlayerName} />
        )}
      </main>

      {/* Change Nickname Modal */}
      {showRenameModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-white text-lg font-bold mb-4">Change nickname</h3>
            <input
              type="text"
              value={gameDisplayName}
              onChange={(e) => setGameDisplayName(e.target.value)}
              placeholder="Enter your game name..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowRenameModal(false)}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveGameName}
                disabled={!gameDisplayName.trim()}
                className="flex-1 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-600 disabled:text-slate-500 text-white rounded-lg font-bold transition-colors disabled:cursor-not-allowed"
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

function HostView({ room, getCurrentPlayerName }) {
  return (
    <div className="h-full flex flex-col gap-6">
      
      {/* Players Section */}
      <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-300">👥 Players in Room</h3>
          <span className="bg-violet-600 text-white text-sm font-bold px-3 py-1 rounded-full">
            {room.players.length}
          </span>
        </div>
        <ul className="space-y-2">
          {room.players.map(player => (
            <li 
              key={player.id} 
              className="flex justify-between items-center p-3 bg-slate-900/50 rounded-lg border border-slate-800"
            >
              <div className="flex items-center gap-3">
                {player.avatar ? (
                  <img
                    src={player.avatar}
                    alt={player.displayNameForGame || player.displayName}
                    className="w-9 h-9 rounded-full object-cover border border-slate-700"
                  />
                ) : (
                  <div
                    className={`w-9 h-9 rounded-full ${getAvatarColor(player.displayNameForGame || player.displayName)} flex items-center justify-center text-white text-xs font-bold border border-slate-700`}
                  >
                    {getInitials(player.displayNameForGame || player.displayName)}
                  </div>
                )}
                <span className="text-slate-300 font-medium">{player.displayNameForGame || player.displayName}</span>
              </div>
              {player.isHost && (
                <span className="bg-gradient-to-r from-violet-600 to-purple-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                  HOST
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Action Buttons */}
      <div className="flex-1 flex flex-col gap-4 justify-center">
        <button className="group relative overflow-hidden bg-gradient-to-br from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 rounded-2xl p-8 text-center shadow-lg shadow-purple-900/50 hover:shadow-xl hover:shadow-purple-800/60 hover:-translate-y-1 active:translate-y-0 transition-all duration-300">
          <div className="text-5xl mb-3">🎮</div>
          <div className="text-white font-bold text-xl">Games</div>
          <div className="text-violet-200 text-sm mt-1">Start a new game</div>
        </button>

        <button className="group relative overflow-hidden bg-slate-800/50 border-2 border-violet-500 hover:bg-slate-800 rounded-2xl p-8 text-center shadow-lg hover:shadow-xl hover:shadow-violet-900/30 hover:-translate-y-1 active:translate-y-0 transition-all duration-300">
          <div className="text-5xl mb-3">🎡</div>
          <div className="text-white font-bold text-xl">Forfeit Wheel</div>
          <div className="text-slate-400 text-sm mt-1">Spin for a loser</div>
        </button>
      </div>

    </div>
  );
}

function PlayerView({ room, getCurrentPlayerName }) {
  return (
    <div className="h-full flex flex-col gap-6">
      
      {/* Waiting Message */}
      <div className="text-center py-6">
        <div className="text-6xl mb-4 animate-pulse">⏳</div>
        <h2 className="text-2xl font-bold text-slate-400 italic">Waiting for host...</h2>
        <p className="text-slate-600 mt-2">The host will start the game soon</p>
      </div>

      {/* Players Section */}
      <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-300">👥 Players in Room</h3>
          <span className="bg-violet-600 text-white text-sm font-bold px-3 py-1 rounded-full">
            {room.players.length}
          </span>
        </div>
        <ul className="space-y-2">
          {room.players.map(player => (
            <li 
              key={player.id} 
              className="flex justify-between items-center p-3 bg-slate-900/50 rounded-lg border border-slate-800"
            >
              <div className="flex items-center gap-3">
                {player.avatar ? (
                  <img
                    src={player.avatar}
                    alt={player.displayNameForGame || player.displayName}
                    className="w-9 h-9 rounded-full object-cover border border-slate-700"
                  />
                ) : (
                  <div
                    className={`w-9 h-9 rounded-full ${getAvatarColor(player.displayNameForGame || player.displayName)} flex items-center justify-center text-white text-xs font-bold border border-slate-700`}
                  >
                    {getInitials(player.displayNameForGame || player.displayName)}
                  </div>
                )}
                <span className="text-slate-300 font-medium">{player.displayNameForGame || player.displayName}</span>
              </div>
              {player.isHost && (
                <span className="bg-gradient-to-r from-violet-600 to-purple-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                  HOST
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Action Buttons */}
      <div className="flex-1 flex flex-col gap-4 justify-center">
        <button className="group relative overflow-hidden bg-gradient-to-br from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 rounded-2xl p-8 text-center shadow-lg shadow-purple-900/50 hover:shadow-xl hover:shadow-purple-800/60 hover:-translate-y-1 active:translate-y-0 transition-all duration-300">
          <div className="text-5xl mb-3">🎮</div>
          <div className="text-white font-bold text-xl">Games</div>
          <div className="text-violet-200 text-sm mt-1">Play games</div>
        </button>

        <button className="group relative overflow-hidden bg-slate-800/50 border-2 border-violet-500 hover:bg-slate-800 rounded-2xl p-8 text-center shadow-lg hover:shadow-xl hover:shadow-violet-900/30 hover:-translate-y-1 active:translate-y-0 transition-all duration-300">
          <div className="text-5xl mb-3">🎡</div>
          <div className="text-white font-bold text-xl">Forfeit Wheel</div>
          <div className="text-slate-400 text-sm mt-1">Spin the wheel</div>
        </button>
      </div>

    </div>
  );
}
