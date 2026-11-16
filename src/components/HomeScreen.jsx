import React, { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { BookOpen, Copy, Crown, Dices, DoorClosed, Hourglass, LogOut, Share2, UserMinus } from 'lucide-react';
import {
  endActivity,
  leaveRoom,
  removePlayer,
  transferHost,
  useRoom
} from '../hooks/useRoom';
import { useAuth } from '../hooks/useAuth';
import { GAMES, ACCENT_TINT } from '../games/catalog';
import MafiaLobbyCard from './MafiaLobbyCard';
import WordImposterLobbyCard from './WordImposterLobbyCard';
import SpyfallLobbyCard from './SpyfallLobbyCard';
import GameNightLogo from './GameNightLogo';
import RulesSheet from './RulesSheet';
import { useToast } from './Toast';
import {
  Avatar,
  AvatarStack,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  IconButton,
  LoadingScreen,
  Screen,
  ScreenFooter,
  SectionHeading,
  Sheet,
  StatusScreen,
  cn,
  playerName
} from '../ui';

const LOBBY_CARDS = {
  mafia: MafiaLobbyCard,
  wordImposter: WordImposterLobbyCard,
  spyfall: SpyfallLobbyCard
};

export default function HomeScreen() {
  const { roomId } = useParams();
  const { user, loading: userLoading } = useAuth();
  const { room, loading: roomLoading, error, isHost } = useRoom(roomId, user);
  const navigate = useNavigate();
  const toast = useToast();
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
    if (!activity || !user?.id || !GAMES[activity.type]) return;
    const wasLobby = prev === `${activity.type}:lobby`;
    if (!wasLobby || activity.phase === 'lobby') return;
    const participantIds = Array.isArray(activity.players) ? activity.players.map((p) => p.uid) : [];
    if (!participantIds.includes(user.id)) return;
    navigate(`/room/${roomId}/games/${GAMES[activity.type].route}`);
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
      toast.info(`The room code is ${room.code}`);
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

  if (userLoading || roomLoading) return <LoadingScreen label="Loading room" />;

  if (!room || !user || error) {
    return (
      <StatusScreen
        icon={DoorClosed}
        tone="danger"
        title="Room unavailable"
        message={error || "This room doesn't exist or has ended."}
      >
        <Button block onClick={() => navigate('/')}>Go to home</Button>
      </StatusScreen>
    );
  }

  // Still being added to the room (first visit via an invite link)
  if (!room.playerIds.includes(user.id)) return <LoadingScreen label="Joining room" />;

  return (
    <Screen
      width="wide"
      header={(
        <header className="sticky top-0 z-30 bg-bg/95 pt-safe backdrop-blur">
          <div className="mx-auto flex h-16 w-full max-w-column items-center justify-between gap-3 px-safe md:max-w-wide">
            <GameNightLogo />
            <div className="flex items-center gap-2">
              <IconButton icon={Share2} label="Invite friends" onClick={handleShareRoom} />
              <IconButton icon={LogOut} label="Leave room" tone="danger" onClick={() => setConfirmLeave(true)} />
            </div>
          </div>
        </header>
      )}
    >
      <RoomView
        room={room}
        isHost={isHost}
        userId={user.id}
        roomId={roomId}
        navigate={navigate}
        onCopyCode={handleCopyCode}
        onShare={handleShareRoom}
      />

      <ConfirmDialog
        open={confirmLeave}
        title="Leave this room?"
        message={isHost && room.players.length > 1
          ? 'Someone else becomes the host. You can rejoin with the room code.'
          : room.players.length > 1
            ? 'You can rejoin with the room code while the room is open.'
            : "You're the only one here, so the room will close."}
        confirmLabel="Leave room"
        cancelLabel="Stay"
        tone="danger"
        onCancel={() => setConfirmLeave(false)}
        onConfirm={handleLeaveRoom}
      />
    </Screen>
  );
}

function HostBadge() {
  return <Badge tone="warning" icon={Crown}>Host</Badge>;
}

function PlayersSheet({ open, room, roomId, isHost, userId, onClose }) {
  const toast = useToast();
  const [pending, setPending] = useState(null);

  const run = async (action, label) => {
    setPending(null);
    try {
      await action();
      toast.success(label);
    } catch (err) {
      console.error(err);
      toast.error("That didn't work. Try again.");
    }
  };

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={`Players (${room.players.length})`}
        description={isHost ? "Remove anyone who has left so games don't wait for them." : null}
      >
        <ul className="divide-y divide-line">
          {room.players.map((player) => {
            const isMe = player.id === userId;
            return (
              <li key={player.id} className="flex min-h-16 items-center gap-3 py-2">
                <Avatar player={player} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-medium text-ink">
                    {playerName(player)}{isMe ? ' (you)' : ''}
                  </p>
                  {player.id === room.hostId && <div className="mt-1"><HostBadge /></div>}
                </div>
                {isHost && !isMe && (
                  <div className="flex shrink-0 gap-2">
                    <IconButton icon={Crown} label={`Make ${playerName(player)} the host`} onClick={() => setPending({ type: 'host', player })} />
                    <IconButton icon={UserMinus} tone="danger" label={`Remove ${playerName(player)}`} onClick={() => setPending({ type: 'remove', player })} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Sheet>

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
    </>
  );
}

function RoomView({ room, isHost, userId, roomId, navigate, onCopyCode, onShare }) {
  const [showAllPlayers, setShowAllPlayers] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const toast = useToast();
  // Rooms left on an activity this version doesn't know (e.g. the retired
  // wheel) are treated as having no activity, so they show the normal room view.
  const activity = GAMES[room.activeActivity?.type] ? room.activeActivity : null;
  const game = activity ? GAMES[activity.type] : null;
  const isLobby = activity?.phase === 'lobby';
  const host = room.players.find((p) => p.id === room.hostId);
  const playerCount = room.players.length;

  const renderActivity = () => {
    if (!activity) {
      if (isHost) {
        return (
          <>
            <EmptyState
              icon={Dices}
              title="No game yet"
              message={playerCount < 3
                ? 'Games need at least 3 players. Share the room code to get people in.'
                : "When everyone's in, choose a game to play."}
            />
            <ScreenFooter>
              <Button size="lg" block onClick={() => navigate(`/room/${roomId}/games`)}>Choose a game</Button>
            </ScreenFooter>
          </>
        );
      }
      return (
        <EmptyState
          icon={Hourglass}
          title={`Waiting for ${host ? playerName(host) : 'the host'} to choose a game`}
          message="You'll be taken into the game as soon as it starts."
        />
      );
    }

    if (isLobby) {
      const Lobby = LOBBY_CARDS[activity.type];
      return <Lobby lobbyState={activity} room={room} userId={userId} roomId={roomId} navigate={navigate} isHost={isHost} />;
    }

    const inGame = Array.isArray(activity.players) && activity.players.some((p) => p.uid === userId);
    const ended = activity.phase === 'ended';
    const Icon = game.icon;
    const openGame = () => navigate(`/room/${roomId}/games/${game.route}`);
    return (
      <Card padding="none" className="animate-enter overflow-hidden">
        <div className="overflow-hidden border-b border-line">
          <img src={game.art} alt="" className="aspect-[16/7] w-full scale-110 object-cover" />
        </div>
        <div className="flex items-center gap-3 p-4">
          <span className={cn('inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full', ACCENT_TINT[game.accent])}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-semibold text-ink">{game.name}</h2>
            <p className="text-sm text-ink-muted">{ended ? 'Game over' : 'Game in progress'}</p>
          </div>
          <Button variant="ghost" size="sm" icon={BookOpen} onClick={() => setShowRules(true)}>Rules</Button>
        </div>
        <ScreenFooter>
          <Button size="lg" block onClick={openGame}>
            {ended ? 'See the results' : inGame ? 'Return to the game' : 'Watch the game'}
          </Button>
          {isHost && ended && (
            <Button variant="secondary" block onClick={() => endActivity(roomId).catch(() => toast.error("Couldn't close the results. Try again."))}>
              Close results and choose another game
            </Button>
          )}
        </ScreenFooter>
        <RulesSheet open={showRules} onClose={() => setShowRules(false)} rules={game.rules} />
      </Card>
    );
  };

  return (
    <div className="grid animate-enter gap-section pt-2 md:grid-cols-[20rem_minmax(0,1fr)] md:items-start md:gap-8">
      <div className="flex flex-col gap-section">
        <Card className="text-center">
          <p className="text-sm font-medium text-ink-muted">Room code</p>
          <button
            type="button"
            onClick={onCopyCode}
            className="tabular mx-auto mt-1 flex min-h-tap items-center gap-3 rounded-control px-2 text-4xl font-bold tracking-[0.12em] text-ink"
            aria-label={`Room code ${room.code.split('').join(' ')}. Tap to copy.`}
          >
            {room.code}
            <Copy className="h-5 w-5 text-ink-faint" aria-hidden="true" />
          </button>
          <p className="mt-2 text-sm text-ink-muted">
            {isHost ? 'Friends enter this code on the home screen.' : 'Share the code to bring in more friends.'}
          </p>
          <Button variant="secondary" block icon={Share2} className="mt-4" onClick={onShare}>Invite friends</Button>
        </Card>

        <section>
          <SectionHeading
            count={playerCount}
            action={(
              <Button variant="ghost" size="sm" onClick={() => setShowAllPlayers(true)}>
                {isHost ? 'Manage' : 'See all'}
              </Button>
            )}
          >
            Players
          </SectionHeading>

          {/* Phones: a compact stack. Tablets and up: the full list. */}
          <button
            type="button"
            onClick={() => setShowAllPlayers(true)}
            className="mt-1 flex min-h-tap w-full items-center gap-3 rounded-control md:hidden"
            aria-label={`Show all ${playerCount} players`}
          >
            <AvatarStack players={room.players} max={7} size="md" />
            {playerCount === 1 && <span className="text-sm text-ink-muted">Just you so far</span>}
          </button>
          <ul className="mt-1 hidden max-h-[26rem] divide-y divide-line overflow-y-auto rounded-card border border-line bg-surface md:block">
            {room.players.map((player) => (
              <li key={player.id} className="flex min-h-14 items-center gap-3 px-4 py-2">
                <Avatar player={player} size="sm" />
                <span className="min-w-0 flex-1 truncate text-base text-ink">
                  {playerName(player)}{player.id === userId ? ' (you)' : ''}
                </span>
                {player.id === room.hostId && <HostBadge />}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section aria-label="Current game" className="min-w-0">
        {renderActivity()}
      </section>

      <PlayersSheet
        open={showAllPlayers}
        room={room}
        roomId={roomId}
        isHost={isHost}
        userId={userId}
        onClose={() => setShowAllPlayers(false)}
      />
    </div>
  );
}
