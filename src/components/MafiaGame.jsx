import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { arrayUnion } from 'firebase/firestore';
import { Eye, EyeOff, Hourglass, Volume2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { endActivity, useRoom } from '../hooks/useRoom';
import { transitionActivity, updateActivity, useAutoAdvance, useCountdown } from '../lib/activity';
import { MAFIA_SOUNDS, playSound, preloadMafiaSounds } from '../mafia/sounds';
import { GAMES } from '../games/catalog';
import VotingPanel from './VotingPanel';
import GameShell, { GameLoading } from './GameShell';
import { useToast } from './Toast';
import { RoleBadge, RoleCard } from '../mafia/roles';
import { KILL_NOTE, SAVE_NOTE } from '../mafia/causes';
import {
  activeActorUids,
  advanceMafia,
  allConfirmedJump,
  allReadyToVote,
  resolveDayVote,
  selectableTargets,
  startDayVoteUpdates,
  startNightUpdates
} from '../games/mafia/logic';
import { EliminatedNotice, Facts, PhaseTitle, ReadyStatus, ResultList, SleepScreen, WinnerBanner } from './gameParts';
import {
  Avatar,
  AvatarStack,
  Badge,
  Button,
  Card,
  Countdown,
  EmptyState,
  Notice,
  ScreenFooter,
  SectionHeading,
  SelectableRow,
  cn,
  playerName
} from '../ui';

const PHASE_SOUNDS = {
  'night-eyes-closed': MAFIA_SOUNDS.NIGHT_START,
  'night-mafia': MAFIA_SOUNDS.MAFIA_WAKE,
  'night-doctor': MAFIA_SOUNDS.DOCTOR_WAKE,
  'night-detective': MAFIA_SOUNDS.DETECTIVE_WAKE,
  'day-discussion': MAFIA_SOUNDS.DAY_START
};

/** Night-time choice for the Mafia, Doctor or Detective. */
function NightAction({ title, hint, seconds, candidates, selected, locked, onSelect, onConfirm, confirmLabel, lockedLabel, renderSubtitle, children }) {
  return (
    <div className="flex flex-col gap-4">
      <Countdown seconds={seconds} size="lg" />
      <PhaseTitle title={title} hint={hint} />
      <ul className="grid gap-2 md:grid-cols-2">
        {candidates.map((player) => (
          <li key={player.uid}>
            <SelectableRow
              selected={selected === player.uid}
              disabled={locked}
              onClick={() => onSelect(player.uid)}
              leading={<Avatar player={player} size="lg" />}
              title={playerName(player)}
              subtitle={renderSubtitle?.(player)}
            />
          </li>
        ))}
      </ul>
      {children}
      <ScreenFooter>
        <Button size="lg" block onClick={onConfirm} disabled={!selected || locked}>
          {locked ? lockedLabel : confirmLabel}
        </Button>
      </ScreenFooter>
    </div>
  );
}

/** What players who are out (or watching) see while a night role acts. */
function NightWatch({ title, seconds, candidates, countFor, markLabel }) {
  return (
    <div className="flex flex-col gap-4">
      <Countdown seconds={seconds} size="lg" />
      <PhaseTitle title={title} hint="You can see this because you're not in the round." />
      <ul className="grid gap-2 md:grid-cols-2">
        {candidates.map((player) => {
          const count = countFor(player);
          return (
            <li key={player.uid} className="flex min-h-16 items-center gap-3 rounded-control border border-line bg-surface px-3 py-2">
              <Avatar player={player} size="lg" />
              <span className="min-w-0 flex-1 truncate text-base font-medium text-ink">{playerName(player)}</span>
              {count > 0 && <Badge tone="brand">{markLabel(count)}</Badge>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function MafiaGame() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, loading: authLoading } = useAuth();
  const { room, isHost, loading: roomLoading, error: roomError } = useRoom(roomId, user);

  const gameState = room?.activeActivity?.type === 'mafia' ? room.activeActivity : null;
  const phase = gameState?.phase || null;
  const phaseId = gameState?.phaseId ?? 0;

  const [showRole, setShowRole] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [busy, setBusy] = useState(false);
  const lastSoundPhaseRef = useRef(null);

  const timeLeft = useCountdown(gameState?.phaseEndsAt || null);
  const activeRules = gameState?.rules || {};

  const me = gameState?.players?.find((p) => p.uid === user?.id) || null;
  const myRole = me?.role || null;
  const confirmedVotes = gameState?.confirmedVotes || [];
  const hasConfirmed = Boolean(user?.id && confirmedVotes.includes(user.id));
  const readyClicked = Boolean(user?.id && (gameState?.readyVotes || []).includes(user.id));

  // Order of living players (by uid) decides who acts as fallback when the host is away
  const fallbackRank = useMemo(() => {
    const ids = (gameState?.players || []).map((p) => p.uid).filter((uid) => room?.playerIds?.includes(uid)).sort();
    const index = ids.indexOf(user?.id);
    return index < 0 ? 99 : index;
  }, [gameState?.players, room?.playerIds, user?.id]);

  useEffect(() => {
    document.title = 'Mafia | Its Games Night';
    preloadMafiaSounds();
  }, []);

  // ── Sounds on phase change ──────────────────────────────────────────────
  useEffect(() => {
    if (!phase || lastSoundPhaseRef.current === `${phaseId}`) return;
    lastSoundPhaseRef.current = `${phaseId}`;
    if (PHASE_SOUNDS[phase]) playSound(PHASE_SOUNDS[phase]);
  }, [phase, phaseId]);

  // Reset local selection whenever the phase changes
  useEffect(() => {
    if (!gameState) return;
    const own = gameState.nightVotes?.[user?.id] || gameState.dayVotes?.[user?.id] || null;
    setSelectedPlayer(own);
  }, [phaseId]);

  // Never leave a role showing once the role-card phase is over
  useEffect(() => {
    if (phase !== 'roles') setShowRole(false);
  }, [phase]);

  const guard = { type: 'mafia', phaseId };

  // ── Timed phases: host advances, others step in if the host is away ─────
  useAutoAdvance({
    key: gameState?.phaseEndsAt ? `${phaseId}:${gameState.phaseEndsAt}` : null,
    dueAt: gameState?.phaseEndsAt || null,
    isHost,
    fallbackRank,
    advance: () => transitionActivity(roomId, guard, (activity) => advanceMafia(activity))
  });

  // Everyone who needs to act has confirmed -> shorten timer to 5s
  const jumpDue = Boolean(gameState && allConfirmedJump(gameState));
  useAutoAdvance({
    key: jumpDue ? `jump:${phaseId}` : null,
    due: jumpDue,
    isHost,
    fallbackRank,
    advance: () => transitionActivity(roomId, guard, (activity) => allConfirmedJump(activity))
  });

  // Everyone alive is ready to vote -> start voting
  const readyDue = Boolean(gameState && allReadyToVote(gameState));
  useAutoAdvance({
    key: readyDue ? `ready:${phaseId}` : null,
    due: readyDue,
    isHost,
    fallbackRank,
    advance: () => transitionActivity(roomId, { ...guard, phase: 'day-discussion' }, (activity) => (
      allReadyToVote(activity) ? startDayVoteUpdates(activity) : null
    ))
  });

  const isCurrentUserAlive = () => Boolean(me && me.isAlive);
  const getSelectablePlayers = () => selectableTargets(gameState, user?.id);

  const withBusy = async (fn) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (error) {
      console.error(error);
      toast.error('Something went wrong. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const startNightPhase = () => withBusy(() => (
    transitionActivity(roomId, { ...guard, phase: 'roles' }, (activity) => startNightUpdates(activity))
  ));

  const handleVotePlayer = async (targetUid) => {
    if (!user || hasConfirmed || !gameState || !isCurrentUserAlive()) return;
    setSelectedPlayer(targetUid);
    if (phase === 'night-mafia' && myRole === 'mafia') {
      // Let fellow mafia see who you're leaning towards
      updateActivity(roomId, {
        [`mafiaSelections.${user.id}`]: { targetUid, confirmed: false }
      }).catch(() => {});
    }
  };

  const handleConfirmVote = () => withBusy(async () => {
    if (!user || !selectedPlayer || hasConfirmed || !gameState || !isCurrentUserAlive()) return;
    if (!activeActorUids(gameState).includes(user.id)) return;
    const updates = {
      [`nightVotes.${user.id}`]: selectedPlayer,
      confirmedVotes: arrayUnion(user.id)
    };
    if (phase === 'night-mafia') {
      updates[`mafiaSelections.${user.id}`] = { targetUid: selectedPlayer, confirmed: true };
    }
    await updateActivity(roomId, updates);
  });

  const handleSubmitDayVote = async (targetUid) => {
    if (!user || !targetUid || !gameState || phase !== 'day-vote') throw new Error('Vote unavailable');
    if (!isCurrentUserAlive()) throw new Error('Only alive players can vote');
    await updateActivity(roomId, {
      [`dayVotes.${user.id}`]: targetUid,
      confirmedVotes: arrayUnion(user.id)
    });
    setSelectedPlayer(targetUid);
  };

  const handleEndDayVoting = () => transitionActivity(
    roomId,
    { ...guard, phase: 'day-vote' },
    (activity) => resolveDayVote(activity)
  );

  const handleReadyToVote = () => withBusy(async () => {
    if (!gameState || !user || phase !== 'day-discussion' || readyClicked || !isCurrentUserAlive()) return;
    await updateActivity(roomId, { readyVotes: arrayUnion(user.id) });
  });

  const handleStartVotingNow = () => withBusy(() => (
    transitionActivity(roomId, { ...guard, phase: 'day-discussion' }, (activity) => startDayVoteUpdates(activity))
  ));

  const handleReturnToGamesNight = () => withBusy(async () => {
    if (isHost) await endActivity(roomId);
    navigate(`/room/${roomId}`);
  });

  const isDeadSpectator = () => Boolean(me && !me.isAlive);
  const isSpectator = () => !myRole || isDeadSpectator();

  if (authLoading || roomLoading) return <GameLoading />;
  if (!user) return <Navigate to="/onboarding" replace state={{ redirectTo: `/room/${roomId}/games/mafia` }} />;
  if (roomError || !room) return <Navigate to={`/room/${roomId}`} replace />;
  if (!gameState || phase === 'lobby') return <Navigate to={`/room/${roomId}`} replace />;

  const round = gameState.roundNumber ?? 1;
  const view = renderPhase();

  return (
    <GameShell
      roomId={roomId}
      isHost={isHost}
      game={GAMES.mafia}
      subtitle={view.subtitle}
      tone={view.tone}
      width={view.width}
      phaseKey={view.key || phase}
      onEndGame={() => endActivity(roomId)}
    >
      {view.body}
    </GameShell>
  );

  function sleepView(key, seconds = null) {
    return {
      key,
      subtitle: `Night ${round}`,
      tone: 'night',
      body: (
        <SleepScreen seconds={seconds}>
          {isDeadSpectator() && <EliminatedNotice />}
        </SleepScreen>
      )
    };
  }

  function renderPhase() {
    // Role reveal
    if (phase === 'roles') {
      if (!myRole) {
        return {
          subtitle: 'Role cards',
          body: (
            <div className="flex flex-1 flex-col justify-center">
              <EmptyState icon={Eye} title="You're watching this game" message="Players are looking at their role cards. The night starts soon." />
            </div>
          )
        };
      }
      return {
        subtitle: 'Role cards',
        body: (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 py-4">
            <PhaseTitle title="Your role card" hint="For your eyes only. Tap the card to flip it." />
            <RoleCard role={myRole} flipped={showRole} onToggle={() => setShowRole((v) => !v)} />
            <Button variant="secondary" icon={showRole ? EyeOff : Eye} onClick={() => setShowRole((v) => !v)}>
              {showRole ? 'Hide role' : 'Reveal role'}
            </Button>
            <ScreenFooter>
              {isHost ? (
                <Button size="lg" block onClick={startNightPhase} loading={busy}>Start the night</Button>
              ) : (
                <Notice icon={Hourglass}>Waiting for the host to start the night.</Notice>
              )}
            </ScreenFooter>
          </div>
        )
      };
    }

    // Night - everyone's eyes closed
    if (phase.startsWith('night-eyes-closed')) {
      const isInitialNight = phase === 'night-eyes-closed';
      const showVolumePrompt = isInitialNight && round === 1 && timeLeft !== null && timeLeft > 5;
      if (showVolumePrompt) {
        const volumeCountdown = Math.max(1, Math.min(7, timeLeft - 5));
        return {
          key: 'volume',
          subtitle: 'Night 1',
          tone: 'night',
          body: (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center">
              <Volume2 className="h-16 w-16 text-brand-300" aria-hidden="true" />
              <h2 className="text-4xl font-bold text-ink">Turn your volume up</h2>
              <p className="max-w-xs text-lg text-ink-muted">Sound cues tell each role when to wake.</p>
              <p className="tabular text-timer font-bold text-ink" aria-live="off">{volumeCountdown}</p>
            </div>
          )
        };
      }
      return sleepView('sleep', timeLeft);
    }

    // Night - Mafia turn
    if (phase === 'night-mafia') {
      const isMafia = myRole === 'mafia' && me?.isAlive;
      if (isSpectator()) {
        const mafiaVotes = gameState.nightVotes || {};
        return {
          subtitle: `Night ${round}`,
          width: 'wide',
          body: (
            <div className="flex flex-col gap-4">
              {isDeadSpectator() && <EliminatedNotice />}
              <NightWatch
                title="The Mafia are choosing"
                seconds={timeLeft}
                candidates={getSelectablePlayers()}
                countFor={(player) => Object.values(mafiaVotes).filter((v) => v === player.uid).length}
                markLabel={(count) => `${count} vote${count === 1 ? '' : 's'}`}
              />
            </div>
          )
        };
      }
      if (!isMafia) return sleepView('sleep');

      const mafiaPlayers = gameState.players.filter((player) => player.role === 'mafia');
      const sortedMafiaPlayers = [...mafiaPlayers].sort((a, b) => {
        if (a.isAlive === b.isAlive) return 0;
        return a.isAlive ? -1 : 1;
      });
      const mafiaSelections = gameState.mafiaSelections || {};
      return {
        subtitle: `Night ${round}`,
        width: 'wide',
        body: (
          <NightAction
            title="Choose who to eliminate"
            hint={mafiaPlayers.length > 1 ? 'Look up and agree with your team. Most-picked wins.' : 'Pick quietly. Everyone else has their eyes shut.'}
            seconds={timeLeft}
            candidates={getSelectablePlayers()}
            selected={selectedPlayer}
            locked={hasConfirmed}
            onSelect={handleVotePlayer}
            onConfirm={handleConfirmVote}
            confirmLabel="Confirm target"
            lockedLabel="Target locked in"
            renderSubtitle={(player) => {
              const pickers = mafiaPlayers.filter((m) => m.uid !== user.id && mafiaSelections[m.uid]?.targetUid === player.uid);
              if (pickers.length === 0) return null;
              return (
                <span className="mt-1 flex items-center gap-2">
                  <AvatarStack
                    players={pickers}
                    size="xs"
                    ringClass="ring-surface"
                    isDimmed={(m) => mafiaSelections[m.uid]?.confirmed !== true}
                  />
                  <span>{pickers.every((m) => mafiaSelections[m.uid]?.confirmed) ? 'Team pick' : 'Team is considering'}</span>
                </span>
              );
            }}
          >
            {mafiaPlayers.length > 1 && (
              <Card padding="sm">
                <h3 className="text-sm font-medium text-ink-muted">Your team</h3>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {sortedMafiaPlayers.map((mafiaPlayer) => (
                    <li key={mafiaPlayer.uid} className="flex items-center gap-2 rounded-full bg-surface-raised py-1 pl-1 pr-3">
                      <Avatar player={mafiaPlayer} size="xs" dimmed={mafiaPlayer.isAlive === false} />
                      <span className={cn('text-sm font-medium', mafiaPlayer.isAlive === false ? 'text-ink-faint line-through' : 'text-ink')}>
                        {playerName(mafiaPlayer)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </NightAction>
        )
      };
    }

    // Night - Doctor turn
    if (phase === 'night-doctor') {
      const isDoctor = myRole === 'doctor' && me?.isAlive;
      const doctorDead = !gameState.players.find((p) => p.role === 'doctor' && p.isAlive);
      if (isSpectator() && !doctorDead) {
        const doctorVote = gameState.nightVotes || {};
        return {
          subtitle: `Night ${round}`,
          width: 'wide',
          body: (
            <div className="flex flex-col gap-4">
              {isDeadSpectator() && <EliminatedNotice />}
              <NightWatch
                title="The Doctor is choosing"
                seconds={timeLeft}
                candidates={getSelectablePlayers()}
                countFor={(player) => Object.values(doctorVote).filter((v) => v === player.uid).length}
                markLabel={() => 'Protected'}
              />
            </div>
          )
        };
      }
      if (!isDoctor) return sleepView('sleep');
      return {
        subtitle: `Night ${round}`,
        width: 'wide',
        body: (
          <NightAction
            title="Choose who to protect"
            hint="If the Mafia pick them tonight, they survive."
            seconds={timeLeft}
            candidates={getSelectablePlayers()}
            selected={selectedPlayer}
            locked={hasConfirmed}
            onSelect={handleVotePlayer}
            onConfirm={handleConfirmVote}
            confirmLabel="Protect this player"
            lockedLabel="Protection locked in"
          />
        )
      };
    }

    // Night - Detective turn
    if (phase === 'night-detective') {
      const isDetective = myRole === 'detective' && me?.isAlive;
      const detectiveDead = !gameState.players.find((p) => p.role === 'detective' && p.isAlive);
      if (isSpectator() && !detectiveDead) {
        const detectiveVote = gameState.nightVotes || {};
        return {
          subtitle: `Night ${round}`,
          width: 'wide',
          body: (
            <div className="flex flex-col gap-4">
              {isDeadSpectator() && <EliminatedNotice />}
              <NightWatch
                title="The Detective is choosing"
                seconds={timeLeft}
                candidates={getSelectablePlayers()}
                countFor={(player) => Object.values(detectiveVote).filter((v) => v === player.uid).length}
                markLabel={() => 'Investigated'}
              />
            </div>
          )
        };
      }
      if (!isDetective) return sleepView('sleep');
      return {
        subtitle: `Night ${round}`,
        width: 'wide',
        body: (
          <NightAction
            title="Choose who to investigate"
            hint="You'll find out whether they are Mafia."
            seconds={timeLeft}
            candidates={getSelectablePlayers()}
            selected={selectedPlayer}
            locked={hasConfirmed}
            onSelect={handleVotePlayer}
            onConfirm={handleConfirmVote}
            confirmLabel="Investigate this player"
            lockedLabel="Investigating"
          />
        )
      };
    }

    // Detective result
    if (phase === 'night-detective-result') {
      const isDetective = myRole === 'detective' && me?.isAlive;
      if (isDetective && gameState.detectiveResult) {
        const result = gameState.detectiveResult;
        const target = gameState.players.find((p) => p.uid === result.targetUid);
        return {
          subtitle: `Night ${round}`,
          body: (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center">
              {target && <Avatar player={target} size="2xl" />}
              <p className="text-lg text-ink-muted">{result.targetName}</p>
              <h2 className={cn('text-4xl font-bold', result.isMafia ? 'text-mafia' : 'text-success')}>
                {result.isMafia ? 'is Mafia' : 'is not Mafia'}
              </h2>
              <p className="max-w-xs text-base text-ink-muted">Keep it to yourself until the day begins.</p>
            </div>
          )
        };
      }
      return sleepView('sleep');
    }

    // Day - discussion
    if (phase === 'day-discussion') {
      const spectator = isSpectator();
      const victimUid = gameState.pendingVictim;
      const saved = Boolean(gameState.lastSaved && gameState.lastSaved === victimUid);
      const victim = victimUid ? gameState.players.find((p) => p.uid === victimUid) : null;
      const savedPlayer = gameState.lastSaved ? gameState.players.find((p) => p.uid === gameState.lastSaved) : null;
      const investigatedPlayer = gameState.detectiveResult?.targetUid
        ? gameState.players.find((p) => p.uid === gameState.detectiveResult.targetUid)
        : null;
      const nightReportCause = gameState.nightReportCause || '';
      const defaultReportNote = victim
        ? (saved ? SAVE_NOTE.replace('[Name]', victim.displayName) : KILL_NOTE)
        : '';
      const nightReportNote = gameState.nightReportNote || defaultReportNote;
      const livingPlayers = gameState.players.filter((p) => p.isAlive);
      const readyVotes = gameState.readyVotes || [];
      const canReadyToVote = !spectator && isCurrentUserAlive();
      const myReadyClicked = readyClicked || readyVotes.includes(user?.id);

      return {
        subtitle: `Day ${round}`,
        width: 'wide',
        body: (
          <div className="flex flex-col gap-4">
            {isDeadSpectator() && <EliminatedNotice />}
            <div className="grid gap-4 md:grid-cols-2 md:items-start md:gap-8">
              <div className="flex flex-col gap-4">
                <Countdown seconds={timeLeft} label="Discussion ends in" />
                <Card>
                  <h2 className="text-sm font-medium text-ink-muted">Last night</h2>
                  {victim ? (
                    <>
                      <div className="mt-3 flex items-center gap-4">
                        <Avatar player={victim} size="xl" dimmed={!saved} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-2xl font-semibold text-ink">{playerName(victim)}</p>
                          <div className="mt-1">
                            <Badge tone={saved ? 'success' : 'danger'}>{saved ? 'Attacked but saved' : 'Killed'}</Badge>
                          </div>
                        </div>
                      </div>
                      <p className="mt-4 text-base text-ink-muted">
                        {!saved && nightReportCause ? `${nightReportCause}. ` : ''}{nightReportNote}
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-xl font-semibold text-ink">A quiet night. Nobody was attacked.</p>
                  )}
                  {spectator && (activeRules.doctor || activeRules.detective) && (
                    <dl className="mt-4 space-y-1 border-t border-line pt-4 text-sm">
                      {activeRules.doctor && savedPlayer && (
                        <div className="flex justify-between gap-3">
                          <dt className="text-ink-faint">Doctor protected</dt>
                          <dd className="font-medium text-ink">{playerName(savedPlayer)}</dd>
                        </div>
                      )}
                      {activeRules.detective && gameState.detectiveResult && (
                        <div className="flex justify-between gap-3">
                          <dt className="text-ink-faint">Detective checked</dt>
                          <dd className="font-medium text-ink">{investigatedPlayer ? playerName(investigatedPlayer) : gameState.detectiveResult.targetName}</dd>
                        </div>
                      )}
                    </dl>
                  )}
                </Card>
              </div>

              <div className="flex flex-col gap-4">
                <section>
                  <SectionHeading count={livingPlayers.length}>Still alive</SectionHeading>
                  <ul className="grid grid-cols-2 gap-2">
                    {livingPlayers.map((player) => (
                      <li key={player.uid} className="flex min-w-0 items-center gap-2 rounded-control border border-line bg-surface p-2">
                        <Avatar player={player} size="sm" />
                        <span className="min-w-0 truncate text-sm font-medium text-ink">{playerName(player)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
                <ReadyStatus players={livingPlayers} readyUids={readyVotes} />
              </div>
            </div>

            <ScreenFooter>
              {canReadyToVote && (
                <Button size="lg" block onClick={handleReadyToVote} disabled={myReadyClicked}>
                  {myReadyClicked ? "You're ready to vote" : 'Ready to vote'}
                </Button>
              )}
              {isHost && (
                <Button variant="secondary" block onClick={handleStartVotingNow} disabled={busy}>Start voting now</Button>
              )}
            </ScreenFooter>
          </div>
        )
      };
    }

    // Day - voting
    if (phase === 'day-vote') {
      const selectablePlayers = getSelectablePlayers().filter((player) => player.isAlive === true);
      return {
        subtitle: `Day ${round} vote`,
        width: 'wide',
        body: (
          <div className="flex flex-col gap-4">
            {isDeadSpectator() && <EliminatedNotice />}
            <Countdown seconds={timeLeft} size="lg" label="Voting ends in" />
            <PhaseTitle title="Who is Mafia?" hint="The player with the most votes is out." />
            <VotingPanel
              players={selectablePlayers}
              votes={gameState.dayVotes || {}}
              currentUid={user?.id}
              isHost={isHost}
              onVote={handleSubmitDayVote}
              onEndVoting={handleEndDayVoting}
            />
          </div>
        )
      };
    }

    // Day result - who was voted out
    if (phase === 'day-result') {
      const eliminatedPlayer = gameState.lastEliminated
        ? gameState.players.find((p) => p.uid === gameState.lastEliminated)
        : null;
      return {
        subtitle: `Day ${round} result`,
        body: (
          <div className="flex flex-1 flex-col justify-center gap-4 py-6">
            {isDeadSpectator() && gameState.lastEliminated !== user?.id && <EliminatedNotice />}
            <Card className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-base font-medium text-ink-muted">The town has voted</p>
              {eliminatedPlayer ? (
                <>
                  <Avatar player={eliminatedPlayer} size="2xl" dimmed />
                  <h2 className="text-3xl font-bold text-ink">
                    {eliminatedPlayer.uid === user?.id ? 'You were voted out' : `${playerName(eliminatedPlayer)} was voted out`}
                  </h2>
                  {gameState.dayVoteTie && <Badge>Tie broken at random</Badge>}
                </>
              ) : (
                <h2 className="text-3xl font-bold text-ink">Nobody was voted out</h2>
              )}
              {!eliminatedPlayer && <p className="text-base text-ink-muted">No votes were cast.</p>}
            </Card>
            {timeLeft !== null && (
              <p className="text-center text-lg text-ink-muted">
                Night falls in <span className="tabular font-semibold text-ink">{timeLeft}</span>
              </p>
            )}
          </div>
        )
      };
    }

    // End game
    if (phase === 'ended') {
      const townWon = gameState.winner === 'town';
      const mafiaCount = gameState.players?.filter((player) => player.role === 'mafia').length || 0;
      const totalRoundsPlayed = Number.isInteger(gameState?.roundNumber) ? gameState.roundNumber : 1;
      return {
        subtitle: 'Game over',
        width: 'wide',
        body: (
          <div className="grid gap-4 md:grid-cols-2 md:items-start md:gap-8">
            <WinnerBanner
              accent="mafia"
              title={townWon ? 'The town wins' : 'The Mafia win'}
              subtitle={townWon ? 'Every Mafia member was found and voted out.' : 'The Mafia took control of the town.'}
            >
              <Facts items={[`${mafiaCount} Mafia`, `${totalRoundsPlayed} night${totalRoundsPlayed === 1 ? '' : 's'}`]} />
            </WinnerBanner>
            <ResultList
              title="Who was who"
              players={gameState.players}
              isFaded={(player) => player.isAlive === false}
              renderMeta={(player) => (
                Number.isInteger(player.eliminatedRound)
                  ? `Out in round ${Math.min(totalRoundsPlayed, player.eliminatedRound)}`
                  : 'Survived'
              )}
              renderBadge={(player) => <RoleBadge role={player.role} />}
            />
            <ScreenFooter>
              <Button size="lg" block onClick={handleReturnToGamesNight} loading={busy}>
                {isHost ? 'End game and return to room' : 'Back to room'}
              </Button>
            </ScreenFooter>
          </div>
        )
      };
    }

    return { body: null };
  }
}
