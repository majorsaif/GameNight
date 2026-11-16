import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { arrayUnion } from 'firebase/firestore';
import { Eye, EyeOff, Hourglass, Info } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { endActivity, useRoom } from '../hooks/useRoom';
import { transitionActivity, updateActivity, useAutoAdvance, useCountdown } from '../lib/activity';
import { participantsFromRoom } from '../lib/lobby';
import { GAMES } from '../games/catalog';
import { LocationGrid } from './LocationGrid';
import VotingPanel from '../components/VotingPanel';
import GameShell, { GameLoading } from '../components/GameShell';
import { useToast } from '../components/Toast';
import {
  activeSpyfallPlayers,
  allSpyfallReady,
  canSpyGuess,
  dealSpyfall,
  declareSpyGuessUpdates,
  enterQuestioningUpdates,
  remainingSpies,
  resolveSpyGuess,
  resolveSpyfallVote,
  startQuestioningIntroUpdates,
  startSpyfallVotingUpdates
} from '../games/spyfall/logic';
import { EliminatedNotice, GuessSheet, ReadyStatus } from '../components/gameParts';
import { BoardingPass, CaseClosed, DeparturesBoard, LuggageTag, Stamp, TypeLabel } from '../components/props';
import { Avatar, Button, EmptyState, Notice, ScreenFooter, cn, playerName } from '../ui';

