import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { arrayUnion } from 'firebase/firestore';
import { Eye, Hourglass, Info, RotateCw, RotateCcw } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { endActivity, useRoom } from '../hooks/useRoom';
import { transitionActivity, updateActivity, useAutoAdvance } from '../lib/activity';
import { participantsFromRoom } from '../lib/lobby';
import { GAMES } from '../games/catalog';
import VotingPanel from '../components/VotingPanel';
import GameShell, { GameLoading } from '../components/GameShell';
import { useToast } from '../components/Toast';
import {
  activePlayersOf,
  allActiveReady,
  canDeclareGuess as canDeclareGuessFor,
  dealWordImposter,
  resolveImposterGuess,
  resolveWordImposterVote,
  startDescribingUpdates,
  startVotingUpdates
} from '../games/wordImposter/logic';
import { EliminatedNotice, Facts, GuessSheet, PhaseTitle, ReadyStatus, ResultList, SecretCard, WinnerBanner } from '../components/gameParts';
import { Avatar, Badge, Button, Card, EmptyState, Notice, ScreenFooter, playerName } from '../ui';

const DESCRIBE_COUNTDOWN_MS = 5000;

export default function WordImposterGame() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, loading: authLoading } = useAuth();
  const { room, isHost, loading: roomLoading, error: roomError } = useRoom(roomId, user);

  const gameState = room?.activeActivity?.type === 'wordImposter' ? room.activeActivity : null;
  const phaseId = gameState?.phaseId ?? 0;
  const [showWord, setShowWord] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    document.title = 'Word Imposter | Its Games Night';
  }, []);

  useEffect(() => {
    setShowWord(false);
  }, [phaseId === 1, gameState?.word]);

  // 5-second "get ready" countdown at the start of each describing round
  const describeStartedAt = gameState?.phase === 'describing' ? gameState.phaseStartedAt : null;
  useEffect(() => {
    if (!describeStartedAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [describeStartedAt]);
  const countdown = describeStartedAt
    ? Math.max(0, Math.ceil((DESCRIBE_COUNTDOWN_MS - (now - describeStartedAt)) / 1000))
    : null;

  const presentUids = room?.playerIds || [];
  const isImposter = Boolean(gameState?.imposterIds?.includes(user?.id));
  const guessSystemEnabled = Boolean(gameState?.rules?.imposterNoWord);
  const showCategory = gameState?.rules?.showCategory !== false;
  const eliminatedPlayers = gameState?.eliminatedPlayers || [];
  const activePlayers = activePlayersOf(gameState);
  const activePlayerUids = activePlayers.map((p) => p.uid);
  const declaringGuess = guessSystemEnabled ? (gameState?.declaringGuess || null) : null;
  const isGuessPaused = Boolean(declaringGuess);
  const isCurrentPlayerEliminated = Boolean(user?.id && eliminatedPlayers.includes(user.id));
  const isActiveImposter = Boolean(isImposter && !isCurrentPlayerEliminated);
  const canDeclareGuess = Boolean(gameState && user?.id && canDeclareGuessFor(gameState, user.id));
  const readyClicked = Boolean(user?.id && (gameState?.readyVotes || []).includes(user.id));
  const guard = { type: 'wordImposter', phaseId };

  const fallbackRank = useMemo(() => {
    const ids = activePlayerUids.filter((uid) => presentUids.includes(uid)).sort();
    const index = ids.indexOf(user?.id);
    return index < 0 ? 99 : index;
  }, [activePlayerUids.join(','), presentUids.join(','), user?.id]);

  // Everyone ready -> voting
  const readyDue = Boolean(gameState?.phase === 'describing' && !isGuessPaused && allActiveReady(gameState, presentUids));
  useAutoAdvance({
    key: readyDue ? `ready:${phaseId}` : null,
    due: readyDue,
    isHost,
    fallbackRank,
    advance: () => transitionActivity(roomId, { ...guard, phase: 'describing' }, (activity) => (
      activity.declaringGuess ? null : startVotingUpdates(activity)
    ))
  });

  const getPlayerByUid = (uid) => gameState?.players?.find((p) => p.uid === uid);

  const getWinningAgentLabel = (state) => {
    if (!state) return null;
    if (state.rules?.imposterNoWord && state.winningAgent) return state.winningAgent;
    const eliminated = state.eliminatedPlayers || [];
    const imposterIds = state.imposterIds || [];
    const winners = state.winner === 'imposter' ? imposterIds.filter((uid) => !eliminated.includes(uid)) : imposterIds;
    const names = (winners.length ? winners : imposterIds).map((uid) => getPlayerByUid(uid)?.displayName || 'Unknown');
    return names.length ? names.join(', ') : null;
  };

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

  // === ACTIONS ===
  const handleStartDescribing = () => withBusy(() => (
    transitionActivity(roomId, { ...guard, phase: 'word-reveal' }, (activity) => startDescribingUpdates(activity))
  ));

  const handleReadyToVote = () => withBusy(async () => {
    if (!user || readyClicked || isCurrentPlayerEliminated || isGuessPaused) return;
    if (!activePlayerUids.includes(user.id)) return;
    await updateActivity(roomId, { readyVotes: arrayUnion(user.id) });
  });

  const handleStartVotingNow = () => withBusy(() => (
    transitionActivity(roomId, { ...guard, phase: 'describing' }, (activity) => startVotingUpdates(activity))
  ));

  const handleConfirmVote = async (targetUid) => {
    if (!user || !targetUid) throw new Error('Vote unavailable');
    if (isCurrentPlayerEliminated) throw new Error('Eliminated players cannot vote');
    if (isGuessPaused) throw new Error('Voting is paused');
    if (!activePlayerUids.includes(user.id) || !activePlayerUids.includes(targetUid)) throw new Error('Vote unavailable');
    if (targetUid === user.id) throw new Error('You cannot vote for yourself');
    await updateActivity(roomId, { [`votes.${user.id}`]: targetUid });
  };

  const handleEndVoting = () => transitionActivity(roomId, { ...guard, phase: 'voting' }, (activity) => (
    activity.declaringGuess ? null : resolveWordImposterVote(activity)
  ));

  const handleDeclareGuess = () => withBusy(() => (
    transitionActivity(roomId, { ...guard, phase: ['describing', 'voting'] }, (activity) => {
      if (!canDeclareGuessFor(activity, user.id)) return null;
      return {
        declaringGuess: {
          uid: user.id,
          displayName: getPlayerByUid(user.id)?.displayName || user.displayName || 'An imposter'
        },
        pausedFromPhase: activity.phase
      };
    })
  ));

  const handleResolveDeclareGuess = (correct) => withBusy(() => (
    transitionActivity(roomId, guard, (activity) => resolveImposterGuess(activity, correct))
  ));

  const handlePlayAgain = () => withBusy(async () => {
    const started = await transitionActivity(roomId, { ...guard, phase: 'ended' }, (activity, latestRoom) => {
      // Same group minus anyone who has left the room, plus anyone new
      const players = participantsFromRoom(latestRoom);
      if (players.length < 3) throw new Error('Need at least 3 players in the room to play again.');
      return dealWordImposter(players, activity.rules || {}, activity);
    });
    if (!started) toast.info('The game was already restarted.');
  });

  const handleEndGame = () => withBusy(async () => {
    await endActivity(roomId);
    navigate(`/room/${roomId}`);
  });

  if (authLoading || roomLoading) return <GameLoading />;
  if (!user) return <Navigate to="/onboarding" replace state={{ redirectTo: `/room/${roomId}` }} />;
  if (roomError || !room || !gameState || gameState.phase === 'lobby') return <Navigate to={`/room/${roomId}`} replace />;

  const phase = gameState.phase;
  const round = gameState.roundNumber || 1;
  const isParticipant = Boolean(getPlayerByUid(user?.id));
  const lastResult = gameState.lastResult;
  const lastResultPlayer = lastResult?.uid ? getPlayerByUid(lastResult.uid) : null;

  const lastResultNotice = () => {
    if (!lastResult || phase !== 'describing') return null;
    const name = lastResultPlayer?.displayName;
    if (lastResult.type === 'tie') return <Notice icon={Info}>The vote was tied, so nobody is out. New round.</Notice>;
    if (lastResult.type === 'no-votes') return <Notice icon={Info}>Nobody voted, so nobody is out. New round.</Notice>;
    if (lastResult.type === 'eliminated') {
      return (
        <Notice icon={Info} tone={lastResult.wasImposter ? 'success' : 'warning'}>
          {name || 'A player'} was voted out. They {lastResult.wasImposter ? 'were' : 'were not'} an imposter.
        </Notice>
      );
    }
    if (lastResult.type === 'wrong-guess') {
      return <Notice icon={Info} tone="success">{name || 'An imposter'} guessed wrong and is out.</Notice>;
    }
    return null;
  };

  const guessButton = guessSystemEnabled && isActiveImposter ? (
    <Button variant="danger-quiet" block onClick={handleDeclareGuess} disabled={!canDeclareGuess || busy}>
      Guess the word out loud
    </Button>
  ) : null;

  const view = renderPhase();

  return (
    <GameShell
      roomId={roomId}
      isHost={isHost}
      game={GAMES.wordImposter}
      subtitle={view.subtitle}
      width={view.width}
      phaseKey={view.key || phase}
      onEndGame={() => endActivity(roomId)}
    >
      {view.body}
      <GuessSheet
        open={guessSystemEnabled && isGuessPaused && phase !== 'ended'}
        guesser={declaringGuess ? (getPlayerByUid(declaringGuess.uid) || { displayName: declaringGuess.displayName }) : null}
        what="the word"
        isHost={isHost}
        busy={busy}
        onResolve={handleResolveDeclareGuess}
      />
    </GameShell>
  );

  function renderPhase() {
    // === WORD REVEAL ===
    if (phase === 'word-reveal') {
      if (!isParticipant) {
        return {
          subtitle: 'Secret words',
          body: (
            <div className="flex flex-1 flex-col justify-center">
              <EmptyState icon={Eye} title="You're watching this round" message="Players are looking at their secret words." />
            </div>
          )
        };
      }
      const noWordImposter = isImposter && gameState.rules?.imposterNoWord;
      const myWord = isImposter ? (gameState.imposterWordsByUid?.[user?.id] || gameState.imposterWord) : gameState.word;
      return {
        subtitle: 'Secret words',
        body: (
          <div className="flex flex-1 flex-col justify-center gap-4 py-4">
            <SecretCard
              accent="imposter"
              revealed={showWord}
              onToggle={() => setShowWord((v) => !v)}
              hiddenTitle="Your word is hidden"
              label={noWordImposter ? 'You are the' : 'Your word'}
              value={noWordImposter ? 'Imposter' : myWord}
              valueTone={noWordImposter ? 'danger' : 'accent'}
              details={[
                showCategory ? `Category: ${gameState.category}` : null,
                noWordImposter ? 'Blend in, or work out the word.' : null
              ]}
            />
            <ScreenFooter>
              {isHost ? (
                <Button size="lg" block onClick={handleStartDescribing} loading={busy}>Start the clues</Button>
              ) : (
                <Notice icon={Hourglass}>Waiting for the host to start the clues.</Notice>
              )}
            </ScreenFooter>
          </div>
        )
      };
    }

    // === DESCRIBING ===
    if (phase === 'describing') {
      const startingPlayer = getPlayerByUid(gameState.startingPlayerId);
      const clockwise = gameState.direction === 'clockwise';
      const showCountdown = countdown !== null && countdown > 0;
      const readyVotes = (gameState.readyVotes || []).filter((uid) => activePlayerUids.includes(uid));
      const canReady = isParticipant && !isCurrentPlayerEliminated && activePlayerUids.includes(user?.id);

      return {
        subtitle: `Round ${round}`,
        body: (
          <div className="flex flex-1 flex-col justify-center gap-4 py-4">
            {lastResultNotice()}
            {isCurrentPlayerEliminated && <EliminatedNotice />}
            {!isParticipant && <Notice icon={Eye}>You&apos;re watching this round.</Notice>}

            <Card className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-base font-medium text-ink-muted">First clue from</p>
              {startingPlayer && <Avatar player={startingPlayer} size="xl" />}
              <h2 className="text-3xl font-bold text-ink">{startingPlayer ? playerName(startingPlayer) : 'Unknown'}</h2>
              <Badge tone="imposter" icon={clockwise ? RotateCw : RotateCcw}>
                Then {clockwise ? 'clockwise' : 'anticlockwise'}
              </Badge>
              {showCountdown ? (
                <p className="tabular text-timer font-bold text-ink" aria-live="off">{countdown}</p>
              ) : (
                <p className="text-lg text-ink-muted">One clue each. Vote when you&apos;ve heard enough.</p>
              )}
            </Card>

            <ReadyStatus players={activePlayers} readyUids={readyVotes} />

            <ScreenFooter>
              {canReady && (
                <Button size="lg" block onClick={handleReadyToVote} disabled={readyClicked || isGuessPaused}>
                  {readyClicked ? "You're ready to vote" : 'Ready to vote'}
                </Button>
              )}
              {isHost && (
                <Button variant="secondary" block onClick={handleStartVotingNow} disabled={isGuessPaused || busy}>Start voting now</Button>
              )}
              {guessButton}
            </ScreenFooter>
          </div>
        )
      };
    }

    // === VOTING ===
    if (phase === 'voting') {
      const votes = Object.entries(gameState.votes || {}).reduce((acc, [voterUid, targetUid]) => {
        if (activePlayerUids.includes(voterUid) && activePlayerUids.includes(targetUid)) {
          acc[voterUid] = targetUid;
        }
        return acc;
      }, {});

      return {
        subtitle: `Round ${round} vote`,
        width: 'wide',
        body: (
          <div className="flex flex-col gap-4">
            {isCurrentPlayerEliminated && <EliminatedNotice />}
            <PhaseTitle title="Who is the imposter?" hint="A tied vote means nobody goes out." />
            <VotingPanel
              players={activePlayers}
              requiredVoterUids={activePlayerUids.filter((uid) => presentUids.includes(uid))}
              votes={votes}
              currentUid={user?.id}
              isHost={isHost}
              fallbackRank={fallbackRank}
              onVote={handleConfirmVote}
              onEndVoting={handleEndVoting}
              paused={isGuessPaused}
              extraActions={guessButton}
            />
          </div>
        )
      };
    }

    // === ENDED ===
    if (phase === 'ended') {
      const imposterWon = gameState.winner === 'imposter';
      const isImposterNoWordMode = Boolean(gameState.rules?.imposterNoWord);
      const agentLabel = getWinningAgentLabel(gameState);
      const imposterWordsByUid = gameState.imposterWordsByUid || {};
      const imposterWordsSummary = (() => {
        const wordsFromMap = Array.from(new Set(Object.values(imposterWordsByUid).filter(Boolean)));
        if (wordsFromMap.length > 0) return wordsFromMap.join(', ');
        return gameState.imposterWord ? gameState.imposterWord : null;
      })();
      const imposterCount = (gameState.imposterIds || []).length;
      const winnerName = imposterWon ? (isImposterNoWordMode ? gameState.winningAgent : agentLabel) : null;

      return {
        subtitle: 'Game over',
        width: 'wide',
        body: (
          <div className="grid gap-4 md:grid-cols-2 md:items-start md:gap-8">
            <div className="flex flex-col gap-4">
              <WinnerBanner
                accent="imposter"
                title={imposterWon ? (imposterCount > 1 ? 'The imposters win' : 'The imposter wins') : 'The town wins'}
                subtitle={imposterWon
                  ? (winnerName ? `${winnerName} fooled the table.` : 'The table was fooled.')
                  : (imposterCount > 1 ? 'Every imposter was caught.' : 'The imposter was caught.')}
              >
                <Facts items={[`${round} round${round === 1 ? '' : 's'}`]} />
              </WinnerBanner>
              <div className={isImposterNoWordMode || !imposterWordsSummary ? '' : 'grid grid-cols-2 gap-3'}>
                <Card padding="sm" className="text-center">
                  <p className="text-sm font-medium text-ink-muted">The word</p>
                  <p className="mt-1 break-words text-2xl font-bold text-imposter">{gameState.word}</p>
                </Card>
                {!isImposterNoWordMode && imposterWordsSummary && (
                  <Card padding="sm" className="text-center">
                    <p className="text-sm font-medium text-ink-muted">Imposter&apos;s word</p>
                    <p className="mt-1 break-words text-2xl font-bold text-danger">{imposterWordsSummary}</p>
                  </Card>
                )}
              </div>
            </div>

            <ResultList
              title="Who was who"
              players={gameState.players}
              isFaded={(player) => eliminatedPlayers.includes(player.uid)}
              renderMeta={(player) => {
                const eliminatedRound = gameState.eliminatedRounds?.[player.uid];
                return Number.isInteger(eliminatedRound) ? `Out in round ${Math.min(round, eliminatedRound)}` : 'Survived';
              }}
              renderBadge={(player) => (
                gameState.imposterIds?.includes(player.uid) ? <Badge tone="danger">Imposter</Badge> : <Badge>Town</Badge>
              )}
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
