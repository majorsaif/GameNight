import React, { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  endActivity,
  leaveRoom,
  removePlayer,
  spinWheel,
  startWheel,
  transferHost,
  useRoom
} from '../hooks/useRoom';
import { useAuth } from '../hooks/useAuth';
import WheelSpin from './ForfeitWheel';
import WheelSetupModal from './WheelSetupModal';
import MafiaLobbyCard from './MafiaLobbyCard';
import WordImposterLobbyCard from './WordImposterLobbyCard';
import SpyfallLobbyCard from './SpyfallLobbyCard';
import GameNightLogo from './GameNightLogo';
import ConfirmDialog from './ConfirmDialog';
import { GameLoading } from './GameShell';
import { useToast } from './Toast';
import { getAvatarColor, getInitials } from '../utils/avatar';
import mafiaRules from '../rules/mafia';
import wordImposterRulesData from '../rules/wordImposter';
import spyfallRulesData from '../rules/spyfall';

const GAME_ROUTES = {
  mafia: 'mafia',
  wordImposter: 'word-imposter',
  spyfall: 'spyfall'
};

const ACTIVE_GAME_CARDS = {
  mafia: { title: 'Mafia', emoji: '🔪', classes: 'from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600', sub: 'text-red-100' },
  wordImposter: { title: 'Word Imposter', emoji: '🕵️', classes: 'from-teal-600 to-cyan-700 hover:from-teal-500 hover:to-cyan-600', sub: 'text-teal-100' },
  spyfall: { title: 'Spyfall', emoji: '✈️', classes: 'from-indigo-600 to-blue-700 hover:from-indigo-500 hover:to-blue-600', sub: 'text-indigo-100' }
};

function PlayerAvatar({ player, size = 'w-11 h-11', text = 'text-sm', ring = 'border-2 border-slate-900' }) {
  const name = player.displayNameForGame || player.displayName;
  if (player.photo) {
    return <img src={player.photo} alt={name} title={name} className={`${size} rounded-full object-cover ${ring}`} />;
  }
  return (
    <div title={name} className={`${size} rounded-full ${getAvatarColor(player)} flex items-center justify-center text-white ${text} font-bold ${ring}`}>
      {getInitials(name)}
    </div>
  );
}