export default function SpyfallGame() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, loading: authLoading } = useAuth();
  const { room, isHost, loading: roomLoading, error: roomError } = useRoom(roomId, user);

  const gameState = room?.activeActivity?.type === 'spyfall' ? room.activeActivity : null;
  const phase = gameState?.phase || null;
  const phaseId = gameState?.phaseId ?? 0;
  const guard = { type: 'spyfall', phaseId };
  const [showCard, setShowCard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [crossedOut, setCrossedOut] = useState(() => new Set());

  useEffect(() => {
    document.title = 'Spyfall | Its Games Night';
  }, []);

  // New deal -> hide the boarding pass and reset notes
  useEffect(() => {
    if (phase === 'location-reveal') {
      setShowCard(false);
      setCrossedOut(new Set());
    }
  }, [phase, gameState?.location]);

  const timerDisplay = useCountdown(phase === 'questioning' ? gameState?.phaseEndsAt : null);
  const presentUids = room?.playerIds || [];
  const spyGuessing = gameState?.spyGuessing || null;
  const isGuessPaused = Boolean(spyGuessing);

  const getPlayerByUid = (uid) => gameState?.players?.find((p) => p.uid === uid);
  const getActivePlayers = () => activeSpyfallPlayers(gameState);
  const activeUids = getActivePlayers().map((p) => p.uid);

  const fallbackRank = useMemo(() => {
    const ids = activeUids.filter((uid) => presentUids.includes(uid)).sort();
    const index = ids.indexOf(user?.id);
    return index < 0 ? 99 : index;
  }, [activeUids.join(','), presentUids.join(','), user?.id]);  

  // questioning-intro (4s) -> questioning, and questioning timer -> voting.
  // While a spy is declaring a guess the clock is held.
  const timedDue = phase === 'questioning-intro' || (phase === 'questioning' && !isGuessPaused);
  useAutoAdvance({
    key: timedDue && gameState?.phaseEndsAt ? `${phaseId}:${gameState.phaseEndsAt}` : null,
    dueAt: timedDue ? gameState?.phaseEndsAt : null,
    isHost,
    fallbackRank,
    advance: () => transitionActivity(roomId, guard, (activity) => {
      if (activity.phase === 'questioning-intro') return enterQuestioningUpdates(activity);
      if (activity.phase === 'questioning' && !activity.spyGuessing) return startSpyfallVotingUpdates(activity);
      return null;
    })
  });

  // Everyone ready -> voting
  const readyDue = Boolean(phase === 'questioning' && !isGuessPaused && allSpyfallReady(gameState, presentUids));
  useAutoAdvance({
    key: readyDue ? `ready:${phaseId}` : null,
    due: readyDue,
    isHost,
    fallbackRank,
    advance: () => transitionActivity(roomId, { ...guard, phase: 'questioning' }, (activity) => (
      activity.spyGuessing ? null : startSpyfallVotingUpdates(activity)
    ))
  });

  const withBusy = async (fn) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (error) {
      console.error(error);
      toast.error(error?.message && !error.code ? error.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  // ── Actions ─────────────────────────────────────────────────────────────
  const handleStartQuestioning = () => withBusy(() => (
    transitionActivity(roomId, { ...guard, phase: 'location-reveal' }, (activity) => startQuestioningIntroUpdates(activity))
  ));

  const handleStartVoting = () => withBusy(() => (
    transitionActivity(roomId, { ...guard, phase: 'questioning' }, (activity) => (
      activity.spyGuessing ? null : startSpyfallVotingUpdates(activity)
    ))
  ));

  const handleEndVoting = () => transitionActivity(roomId, { ...guard, phase: 'voting' }, (activity) => (
    activity.spyGuessing ? null : resolveSpyfallVote(activity)
  ));

  const handleReadyToGuess = () => withBusy(() => (
    transitionActivity(roomId, { ...guard, phase: ['questioning', 'voting'] }, (activity) => declareSpyGuessUpdates(activity, user.id))
  ));

  const handleSpyGuessResult = (correct) => withBusy(() => (
    transitionActivity(roomId, guard, (activity) => resolveSpyGuess(activity, correct))
  ));

  const handleReadyToVote = () => withBusy(async () => {
    if (!user || readyClicked || !amActivePlayer) return;
    await updateActivity(roomId, { readyVotes: arrayUnion(user.id) });
  });

  const handleConfirmVote = async (targetUid) => {
    if (!user || !targetUid) throw new Error('Vote unavailable');
    if (isGuessPaused) throw new Error('Voting is paused');
    if (targetUid === user.id) throw new Error('You cannot vote for yourself');
    if (!activeUids.includes(user.id)) throw new Error('Vote unavailable');
    await updateActivity(roomId, { [`votes.${user.id}`]: targetUid });
  };

  const handlePlayAgain = () => withBusy(async () => {
    const started = await transitionActivity(roomId, { ...guard, phase: 'ended' }, (activity, latestRoom) => {
      const players = participantsFromRoom(latestRoom);
      if (players.length < 3) throw new Error('Need at least 3 players in the room to play again.');
      return dealSpyfall(players, activity.rules || {}, activity);
    });
    if (!started) toast.info('The game was already restarted.');
  });

  const handleEndGame = () => withBusy(async () => {
    await endActivity(roomId);
    navigate(`/room/${roomId}`);
  });

  const toggleCrossOut = (loc) => {
    setCrossedOut((prev) => {
      const next = new Set(prev);
      if (next.has(loc)) next.delete(loc);
      else next.add(loc);
      return next;
    });
  };

  if (authLoading || roomLoading) return <GameLoading />;
  if (!user) return <Navigate to="/onboarding" replace state={{ redirectTo: `/room/${roomId}` }} />;
  if (roomError || !room || !gameState || phase === 'lobby') return <Navigate to={`/room/${roomId}`} replace />;

  const myPlayer = getPlayerByUid(user?.id);
  const isParticipant = Boolean(myPlayer);
  const amSpy = (gameState.spyIds || []).includes(user?.id);
  const amActivePlayer = isParticipant && activeUids.includes(user?.id);
  const readyClicked = (gameState.readyVotes || []).includes(user?.id);
  const amActiveSpy = amSpy && remainingSpies(gameState).includes(user?.id);
  const amEliminatedSpy = amSpy && !amActiveSpy;
  const canGuessNow = canSpyGuess(gameState, user?.id);
  const guessingPlayer = spyGuessing ? getPlayerByUid(spyGuessing.spyUid) : null;

  const lastResult = gameState.lastResult;
  const lastResultPlayer = lastResult?.uid ? getPlayerByUid(lastResult.uid) : null;
  const lastResultNotice = () => {
    if (!lastResult || phase !== 'questioning') return null;
    const name = lastResultPlayer?.displayName || 'A spy';
    if (lastResult.type === 'spy-caught') return <Notice icon={Info} tone="success">{name} was caught. Another spy is still among you.</Notice>;
    if (lastResult.type === 'wrong-guess') return <Notice icon={Info} tone="success">{name} guessed the wrong location and is out. Another spy remains.</Notice>;
    return null;
  };

  const guessButton = amActiveSpy ? (
    <Button variant="danger-quiet" block onClick={handleReadyToGuess} disabled={!canGuessNow || busy}>
      Guess the location out loud
    </Button>
  ) : null;

  const view = renderPhase();

  return (
    <GameShell
      roomId={roomId}
      isHost={isHost}
      game={GAMES.spyfall}
      subtitle={view.subtitle}
      width={view.width}
      phaseKey={view.key || phase}
      onEndGame={() => endActivity(roomId)}
    >
      {view.body}
      <GuessSheet
        open={Boolean(spyGuessing) && phase !== 'ended'}
        guesser={guessingPlayer}
        what="the location"
        isHost={isHost}
        busy={busy}
        onResolve={handleSpyGuessResult}
      />
    </GameShell>
  );

  function renderPhase() {
    // ── Location reveal ─────────────────────────────────────────────────────
    if (phase === 'location-reveal') {
      if (!isParticipant) {
        return {
          subtitle: 'Secret location',
          body: (
            <div className="flex flex-1 flex-col justify-center">
              <EmptyState icon={Eye} title="You're watching this round" message="Players are checking the location." />
            </div>
          )
        };
      }
      return {
        subtitle: 'Secret location',
        body: (
          <div className="flex flex-1 flex-col justify-center gap-4 py-4">
            <BoardingPass
              sealed={!showCard}
              destination={gameState.location || 'Unknown'}
              isSpy={amSpy}
              passenger={playerName(myPlayer)}
              role={myPlayer?.role}
            />
            <div className="flex justify-center">
              <Button variant={showCard ? 'secondary' : 'primary'} icon={showCard ? EyeOff : Eye} onClick={() => setShowCard((prev) => !prev)}>
                {showCard ? 'Hide pass' : 'Reveal pass'}
              </Button>
            </div>
            {amSpy && showCard && (
              <p className="text-center text-base text-ink-muted">Work out where everyone is without giving yourself away.</p>
            )}
            <ScreenFooter>
              {isHost ? (
                <Button size="lg" block onClick={handleStartQuestioning} loading={busy}>Start questioning</Button>
              ) : (
                <Notice icon={Hourglass}>Waiting for the host to start questioning.</Notice>
              )}
            </ScreenFooter>
          </div>
        )
      };
    }

    // ── Questioning intro (4 seconds) ───────────────────────────────────────
    if (phase === 'questioning-intro') {
      const firstPlayer = getPlayerByUid(gameState.currentAskerId);
      return {
        subtitle: 'Questioning',
        body: (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
            <TypeLabel className="text-spyfall">Now boarding: questioning begins</TypeLabel>
            <p className="text-lg font-medium text-ink-muted">First question from</p>
            {firstPlayer && <Avatar player={firstPlayer} size="2xl" />}
            <h2 className="text-4xl font-bold text-ink">{firstPlayer ? playerName(firstPlayer) : 'A random player'}</h2>
            <p className="max-w-xs text-lg text-ink-muted">Ask anyone a question about the location. Whoever answers asks next.</p>
          </div>
        )
      };
    }

    // ── Questioning ─────────────────────────────────────────────────────────
    if (phase === 'questioning') {
      const readyVotes = (gameState.readyVotes || []).filter((uid) => activeUids.includes(uid));
      return {
        subtitle: 'Questioning',
        width: 'wide',
        body: (
          <div className="flex flex-col gap-4">
            {lastResultNotice()}
            {amEliminatedSpy && <EliminatedNotice />}
            {!isParticipant && <Notice icon={Eye}>You&apos;re watching this round.</Notice>}
            <div className="grid gap-4 md:grid-cols-[20rem_minmax(0,1fr)] md:items-start md:gap-8">
              <div className="flex flex-col gap-4">
                <DeparturesBoard seconds={timerDisplay} paused={isGuessPaused} />
                <ReadyStatus players={getActivePlayers()} readyUids={readyVotes} />
              </div>
              <LocationGrid
                crossedOut={crossedOut}
                onToggle={toggleCrossOut}
                ownLocation={!amSpy && isParticipant ? gameState.location : null}
              />
            </div>
            <ScreenFooter>
              {amActivePlayer && (
                <Button size="lg" block onClick={handleReadyToVote} disabled={readyClicked || busy || isGuessPaused}>
                  {readyClicked ? "You're ready to vote" : 'Ready to vote'}
                </Button>
              )}
              {isHost && (
                <Button variant="secondary" block onClick={handleStartVoting} disabled={busy || isGuessPaused}>Start voting now</Button>
              )}
              {guessButton}
            </ScreenFooter>
          </div>
        )
      };
    }

    // ── Voting ──────────────────────────────────────────────────────────────
    if (phase === 'voting') {
      const votes = gameState.votes || {};
      return {
        subtitle: 'Vote',
        width: 'wide',
        body: (
          <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
            {amEliminatedSpy && <EliminatedNotice />}
            <VotingPanel
              players={getActivePlayers()}
              requiredVoterUids={activeUids.filter((uid) => presentUids.includes(uid))}
              votes={Object.fromEntries(Object.entries(votes).filter(([voter]) => activeUids.includes(voter)))}
              currentUid={user?.id}
              isHost={isHost}
              fallbackRank={fallbackRank}
              onVote={handleConfirmVote}
              onEndVoting={handleEndVoting}
              paused={isGuessPaused}
              extraActions={guessButton}
              subtitle="Who is the spy? Ties are broken at random."
            />
          </div>
        )
      };
    }

    // ── Ended ───────────────────────────────────────────────────────────────
    if (phase === 'ended') {
      const townWon = gameState.winner === 'town';
      const spyIds = gameState.spyIds || [];
      const name = lastResultPlayer?.displayName || 'A player';
      const reasons = {
        'innocent-voted-out': `${name} was voted out but wasn't a spy.`,
        'spy-caught': `${name} was voted out and was a spy.`,
        'correct-guess': `${name} worked out the location.`,
        'wrong-guess': `${name} guessed the wrong location.`
      };
      const reason = reasons[lastResult?.type] || null;

      return {
        subtitle: 'Game over',
        width: 'wide',
        body: (
          <div className="grid gap-6 md:grid-cols-2 md:items-start md:gap-8">
            <div className="flex flex-col gap-5">
              <header>
                <TypeLabel className="text-ink-muted">Operation Spyfall</TypeLabel>
                <h2 className={cn('mt-2 font-serif text-4xl font-black uppercase', townWon ? 'text-spyfall' : 'text-danger')}>
                  {townWon ? 'Spy identified' : 'Operative undetected'}
                </h2>
                <p className="mt-1 font-mono text-sm font-bold uppercase tracking-[0.12em] text-ink-muted">
                  {townWon ? 'Mission complete' : (spyIds.length > 1 ? 'The spies evaded capture' : 'The spy evaded capture')}
                </p>
                {reason && (
                  <p className="mt-3 text-base text-ink">{reason}{lastResult?.tieBroken ? ' The tie was broken at random.' : ''}</p>
                )}
              </header>
              <LuggageTag destination={gameState.location || 'Unknown'} />
            </div>

            <CaseClosed
              players={gameState.players || []}
              stampTone={townWon ? 'blue' : 'red'}
              renderMeta={(player) => (spyIds.includes(player.uid) ? 'Did not know the location' : (player.role || 'Knew the location'))}
              renderStamp={(player) => (spyIds.includes(player.uid) ? <Stamp tone="red" tilt="right">Spy</Stamp> : null)}
            />

            <ScreenFooter>
              {isHost ? (
                <>
                  <Button size="lg" block onClick={handlePlayAgain} disabled={busy}>Play again</Button>
                  <Button variant="secondary" block onClick={handleEndGame} disabled={busy}>End game and return to room</Button>
                </>
              ) : (
                <>
                  <Notice icon={Hourglass}>Waiting for the host to play again or end the game.</Notice>
                  <Button variant="secondary" block onClick={() => navigate(`/room/${roomId}`)}>Back to room</Button>
                </>
              )}
            </ScreenFooter>
          </div>
        )
      };
    }

    return { body: null };
  }
}
