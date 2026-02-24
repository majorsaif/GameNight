import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRoom } from '../hooks/useRoom';
import { useAuth } from '../hooks/useAuth';

export default function HomeScreen() {
  const { roomId } = useParams();
  const { user, loading: userLoading } = useAuth();
  const { room, loading: roomLoading, isHost } = useRoom(
    roomId, 
    user?.id, 
    user?.displayName
  );
  const navigate = useNavigate();
  const [showSettings, setShowSettings] = useState(false);

  const handleLeaveRoom = () => {
    navigate('/');
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
        <h2 className="text-3xl font-bold text-slate-300">Room not found</h2>
        <p className="text-slate-500">This room doesn't exist or has ended.</p>
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
      <header className="bg-slate-900/50 backdrop-blur-sm border-b border-slate-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          {/* Room Code */}
          <div className="flex items-center gap-3">
            <div className="text-slate-500 text-sm font-medium">Room</div>
            <div className="bg-slate-800 border-2 border-violet-500/50 rounded-lg px-4 py-2">
              <span className="text-violet-400 font-black text-xl tracking-[0.3em]">{room.code}</span>
            </div>
          </div>

          {/* Settings Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="text-3xl hover:bg-slate-800 p-2 rounded-lg transition-colors"
              title="Settings"
            >
              ⚙️
            </button>
            
            {showSettings && (
              <div className="absolute right-0 mt-2 w-56 bg-slate-800 border border-slate-700 rounded-xl shadow-xl shadow-black/50 overflow-hidden z-50">
                <div className="py-2">
                  <button
                    onClick={handleLeaveRoom}
                    className="w-full px-4 py-3 text-left text-red-400 hover:bg-slate-700 transition-colors font-medium"
                  >
                    {isHost ? '🚪 End Game Night' : '👋 Leave Room'}
                  </button>
                  <button
                    onClick={() => setShowSettings(false)}
                    className="w-full px-4 py-3 text-left text-slate-400 hover:bg-slate-700 transition-colors"
                  >
                    ❌ Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-4 py-8 max-w-3xl w-full mx-auto">
        {isHost ? (
          <HostView room={room} />
        ) : (
          <PlayerView room={room} />
        )}
      </main>
    </div>
  );
}

function HostView({ room }) {
  return (
    <div className="space-y-8">
      
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
              <span className="text-slate-300 font-medium">{player.displayName}</span>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

function PlayerView({ room }) {
  return (
    <div className="space-y-8">
      
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
              <span className="text-slate-300 font-medium">{player.displayName}</span>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