export default function HomeScreen() {
  const { roomId } = useParams();
  const { user, loading: userLoading } = useAuth();
  const { room, loading: roomLoading, error, isHost } = useRoom(roomId, user);
  const navigate = useNavigate();
  const toast = useToast();
  const [showWheelSetup, setShowWheelSetup] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  useEffect(() => {
    if (room?.code) document.title = `Room ${room.code} | Its Games Night`;
  }, [room?.code]);

  // Send game participants into a game the moment the host starts it from the lobby
  const activity = room?.activeActivity;
  const prevPhaseRef = useRef(undefined);
  useEffect(() => {
    const phase = activity ? `${activity.type}:${activity.phase}` : null;
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;
    if (!activity || !user?.id || !GAME_ROUTES[activity.type]) return;
    const wasLobby = prev === `${activity.type}:lobby`;
    if (!wasLobby || activity.phase === 'lobby') return;
    const participantIds = Array.isArray(activity.players) ? activity.players.map((p) => p.uid) : [];
    if (!participantIds.includes(user.id)) return;
    navigate(`/room/${roomId}/games/${GAME_ROUTES[activity.type]}`);
  }, [activity, user?.id, roomId, navigate]);

  const shareUrl = room ? `${window.location.origin}/join/${room.code}` : '';

  const handleShareRoom = async () => {
    const text = `Join my Its Games Night room! Code: ${room.code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Its Games Night', text, url: shareUrl });
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${shareUrl}`);
      toast.success('Invite link copied');
    } catch {
      toast.info(`Share this link: ${shareUrl}`, 6000);
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      toast.success(`Code ${room.code} copied`);
    } catch {
      // Clipboard can be blocked - nothing to do
    }
  };

  const handleLeaveRoom = async () => {
    setConfirmLeave(false);
    try {
      if (roomId && user?.id) await leaveRoom(roomId, user.id);
    } catch (err) {
      console.error('Leave failed:', err);
    }
    navigate('/');
  };

  if (!userLoading && !user) {
    return <Navigate to="/onboarding" replace state={{ redirectTo: `/room/${roomId}` }} />;
  }

  if (userLoading || roomLoading) return <GameLoading label="Loading room..." />;

  if (!room || !user || error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col justify-center items-center text-center gap-6 px-4">
        <div className="text-6xl" aria-hidden="true">😕</div>
        <h2 className="text-3xl font-bold text-slate-300">Room unavailable</h2>
        <p className="text-slate-500 max-w-sm">{error || "This room doesn't exist or has ended."}</p>
        <button
          onClick={() => navigate('/')}
          className="px-8 py-3 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-xl transition-colors"
        >
          Back to Home
        </button>
      </div>
    );
  }

  // Still being added to the room (first visit via an invite link)
  if (!room.playerIds.includes(user.id)) return <GameLoading label="Joining room..." />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col">
      <header className="relative z-40 w-full max-w-md mx-auto px-4 sm:px-6 py-4">
        <div className="flex justify-between items-center">
          <GameNightLogo className="translate-y-0.5" />
          <div className="flex items-center gap-2">
            <button
              onClick={handleShareRoom}
              className="flex items-center justify-center w-11 h-11 bg-slate-800 border border-slate-700 rounded-full text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
              title="Invite friends"
              aria-label="Invite friends"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            </button>
            <button
              onClick={() => setConfirmLeave(true)}
              className="flex items-center justify-center w-11 h-11 bg-slate-800 border border-slate-700 rounded-full text-slate-300 hover:text-red-400 hover:bg-slate-700 transition-colors"
              title="Leave room"
              aria-label="Leave room"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-0 flex-1 w-full max-w-md mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6 overflow-y-auto">
        <RoomView
          room={room}
          isHost={isHost}
          userId={user.id}
          roomId={roomId}
          navigate={navigate}
          onCopyCode={handleCopyCode}
          onShare={handleShareRoom}
          onOpenWheelSetup={() => setShowWheelSetup(true)}
        />
      </main>

      {showWheelSetup && (
        <WheelSetupModal
          room={room}
          onClose={() => setShowWheelSetup(false)}
          onLaunch={async (wheelData) => {
            setShowWheelSetup(false);
            try {
              await startWheel(roomId, wheelData);
            } catch {
              toast.error("Couldn't start the wheel. Try again.");
            }
          }}
        />
      )}

      <ConfirmDialog
        open={confirmLeave}
        title="Leave this room?"
        message={isHost && room.players.length > 1
          ? 'Someone else will become the host. You can rejoin with the room code.'
          : 'You can rejoin with the room code while the room is active.'}
        confirmLabel="Leave"
        tone="danger"
        onCancel={() => setConfirmLeave(false)}
        onConfirm={handleLeaveRoom}
      />
    </div>
  );
}

