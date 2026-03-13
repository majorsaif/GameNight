import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useRoom, leaveRoom, startVote, castVote, endActivity, startWheel, spinWheel } from '../hooks/useRoom';
import { useAuth } from '../hooks/useAuth';
import VoteModal from './VoteModal';
import ActiveVote from './ActiveVote';
import WheelSpin from './ForfeitWheel';
import WheelSetupModal from './WheelSetupModal';
import MafiaLobbyCard from './MafiaLobbyCard';
import WordImposterLobbyCard from './WordImposterLobbyCard';
import GameNightLogo from './GameNightLogo';
import ProfileModal from './ProfileModal';
import { getInitials, getAvatarColor, backfillAvatarColors } from '../utils/avatar';
import mafiaRules from '../rules/mafia';
import wordImposterRulesData from '../rules/wordImposter';

export default function HomeScreen() {
  const { roomId } = useParams();
  const { user, loading: userLoading } = useAuth();
  console.log('📍 HomeScreen mounted with roomId:', roomId);
  const { room, loading: roomLoading, error, isHost } = useRoom(
    roomId, 
    user?.id, 
    user?.displayName,
    user?.photo || null
  );
  const navigate = useNavigate();
  const location = useLocation();
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showVoteModal, setShowVoteModal] = useState(false);
  const [showWheelSetup, setShowWheelSetup] = useState(false);

  // Backfill avatar colors for existing players
  useEffect(() => {
    if (roomId && room) {
      backfillAvatarColors(roomId);
    }
  }, [roomId, room]);

  // Auto-navigate lobby participants whenever Mafia is beyond lobby and user is not already on Mafia page
  useEffect(() => {
    if (!room || !roomId || !user?.id) return;

    const activity = room.activeActivity;

    if (!activity) return;

    const newPhase = activity.phase;
    const lobbyPlayers = activity.lobbyPlayers || [];
    const isLobbyParticipant = lobbyPlayers.includes(user.id);
    const isBeyondLobby = newPhase && newPhase !== 'lobby';

    if (activity.type === 'mafia') {
      const mafiaRoute = `/room/${roomId}/games/mafia`;
      const alreadyOnMafiaPage = location.pathname === mafiaRoute;
      if (isBeyondLobby && isLobbyParticipant && !alreadyOnMafiaPage) {
        console.log('[HomeScreen] Auto-joining Mafia game', { phase: newPhase, userId: user.id });
        navigate(`/room/${roomId}/games/mafia`);
      }
    }

    if (activity.type === 'wordImposter') {
      const wiRoute = `/room/${roomId}/games/word-imposter`;
      const alreadyOnWiPage = location.pathname === wiRoute;
      if (isBeyondLobby && isLobbyParticipant && !alreadyOnWiPage) {
        console.log('[HomeScreen] Auto-joining Word Imposter game', { phase: newPhase, userId: user.id });
        navigate(wiRoute);
      }
    }
  }, [room, roomId, user?.id, navigate, location.pathname]);

  const handleLeaveRoom = () => {
    if (roomId && user?.id) {
      leaveRoom(roomId, user.id);
    }
    navigate('/');
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
      <header className="relative z-40 w-full max-w-md mx-auto px-4 sm:px-6 py-4">
        <div className="flex justify-between items-center">
          {/* Logo */}
          <GameNightLogo />

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Share Button */}
            <button
              onClick={() => {
                if (navigator.share) {
                  navigator.share({
                    title: 'Join my room on Its Games Night',
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

            {/* Leave Room Button */}
            <button
              onClick={handleLeaveRoom}
              className="flex items-center justify-center w-11 h-11 bg-slate-800 border border-slate-700 rounded-full text-slate-300 hover:text-red-400 hover:bg-slate-700 transition-colors"
              title="Leave room"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>

            {/* Profile / Avatar Button */}
            <button
              onClick={() => setShowProfileModal(true)}
              className="flex items-center justify-center w-11 h-11 rounded-full"
              title="Profile"
            >
              {user?.photo ? (
                <img
                  src={user.photo}
                  alt={user?.displayName}
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
                <div className={`w-10 h-10 rounded-full ${getAvatarColor(user?.displayName)} flex items-center justify-center text-white font-bold text-sm`}>
                  {getInitials(user?.displayName)}
                </div>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-0 flex-1 w-full max-w-md mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6 overflow-y-auto">
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
            navigate={navigate}
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
            navigate={navigate}
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

      <ProfileModal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} />
    </div>
  );
}

function HostView({ room, getCurrentPlayerName, onOpenVoteModal, onOpenWheelSetup, onCastVote, onEndVote, onSpinWheel, onEndWheel, userId, roomId, navigate }) {
  const [showAllPlayers, setShowAllPlayers] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [mafiaRules, setMafiaRules] = useState(room.activeActivity?.rules || {
    mafiaCount: 1,
    doctor: true,
    detective: true,
    discussionTime: 3,
    votingTime: 1
  });
  
  const [showWiRulesModal, setShowWiRulesModal] = useState(false);
  const [wiRules, setWiRules] = useState(room.activeActivity?.rules || {
    imposterCount: 1,
    showCategory: true
  });

  const hasActiveActivity = room.activeActivity != null;
  const activityType = room.activeActivity?.type;
  const isWheel = hasActiveActivity && (activityType === 'playerWheel' || activityType === 'customWheel');
  const isMafia = hasActiveActivity && activityType === 'mafia';
  const isMafiaLobby = isMafia && room.activeActivity?.phase === 'lobby';
  const isWordImposter = hasActiveActivity && activityType === 'wordImposter';
  const isWordImposterLobby = isWordImposter && room.activeActivity?.phase === 'lobby';
  const isVote = hasActiveActivity && (activityType === 'playerVote' || activityType === 'customPoll' || activityType === 'vote');
  
  const hostPlayer = room.players.find(p => p.isHost);
  const maxVisibleAvatars = 6;
  const visiblePlayers = room.players.slice(0, maxVisibleAvatars);
  const remainingCount = room.players.length - maxVisibleAvatars;

  return (
    <div className="flex flex-col gap-6 w-full">
      
      {/* Hero Section */}
      <div className="text-center pt-2 pb-4">
        <h1 className="text-5xl font-black leading-tight mb-2">
          <span className="text-slate-400 italic text-2xl block">ROOM</span>
          <span className="text-violet-400 italic">{room.code}</span>
        </h1>
        <p className="text-slate-400 text-sm">Ready to play? Pick a challenge below!</p>
      </div>
      
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
              {player.photo ? (
                <img
                  src={player.photo}
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
                    {player.photo ? (
                      <img
                        src={player.photo}
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
          ) : isMafiaLobby ? (
            <MafiaLobbyCard
              lobbyState={room.activeActivity}
              roomPlayers={room.players}
              userId={userId}
              roomId={roomId}
              navigate={navigate}
              isHost={true}
              rules={mafiaRules}
              setRules={setMafiaRules}
              showRulesModal={showRulesModal}
              setShowRulesModal={setShowRulesModal}
            />
          ) : isMafia ? (
            <button
              onClick={() => navigate(`/room/${roomId}/games/mafia`)}
              className="w-full bg-gradient-to-br from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 rounded-2xl p-6 text-left shadow-xl transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-red-500/30 rounded-xl flex items-center justify-center text-2xl">
                  🔪
                </div>
                <div>
                  <h3 className="text-white font-bold text-lg">Mafia Game Active</h3>
                  <p className="text-red-100 text-sm">Click to join the game</p>
                </div>
              </div>
            </button>
          ) : isWordImposterLobby ? (
            <WordImposterLobbyCard
              lobbyState={room.activeActivity}
              roomPlayers={room.players}
              userId={userId}
              roomId={roomId}
              navigate={navigate}
              isHost={true}
              rules={wiRules}
              setRules={setWiRules}
              showRulesModal={showWiRulesModal}
              setShowRulesModal={setShowWiRulesModal}
            />
          ) : isWordImposter ? (
            <button
              onClick={() => navigate(`/room/${roomId}/games/word-imposter`)}
              className="w-full bg-gradient-to-br from-teal-600 to-cyan-700 hover:from-teal-500 hover:to-cyan-600 rounded-2xl p-6 text-left shadow-xl transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-teal-500/30 rounded-xl flex items-center justify-center text-2xl">
                  🕵️
                </div>
                <div>
                  <h3 className="text-white font-bold text-lg">Word Imposter Active</h3>
                  <p className="text-teal-100 text-sm">Click to join the game</p>
                </div>
              </div>
            </button>
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

      {/* Browse Games - Large Full Width Card */}
      <button type="button" onClick={() => navigate(`/room/${roomId}/games`)} className="group relative overflow-hidden bg-gradient-to-br from-blue-600 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 rounded-2xl p-8 text-left shadow-xl hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 transition-all duration-300 h-52">
        <div className="relative z-10">
          <div className="w-12 h-12 bg-blue-500/30 rounded-xl flex items-center justify-center mb-4">
            <span className="text-3xl">🎮</span>
          </div>
          <h2 className="text-white font-black text-3xl uppercase mb-2 tracking-tight">BROWSE<br/>GAMES</h2>
          <p className="text-blue-100 text-sm">150+ titles available</p>
        </div>
        <div className="absolute bottom-0 right-0 text-blue-400/10 transform translate-x-8 translate-y-8">
          <svg className="w-40 h-40" fill="currentColor" viewBox="0 0 24 24">
            <path d="M7 6v2h10V6H7zm0 6v-2h10v2H7zm0 4v-2h10v2H7zm0 4v-2h7v2H7z"/>
          </svg>
        </div>
      </button>

      {/* Vote Card */}
      <button 
        onClick={onOpenVoteModal}
        className="group relative overflow-hidden bg-gradient-to-br from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 rounded-2xl p-8 text-left shadow-xl hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 transition-all duration-300 h-52"
      >
        <div className="relative z-10">
          <div className="w-12 h-12 bg-violet-500/30 rounded-xl flex items-center justify-center mb-4">
            <span className="text-3xl">🔮</span>
          </div>
          <h2 className="text-white font-black text-3xl uppercase mb-2 tracking-tight">VOTE</h2>
          <p className="text-violet-100 text-sm">Quick decision making</p>
        </div>
        <div className="absolute bottom-0 right-0 text-violet-400/10 transform translate-x-8 translate-y-8">
          <svg className="w-40 h-40" fill="currentColor" viewBox="0 0 24 24">
            <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
          </svg>
        </div>
      </button>

      {/* Wheel Spin Card */}
      <button 
        onClick={onOpenWheelSetup}
        className="group relative overflow-hidden bg-gradient-to-br from-orange-500 to-amber-600 hover:from-orange-400 hover:to-amber-500 rounded-2xl p-8 text-left shadow-xl hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 transition-all duration-300 h-52"
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

function GameRulesSection({ activityType }) {
  let rules = null;
  if (activityType === 'mafia') rules = mafiaRules;
  if (activityType === 'wordImposter') rules = wordImposterRulesData;
  if (!rules) return null;

  return (
    <div className="bg-slate-800/80 border border-slate-700 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-700/70">
        <span className="text-white font-bold text-base">
          {rules.title} Rules
        </span>
      </div>
      <div className="px-5 pb-5 pt-4 space-y-4">
        <p className="text-slate-300 text-sm leading-relaxed">{rules.summary}</p>
        {rules.sections.map((section, i) => (
          <div key={i}>
            <h4 className="text-violet-400 font-semibold text-sm mb-1">{section.heading}</h4>
            {section.text && (
              <p className="text-slate-400 text-sm leading-relaxed">{section.text}</p>
            )}
            {section.items && (
              <ul className="space-y-1">
                {section.items.map((item, j) => (
                  <li key={j} className="text-slate-400 text-sm leading-relaxed">
                    <span className="text-white font-medium">{item.role}:</span> {item.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PlayerView({ room, getCurrentPlayerName, onCastVote, onSpinWheel, onEndWheel, userId, roomId, navigate }) {
  const [showAllPlayers, setShowAllPlayers] = useState(false);
  const hasActiveActivity = room.activeActivity != null;
  const activityType = room.activeActivity?.type;
  const isWheel = hasActiveActivity && (activityType === 'playerWheel' || activityType === 'customWheel');
  const isMafia = hasActiveActivity && activityType === 'mafia';
  const isMafiaLobby = isMafia && room.activeActivity?.phase === 'lobby';
  const isWordImposter = hasActiveActivity && activityType === 'wordImposter';
  const isWordImposterLobby = isWordImposter && room.activeActivity?.phase === 'lobby';
  const isVote = hasActiveActivity && (activityType === 'playerVote' || activityType === 'customPoll' || activityType === 'vote');
  
  const hostPlayer = room.players.find(p => p.isHost);
  const maxVisibleAvatars = 6;
  const visiblePlayers = room.players.slice(0, maxVisibleAvatars);
  const remainingCount = room.players.length - maxVisibleAvatars;

  return (
    <div className="flex flex-col gap-6 w-full">
      
      {/* Hero Section */}
      <div className="text-center pt-2 pb-4">
        <h1 className="text-5xl font-black leading-tight mb-2">
          <span className="text-slate-400 italic text-2xl block">ROOM</span>
          <span className="text-violet-400 italic">{room.code}</span>
        </h1>
      </div>
      
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
              {player.photo ? (
                <img
                  src={player.photo}
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
                    {player.photo ? (
                      <img
                        src={player.photo}
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
          ) : isMafiaLobby ? (
            <MafiaLobbyCard
              lobbyState={room.activeActivity}
              roomPlayers={room.players}
              userId={userId}
              roomId={roomId}
              navigate={navigate}
              isHost={false}
            />
          ) : isMafia ? (
            <button
              onClick={() => navigate(`/room/${roomId}/games/mafia`)}
              className="w-full bg-gradient-to-br from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 rounded-2xl p-6 text-left shadow-xl transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-red-500/30 rounded-xl flex items-center justify-center text-2xl">
                  🔪
                </div>
                <div>
                  <h3 className="text-white font-bold text-lg">A Mafia game is starting!</h3>
                  <p className="text-red-100 text-sm">Click to join the game</p>
                </div>
              </div>
            </button>
          ) : isWordImposterLobby ? (
            <WordImposterLobbyCard
              lobbyState={room.activeActivity}
              roomPlayers={room.players}
              userId={userId}
              roomId={roomId}
              navigate={navigate}
              isHost={false}
            />
          ) : isWordImposter ? (
            <button
              onClick={() => navigate(`/room/${roomId}/games/word-imposter`)}
              className="w-full bg-gradient-to-br from-teal-600 to-cyan-700 hover:from-teal-500 hover:to-cyan-600 rounded-2xl p-6 text-left shadow-xl transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-teal-500/30 rounded-xl flex items-center justify-center text-2xl">
                  🕵️
                </div>
                <div>
                  <h3 className="text-white font-bold text-lg">A Word Imposter game is starting!</h3>
                  <p className="text-teal-100 text-sm">Click to join the game</p>
                </div>
              </div>
            </button>
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
      ) : (
        <div className="text-center py-6">
          <div className="text-5xl mb-3 inline-block animate-bounce">⏳</div>
          <h2 className="text-xl font-bold text-slate-400 italic">Waiting for host...</h2>
          <p className="text-slate-600 text-sm mt-2">The host will start an activity soon</p>
        </div>
      )}

      {/* Rules Section (shown only when activity is active) */}
      {hasActiveActivity && (
        <GameRulesSection activityType={room.activeActivity?.type} />
      )}

    </div>
  );
}
