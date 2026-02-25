import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRoom, updatePlayerNameForGame, leaveRoom, startVote, castVote, endActivity, startWheel, spinWheel } from '../hooks/useRoom';
import { useAuth } from '../hooks/useAuth';
import VoteModal from './VoteModal';
import ActiveVote from './ActiveVote';
import WheelSpin from './ForfeitWheel';
import WheelSetupModal from './WheelSetupModal';
import { getInitials, getAvatarColor, backfillAvatarColors } from '../utils/avatar';

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
  const [showVoteModal, setShowVoteModal] = useState(false);
  const [showWheelSetup, setShowWheelSetup] = useState(false);
  const [gameDisplayName, setGameDisplayName] = useState(room?.players.find(p => p.id === user?.id)?.displayNameForGame || user?.displayName || '');
  const settingsRef = useRef(null);

  // Backfill avatar colors for existing players
  useEffect(() => {
    if (roomId && room) {
      backfillAvatarColors(roomId);
    }
  }, [roomId, room]);

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

  const handleStartVote = (voteData) => {
    startVote(roomId, voteData);
  };

  const handleCastVote = (optionId) => {
    castVote(roomId, user?.id, optionId);
  };

  const handleEndVote = () => {
    endActivity(roomId);
  };

  const handleLaunchWheel = (wheelData) => {
    startWheel(roomId, wheelData);
    setShowWheelSetup(false);
  };

  const handleSpinWheel = () => {
    spinWheel(roomId);
  };

  const handleEndWheel = () => {
    endActivity(roomId);
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
      <header className="relative z-40 w-full max-w-md mx-auto px-6 py-4">
        <div className="flex justify-between items-center">
          {/* Room Code Box */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-violet-600 to-purple-600 rounded-xl flex items-center justify-center text-2xl shadow-lg">
              🎲
            </div>
            <div className="flex flex-col">
              <span className="text-orange-400 text-[10px] font-bold uppercase tracking-wider">Room Code</span>
              <span className="text-white font-black text-lg tracking-wide">{room.code}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Share Button */}
            <button
              onClick={() => {
                if (navigator.share) {
                  navigator.share({
                    title: 'Join my GameNight room',
                    text: `Join room ${room.code}`,
                    url: window.location.href
                  }).catch(() => {});
                } else {
                  navigator.clipboard.writeText(window.location.href);
                }
              }}
              className="flex items-center justify-center w-11 h-11 bg-slate-800 border border-slate-700 rounded-full text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
              title="Share room"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            </button>

            {/* Settings Button */}
            <div className="relative" ref={settingsRef}>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="flex items-center justify-center w-11 h-11 bg-slate-800 border border-slate-700 rounded-full text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                title="Settings"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
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
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-0 flex-1 w-full max-w-md mx-auto px-6 py-6 flex flex-col gap-6 overflow-y-auto">
        {isHost ? (
          <HostView 
            room={room} 
            getCurrentPlayerName={getCurrentPlayerName}
            onOpenVoteModal={() => setShowVoteModal(true)}
            onOpenWheelSetup={() => setShowWheelSetup(true)}
            onCastVote={handleCastVote}
            onEndVote={handleEndVote}
            onSpinWheel={handleSpinWheel}
            onEndWheel={handleEndWheel}
            userId={user?.id}
            roomId={roomId}
          />
        ) : (
          <PlayerView 
            room={room} 
            getCurrentPlayerName={getCurrentPlayerName}
            onCastVote={handleCastVote}
            onSpinWheel={handleSpinWheel}
            onEndWheel={handleEndWheel}
            userId={user?.id}
            roomId={roomId}
          />
        )}
      </main>

      {/* Vote Modal */}
      {showVoteModal && (
        <VoteModal
          room={room}
          onClose={() => setShowVoteModal(false)}
          onStartVote={handleStartVote}
        />
      )}

      {/* Wheel Setup Modal */}
      {showWheelSetup && (
        <WheelSetupModal
          room={room}
          onClose={() => setShowWheelSetup(false)}
          onLaunch={handleLaunchWheel}
        />
      )}

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

function HostView({ room, getCurrentPlayerName, onOpenVoteModal, onOpenWheelSetup, onCastVote, onEndVote, onSpinWheel, onEndWheel, userId, roomId }) {
  const [showAllPlayers, setShowAllPlayers] = useState(false);
  const hasActiveActivity = room.activeActivity !== undefined;
  const isWheel = hasActiveActivity && (room.activeActivity.type === 'playerWheel' || room.activeActivity.type === 'customWheel');
  const isVote = hasActiveActivity && !isWheel;
  
  const hostPlayer = room.players.find(p => p.isHost);
  const maxVisibleAvatars = 6;
  const visiblePlayers = room.players.slice(0, maxVisibleAvatars);
  const remainingCount = room.players.length - maxVisibleAvatars;

  return (
    <div className="flex flex-col gap-6">
      
      {/* Hero Section */}
      <div className="text-center pt-2 pb-4">
        <h1 className="text-5xl font-black leading-tight mb-2">
          <span className="text-white italic">GAME</span>
          <span className="text-violet-400 italic">NIGHT</span>
        </h1>
        <p className="text-slate-400 text-sm">Ready to play? Pick a challenge below!</p>
      </div>
      
      {/* Active Activity Section */}
      {hasActiveActivity && (
        <div>
          {isVote ? (
            <ActiveVote
              activity={room.activeActivity}
              room={room}
              userId={userId}
              isHost={true}
              onVote={onCastVote}
              onEndVote={onEndVote}
            />
          ) : (
            <WheelSpin
              activity={room.activeActivity}
              room={room}
              isHost={true}
              onEndActivity={onEndWheel}
              onSpin={onSpinWheel}
            />
          )}
        </div>
      )}

      {/* Compact Players Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest">
            Players in Room ({room.players.length})
          </h3>
          <button 
            onClick={() => setShowAllPlayers(true)}
            className="text-violet-400 hover:text-violet-300 text-sm font-semibold transition-colors"
          >
            See All
          </button>
        </div>
        <div className="flex items-center gap-0">
          {visiblePlayers.map((player, index) => (
            <div
              key={player.id}
              className="relative"
              style={{ marginLeft: index > 0 ? '-8px' : '0' }}
            >
              {player.avatar ? (
                <img
                  src={player.avatar}
                  alt={player.displayNameForGame || player.displayName}
                  className="w-11 h-11 rounded-full object-cover border-2 border-slate-900"
                  title={player.displayNameForGame || player.displayName}
                />
              ) : (
                <div
                  className={`w-11 h-11 rounded-full ${getAvatarColor(player, roomId)} flex items-center justify-center text-white text-sm font-bold border-2 border-slate-900`}
                  title={player.displayNameForGame || player.displayName}
                >
                  {getInitials(player.displayNameForGame || player.displayName)}
                </div>
              )}
              {player.isHost && (
                <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center text-xs border-2 border-slate-900">
                  ⭐
                </div>
              )}
            </div>
          ))}
          {remainingCount > 0 && (
            <div
              className="w-11 h-11 rounded-full bg-slate-700 flex items-center justify-center text-white text-sm font-bold border-2 border-slate-900"
              style={{ marginLeft: '-8px' }}
              title={`${remainingCount} more player${remainingCount > 1 ? 's' : ''}`}
            >
              +{remainingCount}
            </div>
          )}
        </div>
      </div>

      {/* See All Players Modal */}
      {showAllPlayers && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-white text-xl font-bold">All Players ({room.players.length})</h3>
              <button
                onClick={() => setShowAllPlayers(false)}
                className="text-slate-400 hover:text-slate-300 transition-colors text-2xl"
              >
                ✕
              </button>
            </div>
            <ul className="space-y-2">
              {room.players.map(player => (
                <li 
                  key={player.id} 
                  className="flex justify-between items-center p-3 bg-slate-900/50 rounded-lg border border-slate-700"
                >
                  <div className="flex items-center gap-3">
                    {player.avatar ? (
                      <img
                        src={player.avatar}
                        alt={player.displayNameForGame || player.displayName}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div
                        className={`w-10 h-10 rounded-full ${getAvatarColor(player, roomId)} flex items-center justify-center text-white text-sm font-bold`}
                      >
                        {getInitials(player.displayNameForGame || player.displayName)}
                      </div>
                    )}
                    <span className="text-slate-200 font-medium">{player.displayNameForGame || player.displayName}</span>
                  </div>
                  {player.isHost && (
                    <span className="text-yellow-500 text-lg">⭐</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Browse Games - Large Full Width Card */}
      <button className="group relative overflow-hidden bg-gradient-to-br from-blue-600 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 rounded-2xl p-8 text-left shadow-xl hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 transition-all duration-300">
        <div className="relative z-10">
          <div className="w-12 h-12 bg-blue-500/30 rounded-xl flex items-center justify-center mb-4">
            <span className="text-3xl">🎮</span>
          </div>
          <h2 className="text-white font-black text-3xl uppercase mb-2 tracking-tight">BROWSE<br/>GAMES</h2>
          <p className="text-blue-100 text-sm">150+ titles available</p>
        </div>
        <div className="absolute bottom-0 right-0 text-blue-400/10 transform translate-x-8 translate-y-4">
          <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24">
            <path d="M7 6v2h10V6H7zm0 6v-2h10v2H7zm0 4v-2h10v2H7zm0 4v-2h7v2H7z"/>
          </svg>
        </div>
      </button>

      {/* Vote Card */}
      <button 
        onClick={onOpenVoteModal}
        className="group relative overflow-hidden bg-gradient-to-br from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 rounded-2xl p-8 text-left shadow-xl hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 transition-all duration-300"
      >
        <div className="relative z-10">
          <div className="w-12 h-12 bg-violet-500/30 rounded-xl flex items-center justify-center mb-4">
            <span className="text-3xl">📝</span>
          </div>
          <h2 className="text-white font-black text-3xl uppercase mb-2 tracking-tight">VOTE</h2>
          <p className="text-violet-100 text-sm">Quick decision making</p>
        </div>
        <div className="absolute bottom-0 right-0 text-violet-400/10 transform translate-x-8 translate-y-4">
          <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24">
            <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
          </svg>
        </div>
      </button>

      {/* Wheel Spin Card */}
      <button 
        onClick={onOpenWheelSetup}
        className="group relative overflow-hidden bg-gradient-to-br from-orange-500 to-amber-600 hover:from-orange-400 hover:to-amber-500 rounded-2xl p-8 text-left shadow-xl hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 transition-all duration-300"
      >
        <div className="relative z-10">
          <div className="w-12 h-12 bg-orange-400/30 rounded-xl flex items-center justify-center mb-4">
            <span className="text-3xl">🎡</span>
          </div>
          <h2 className="text-white font-black text-3xl uppercase mb-2 tracking-tight">SPIN<br/>WHEEL</h2>
          <p className="text-orange-100 text-sm">Random selection</p>
        </div>
        <div className="absolute bottom-0 right-0 text-orange-400/10 transform translate-x-12 translate-y-8">
          <svg className="w-40 h-40" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10"/>
          </svg>
        </div>
      </button>

    </div>
  );
}

function PlayerView({ room, getCurrentPlayerName, onCastVote, onSpinWheel, onEndWheel, userId, roomId }) {
  const [showAllPlayers, setShowAllPlayers] = useState(false);
  const hasActiveActivity = room.activeActivity !== undefined;
  const isWheel = hasActiveActivity && (room.activeActivity.type === 'playerWheel' || room.activeActivity.type === 'customWheel');
  const isVote = hasActiveActivity && !isWheel;
  
  const hostPlayer = room.players.find(p => p.isHost);
  const maxVisibleAvatars = 6;
  const visiblePlayers = room.players.slice(0, maxVisibleAvatars);
  const remainingCount = room.players.length - maxVisibleAvatars;

  return (
    <div className="flex flex-col gap-6">
      
      {/* Hero Section */}
      <div className="text-center pt-2 pb-4">
        <h1 className="text-5xl font-black leading-tight mb-2">
          <span className="text-white italic">GAME</span>
          <span className="text-violet-400 italic">NIGHT</span>
        </h1>
        <p className="text-slate-400 text-sm">Ready to play? Pick a challenge below!</p>
      </div>
      
      {/* Active Activity Section or Waiting Message */}
      {hasActiveActivity ? (
        <div>
          {isVote ? (
            <ActiveVote
              activity={room.activeActivity}
              room={room}
              userId={userId}
              isHost={false}
              onVote={onCastVote}
              onEndVote={() => {}}
            />
          ) : (
            <WheelSpin
              activity={room.activeActivity}
              room={room}
              isHost={false}
              onEndActivity={() => {}}
              onSpin={() => {}}
            />
          )}
        </div>
      ) : null}

      {/* Compact Players Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest">
            Players in Room ({room.players.length})
          </h3>
          <button 
            onClick={() => setShowAllPlayers(true)}
            className="text-violet-400 hover:text-violet-300 text-sm font-semibold transition-colors"
          >
            See All
          </button>
        </div>
        <div className="flex items-center gap-0">
          {visiblePlayers.map((player, index) => (
            <div
              key={player.id}
              className="relative"
              style={{ marginLeft: index > 0 ? '-8px' : '0' }}
            >
              {player.avatar ? (
                <img
                  src={player.avatar}
                  alt={player.displayNameForGame || player.displayName}
                  className="w-11 h-11 rounded-full object-cover border-2 border-slate-900"
                  title={player.displayNameForGame || player.displayName}
                />
              ) : (
                <div
                  className={`w-11 h-11 rounded-full ${getAvatarColor(player, roomId)} flex items-center justify-center text-white text-sm font-bold border-2 border-slate-900`}
                  title={player.displayNameForGame || player.displayName}
                >
                  {getInitials(player.displayNameForGame || player.displayName)}
                </div>
              )}
              {player.isHost && (
                <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center text-xs border-2 border-slate-900">
                  ⭐
                </div>
              )}
            </div>
          ))}
          {remainingCount > 0 && (
            <div
              className="w-11 h-11 rounded-full bg-slate-700 flex items-center justify-center text-white text-sm font-bold border-2 border-slate-900"
              style={{ marginLeft: '-8px' }}
              title={`${remainingCount} more player${remainingCount > 1 ? 's' : ''}`}
            >
              +{remainingCount}
            </div>
          )}
        </div>
      </div>

      {/* See All Players Modal */}
      {showAllPlayers && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-white text-xl font-bold">All Players ({room.players.length})</h3>
              <button
                onClick={() => setShowAllPlayers(false)}
                className="text-slate-400 hover:text-slate-300 transition-colors text-2xl"
              >
                ✕
              </button>
            </div>
            <ul className="space-y-2">
              {room.players.map(player => (
                <li 
                  key={player.id} 
                  className="flex justify-between items-center p-3 bg-slate-900/50 rounded-lg border border-slate-700"
                >
                  <div className="flex items-center gap-3">
                    {player.avatar ? (
                      <img
                        src={player.avatar}
                        alt={player.displayNameForGame || player.displayName}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div
                        className={`w-10 h-10 rounded-full ${getAvatarColor(player, roomId)} flex items-center justify-center text-white text-sm font-bold`}
                      >
                        {getInitials(player.displayNameForGame || player.displayName)}
                      </div>
                    )}
                    <span className="text-slate-200 font-medium">{player.displayNameForGame || player.displayName}</span>
                  </div>
                  {player.isHost && (
                    <span className="text-yellow-500 text-lg">⭐</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Waiting Message - Only shown when no active activity */}
      {!hasActiveActivity && (
        <div className="text-center py-6">
          <div className="text-5xl mb-3 inline-block animate-bounce">⏳</div>
          <h2 className="text-xl font-bold text-slate-400 italic">Waiting for host...</h2>
          <p className="text-slate-600 text-sm mt-2">The host will start an activity soon</p>
        </div>
      )}

      {/* Browse Games - Large Full Width Card */}
      <button className="group relative overflow-hidden bg-gradient-to-br from-blue-600 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 rounded-2xl p-8 text-left shadow-xl hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 transition-all duration-300">
        <div className="relative z-10">
          <div className="w-12 h-12 bg-blue-500/30 rounded-xl flex items-center justify-center mb-4">
            <span className="text-3xl">🎮</span>
          </div>
          <h2 className="text-white font-black text-3xl uppercase mb-2 tracking-tight">BROWSE<br/>GAMES</h2>
          <p className="text-blue-100 text-sm">150+ titles available</p>
        </div>
        <div className="absolute bottom-0 right-0 text-blue-400/10 transform translate-x-8 translate-y-4">
          <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24">
            <path d="M7 6v2h10V6H7zm0 6v-2h10v2H7zm0 4v-2h10v2H7zm0 4v-2h7v2H7z"/>
          </svg>
        </div>
      </button>

      {/* Vote Card */}
      <button className="group relative overflow-hidden bg-gradient-to-br from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 rounded-2xl p-8 text-left shadow-xl hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 transition-all duration-300">
        <div className="relative z-10">
          <div className="w-12 h-12 bg-violet-500/30 rounded-xl flex items-center justify-center mb-4">
            <span className="text-3xl">📝</span>
          </div>
          <h2 className="text-white font-black text-3xl uppercase mb-2 tracking-tight">VOTE</h2>
          <p className="text-violet-100 text-sm">Quick decision making</p>
        </div>
        <div className="absolute bottom-0 right-0 text-violet-400/10 transform translate-x-8 translate-y-4">
          <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24">
            <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
          </svg>
        </div>
      </button>

      {/* Wheel Spin Card */}
      <button className="group relative overflow-hidden bg-gradient-to-br from-orange-500 to-amber-600 hover:from-orange-400 hover:to-amber-500 rounded-2xl p-8 text-left shadow-xl hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 transition-all duration-300">
        <div className="relative z-10">
          <div className="w-12 h-12 bg-orange-400/30 rounded-xl flex items-center justify-center mb-4">
            <span className="text-3xl">🎡</span>
          </div>
          <h2 className="text-white font-black text-3xl uppercase mb-2 tracking-tight">SPIN<br/>WHEEL</h2>
          <p className="text-orange-100 text-sm">Random selection</p>
        </div>
        <div className="absolute bottom-0 right-0 text-orange-400/10 transform translate-x-12 translate-y-8">
          <svg className="w-40 h-40" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10"/>
          </svg>
        </div>
      </button>

    </div>
  );
}