function PlayersModal({ room, roomId, isHost, userId, onClose }) {
  const toast = useToast();
  const [pending, setPending] = useState(null);

  const run = async (action, label) => {
    setPending(null);
    try {
      await action();
      toast.success(label);
    } catch (err) {
      console.error(err);
      toast.error('That didn\'t work. Try again.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-white text-xl font-bold">Players ({room.players.length})</h3>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-300 transition-colors text-2xl">✕</button>
        </div>
        <ul className="space-y-2">
          {room.players.map((player) => {
            const isRoomHost = player.id === room.hostId;
            const isMe = player.id === userId;
            return (
              <li key={player.id} className="flex justify-between items-center gap-3 p-3 bg-slate-900/50 rounded-lg border border-slate-700">
                <div className="flex items-center gap-3 min-w-0">
                  <PlayerAvatar player={player} size="w-10 h-10" ring="" />
                  <span className="text-slate-200 font-medium truncate">
                    {player.displayNameForGame || player.displayName}{isMe ? ' (you)' : ''}
                  </span>
                  {isRoomHost && <span className="text-yellow-500 text-lg" title="Host">⭐</span>}
                </div>
                {isHost && !isMe && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => setPending({ type: 'host', player })}
                      className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200"
                    >
                      Make host
                    </button>
                    <button
                      onClick={() => setPending({ type: 'remove', player })}
                      className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-red-900/50 hover:bg-red-900 text-red-200"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {isHost && (
          <p className="text-slate-500 text-xs mt-4">
            Remove players who&apos;ve left so games don&apos;t wait for them.
          </p>
        )}
      </div>

      <ConfirmDialog
        open={pending?.type === 'host'}
        title={`Make ${pending?.player?.displayName} the host?`}
        message="They'll be able to start games and manage the room. You stay in the room as a player."
        confirmLabel="Make host"
        onCancel={() => setPending(null)}
        onConfirm={() => run(() => transferHost(roomId, pending.player.id), `${pending.player.displayName} is now the host`)}
      />
      <ConfirmDialog
        open={pending?.type === 'remove'}
        title={`Remove ${pending?.player?.displayName}?`}
        message="They'll be taken out of the room. They can rejoin with the room code."
        confirmLabel="Remove"
        tone="danger"
        onCancel={() => setPending(null)}
        onConfirm={() => run(() => removePlayer(roomId, userId, pending.player.id), `${pending.player.displayName} was removed`)}
      />
    </div>
  );
}

function RoomView({ room, isHost, userId, roomId, navigate, onCopyCode, onShare, onOpenWheelSetup }) {
  const [showAllPlayers, setShowAllPlayers] = useState(false);
  const toast = useToast();
  const activity = room.activeActivity;
  const activityType = activity?.type;
  const isWheel = activityType === 'playerWheel' || activityType === 'customWheel';
  const isLobby = activity?.phase === 'lobby';

  const visiblePlayers = room.players.slice(0, 6);
  const remainingCount = room.players.length - visiblePlayers.length;

  const lobbyProps = { lobbyState: activity, room, roomPlayers: room.players, userId, roomId, navigate, isHost };

  const renderActivity = () => {
    if (!activity) return null;
    if (isLobby && activityType === 'mafia') return <MafiaLobbyCard {...lobbyProps} />;
    if (isLobby && activityType === 'wordImposter') return <WordImposterLobbyCard {...lobbyProps} />;
    if (isLobby && activityType === 'spyfall') return <SpyfallLobbyCard {...lobbyProps} />;
    if (ACTIVE_GAME_CARDS[activityType]) {
      const card = ACTIVE_GAME_CARDS[activityType];
      const inGame = Array.isArray(activity.players) && activity.players.some((p) => p.uid === userId);
      const ended = activity.phase === 'ended';
      return (
        <div className="space-y-3">
          <button
            onClick={() => navigate(`/room/${roomId}/games/${GAME_ROUTES[activityType]}`)}
            className={`w-full bg-gradient-to-br ${card.classes} rounded-2xl p-6 text-left shadow-xl transition-all`}
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-black/20 rounded-xl flex items-center justify-center text-2xl" aria-hidden="true">{card.emoji}</div>
              <div>
                <h3 className="text-white font-bold text-lg">
                  {ended ? `${card.title} - game over` : `${card.title} in progress`}
                </h3>
                <p className={`${card.sub} text-sm`}>
                  {ended ? 'Tap to see the results' : inGame ? 'Tap to return to the game' : 'Tap to watch'}
                </p>
              </div>
            </div>
          </button>
          {isHost && ended && (
            <button
              onClick={() => endActivity(roomId).catch(() => toast.error('Try again'))}
              className="w-full py-3 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl"
            >
              Close results and pick another game
            </button>
          )}
        </div>
      );
    }
    if (isWheel) {
      return (
        <WheelSpin
          activity={activity}
          room={room}
          isHost={isHost}
          onEndActivity={() => endActivity(roomId)}
          onSpin={() => spinWheel(roomId, activity).catch(() => toast.error("Couldn't spin. Try again."))}
        />
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="text-center pt-2 pb-4">
        <h1 className="text-5xl font-black leading-tight mb-2">
          <span className="text-slate-400 italic text-2xl block">ROOM</span>
          <button
            type="button"
            onClick={onCopyCode}
            className="text-violet-400 italic tracking-wider hover:text-violet-300"
            title="Copy room code"
          >
            {room.code}
          </button>
        </h1>
        <p className="text-slate-400 text-sm">
          {isHost
            ? (room.players.length < 3 ? 'Invite friends with the code or the share button.' : 'Ready to play? Pick a game below!')
            : 'Share the code to invite more friends.'}
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest">
            Players in Room ({room.players.length})
          </h3>
          <button
            onClick={() => setShowAllPlayers(true)}
            className="text-violet-400 hover:text-violet-300 text-sm font-semibold transition-colors"
          >
            {isHost ? 'Manage' : 'See All'}
          </button>
        </div>
        <div className="flex items-center">
          {visiblePlayers.map((player, index) => (
            <div key={player.id} className="relative" style={{ marginLeft: index > 0 ? '-8px' : '0' }}>
              <PlayerAvatar player={player} />
              {player.id === room.hostId && (
                <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center text-xs border-2 border-slate-900" title="Host">
                  ⭐
                </div>
              )}
            </div>
          ))}
          {remainingCount > 0 && (
            <div
              className="w-11 h-11 rounded-full bg-slate-700 flex items-center justify-center text-white text-sm font-bold border-2 border-slate-900"
              style={{ marginLeft: '-8px' }}
            >
              +{remainingCount}
            </div>
          )}
          {room.players.length === 1 && (
            <button
              onClick={onShare}
              className="ml-3 px-3 py-2 rounded-full border border-dashed border-slate-600 text-slate-400 hover:text-white hover:border-slate-400 text-sm"
            >
              + Invite
            </button>
          )}
        </div>
      </div>

      {showAllPlayers && (
        <PlayersModal
          room={room}
          roomId={roomId}
          isHost={isHost}
          userId={userId}
          onClose={() => setShowAllPlayers(false)}
        />
      )}

      {activity && <GameRulesSection activityType={activityType} />}

      {activity && <div>{renderActivity()}</div>}

      {isHost ? (
        <>
          <div>
            <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-3">GAMES</h3>
            <span className="block h-px w-full bg-[#2a3f5f]" />
          </div>
          <button
            type="button"
            aria-label="Social deduction games"
            onClick={() => navigate(`/room/${roomId}/games`)}
            style={{ backgroundImage: 'url("/images/cards/social-deduction.webp")', backgroundSize: '112%', backgroundPosition: 'center' }}
            className="group relative overflow-hidden rounded-[2rem] shadow-xl hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 transition-all duration-300 h-52 bg-slate-900"
          >
            <div className="absolute inset-0 bg-black/25" />
          </button>
          <button
            type="button"
            aria-label="Spin the wheel"
            onClick={onOpenWheelSetup}
            style={{ backgroundImage: 'url("/images/cards/spin-wheel.webp")', backgroundSize: '112%', backgroundPosition: 'center' }}
            className="group relative overflow-hidden rounded-[2rem] shadow-xl hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 transition-all duration-300 h-52 bg-slate-900"
          >
            <div className="absolute inset-0 bg-black/25" />
          </button>
        </>
      ) : !activity ? (
        <div className="text-center py-6">
          <div className="text-5xl mb-3 inline-block animate-bounce" aria-hidden="true">⏳</div>
          <h2 className="text-xl font-bold text-slate-400 italic">Waiting for host...</h2>
          <p className="text-slate-600 text-sm mt-2">The host will start a game soon</p>
        </div>
      ) : null}
    </div>
  );
}

function GameRulesSection({ activityType }) {
  let rules = null;
  if (activityType === 'mafia') rules = mafiaRules;
  if (activityType === 'wordImposter') rules = wordImposterRulesData;
  if (activityType === 'spyfall') rules = spyfallRulesData;

  const [isExpanded, setIsExpanded] = useState(false);
  const contentRef = useRef(null);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    setIsExpanded(false);
  }, [activityType]);

  useEffect(() => {
    const updateContentHeight = () => setContentHeight(contentRef.current?.scrollHeight || 0);
    updateContentHeight();
    window.addEventListener('resize', updateContentHeight);
    return () => window.removeEventListener('resize', updateContentHeight);
  }, [rules, isExpanded]);

  if (!rules) return null;

  return (
    <div className="bg-slate-800/80 border border-slate-700 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        className="w-full px-5 py-4 flex items-center justify-between text-left"
      >
        <span className="text-white font-bold text-base">{rules.title}</span>
        <span className="inline-flex items-center gap-2 text-slate-300 text-sm font-semibold">
          How to Play
          <svg className={`w-4 h-4 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>
      <div
        className="overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out"
        style={{ maxHeight: isExpanded ? `${contentHeight}px` : '0px', opacity: isExpanded ? 1 : 0 }}
      >
        <div ref={contentRef} className="px-5 pb-5 pt-4 space-y-4 border-t border-slate-700/70">
          <p className="text-slate-300 text-sm leading-relaxed">{rules.summary}</p>
          {rules.sections.map((section) => (
            <div key={section.heading}>
              <h4 className="text-violet-400 font-semibold text-sm mb-1">{section.heading}</h4>
              {section.text && <p className="text-slate-400 text-sm leading-relaxed">{section.text}</p>}
              {section.items && (
                <ul className="space-y-1">
                  {section.items.map((item) => (
                    <li key={item.role} className="text-slate-400 text-sm leading-relaxed">
                      <span className="text-white font-medium">{item.role}:</span> {item.text}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
