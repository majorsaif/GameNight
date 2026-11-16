import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Megaphone } from 'lucide-react';
import { KILL_CAUSES, SAVE_CAUSES, KILL_NOTE, SAVE_NOTE } from '../../mafia/causes';
import { RoleCard, RoleStamp } from '../../mafia/roles';
import { Ballot, BallotRow, CaseClosed, GazetteMasthead, IncidentReport, PaperRule, TypeLabel } from '../../components/props';
import { GAMES } from '../../games/catalog';
import { PhaseTitle, SleepScreen } from '../../components/gameParts';
import {
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  Notice,
  Screen,
  ScreenFooter,
  ScreenHeader,
  SelectableRow,
  StatusScreen,
  cn,
  playerName
} from '../../ui';

const game = GAMES.mafia;

function shuffleList(players) {
  const copy = [...players];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickRandom(items) {
  if (!Array.isArray(items) || items.length === 0) return '';
  return items[Math.floor(Math.random() * items.length)];
}

function assignRoles(players = [], rules = {}) {
  const activePlayers = Array.isArray(players) ? players.filter(Boolean) : [];
  const shuffledPlayers = shuffleList(activePlayers);
  const roles = {};
  const remainingPlayers = [...shuffledPlayers];

  const mafiaCount = Math.min(Math.max(0, Number(rules?.mafiaCount) || 0), remainingPlayers.length);
  const doctorEnabled = Boolean(rules?.doctorEnabled);
  const detectiveEnabled = Boolean(rules?.detectiveEnabled);

  for (let i = 0; i < mafiaCount; i += 1) {
    const player = remainingPlayers.shift();
    if (player) {
      roles[player.id] = 'mafia';
    }
  }

  if (doctorEnabled) {
    const doctorPlayer = remainingPlayers.shift();
    if (doctorPlayer) {
      roles[doctorPlayer.id] = 'doctor';
    }
  }

  if (detectiveEnabled) {
    const detectivePlayer = remainingPlayers.shift();
    if (detectivePlayer) {
      roles[detectivePlayer.id] = 'detective';
    }
  }

  remainingPlayers.forEach((player) => {
    roles[player.id] = 'civilian';
  });

  return roles;
}

function formatCommaNames(players) {
  if (!players.length) return 'None';
  return players.map((player) => player.displayName).join(', ');
}

function buildNightReport({ nightResults, players }) {
  const killedPlayer = nightResults.killed ? players.find((player) => player.id === nightResults.killed) : null;
  const isSaved = Boolean(killedPlayer && nightResults.saved && nightResults.saved === nightResults.killed);

  if (killedPlayer && isSaved) {
    return {
      type: 'save',
      victimId: killedPlayer.id,
      playerName: killedPlayer.displayName,
      cause: pickRandom(SAVE_CAUSES),
      note: SAVE_NOTE.replace('[Name]', killedPlayer.displayName)
    };
  }

  if (killedPlayer) {
    return {
      type: 'kill',
      victimId: killedPlayer.id,
      playerName: killedPlayer.displayName,
      cause: pickRandom(KILL_CAUSES),
      note: KILL_NOTE
    };
  }

  return {
    type: 'quiet',
    victimId: null,
    playerName: '',
    cause: '',
    note: 'The night passed quietly'
  };
}

function getAlivePlayers(players, eliminatedPlayers) {
  return players.filter((player) => !eliminatedPlayers.includes(player.id));
}

function getLivingByRole(players, roles, eliminatedPlayers, role) {
  return getAlivePlayers(players, eliminatedPlayers).filter((player) => roles[player.id] === role);
}

function getLivingTownCount(players, roles, eliminatedPlayers) {
  return getAlivePlayers(players, eliminatedPlayers).filter((player) => roles[player.id] !== 'mafia').length;
}

function getLivingMafiaCount(players, roles, eliminatedPlayers) {
  return getAlivePlayers(players, eliminatedPlayers).filter((player) => roles[player.id] === 'mafia').length;
}

function checkWinner(players, roles, eliminatedPlayers) {
  const livingMafia = getLivingMafiaCount(players, roles, eliminatedPlayers);
  const livingTown = getLivingTownCount(players, roles, eliminatedPlayers);

  if (livingMafia === 0) return 'town';
  if (livingMafia >= livingTown && livingMafia > 0) return 'mafia';
  return null;
}

export default function OnePhoneMafia({ players = [], narrator = null, rules = {} }) {
  const navigate = useNavigate();
  const [roles, setRoles] = useState(() => assignRoles(players, rules));
  const [phase, setPhase] = useState('role-reveal');
  const [eliminatedPlayers, setEliminatedPlayers] = useState([]);
  const [nightResults, setNightResults] = useState({
    killed: null,
    saved: null,
    investigated: null
  });
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [revealedPlayers, setRevealedPlayers] = useState([]);
  const [winner, setWinner] = useState(null);
  const [nightCount, setNightCount] = useState(1);
  const [roleRevealTargetId, setRoleRevealTargetId] = useState(null);
  const [roleRevealStep, setRoleRevealStep] = useState('list');
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  const [eyesClosedNextPhase, setEyesClosedNextPhase] = useState('night-mafia');
  const [showDetectiveResult, setShowDetectiveResult] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [nightReport, setNightReport] = useState({
    type: 'quiet',
    victimId: null,
    playerName: '',
    cause: '',
    note: 'The night passed quietly'
  });

  const activePlayers = Array.isArray(players) ? players : [];
  const narratorName = narrator?.displayName || 'Narrator';
  const alivePlayers = getAlivePlayers(activePlayers, eliminatedPlayers);
  const allPlayersRevealed = activePlayers.length > 0 && revealedPlayers.length === activePlayers.length;
  const selectedRevealPlayer = roleRevealTargetId ? activePlayers.find((player) => player.id === roleRevealTargetId) : null;
  const selectedRole = selectedRevealPlayer ? roles[selectedRevealPlayer.id] : null;
  const mafiaLiving = getLivingByRole(activePlayers, roles, eliminatedPlayers, 'mafia');
  const doctorLiving = getLivingByRole(activePlayers, roles, eliminatedPlayers, 'doctor');
  const detectiveLiving = getLivingByRole(activePlayers, roles, eliminatedPlayers, 'detective');
  const isDoctorEnabled = Boolean(rules?.doctorEnabled) && doctorLiving.length > 0;
  const isDetectiveEnabled = Boolean(rules?.detectiveEnabled) && detectiveLiving.length > 0;

  const resetGame = () => {
    setRoles(assignRoles(activePlayers, rules));
    setPhase('role-reveal');
    setEliminatedPlayers([]);
    setNightResults({ killed: null, saved: null, investigated: null });
    setSelectedTarget(null);
    setRevealedPlayers([]);
    setWinner(null);
    setNightCount(1);
    setRoleRevealTargetId(null);
    setRoleRevealStep('list');
    setIsCardFlipped(false);
    setEyesClosedNextPhase('night-mafia');
    setShowDetectiveResult(false);
    setNightReport({
      type: 'quiet',
      victimId: null,
      playerName: '',
      cause: '',
      note: 'The night passed quietly'
    });
  };

  const handleReturnToPassPlay = () => {
    navigate('/one-phone', {
      state: {
        players: activePlayers,
        narrator,
        rules
      }
    });
  };

  const handleCheckWinner = (nextEliminatedPlayers) => {
    const nextWinner = checkWinner(activePlayers, roles, nextEliminatedPlayers);
    if (nextWinner) {
      setWinner(nextWinner);
      setPhase('ended');
      return nextWinner;
    }
    return null;
  };

  const revealPlayer = (playerId) => {
    if (revealedPlayers.includes(playerId)) return;
    setSelectedTarget(playerId);
    setRoleRevealTargetId(playerId);
    setRoleRevealStep('pass-to-player');
    setIsCardFlipped(false);
  };

  const startRoleCard = () => {
    setRoleRevealStep('card');
    setIsCardFlipped(false);
  };

  const handleRoleCardTap = () => {
    if (!selectedRevealPlayer) return;

    if (!isCardFlipped) {
      setIsCardFlipped(true);
      return;
    }

    setRevealedPlayers((current) => (current.includes(selectedRevealPlayer.id) ? current : [...current, selectedRevealPlayer.id]));
    finishRoleReveal();
  };

  const finishRoleReveal = () => {
    setSelectedTarget(null);
    setRoleRevealTargetId(null);
    setRoleRevealStep('list');
    setIsCardFlipped(false);
  };

  const startNight = () => {
    setPhase('night-eyes-closed');
    setEyesClosedNextPhase('night-mafia');
    setSelectedTarget(null);
  };

  // `results` lets callers pass the night's choices directly (state updates are async)
  const enterDayDiscussion = (results = nightResults) => {
    const nextNightResults = { ...results };
    const nextEliminatedPlayers = [...eliminatedPlayers];
    const nextReport = buildNightReport({ nightResults: nextNightResults, players: activePlayers });

    if (nextReport.type === 'kill' && nextReport.victimId && !nextEliminatedPlayers.includes(nextReport.victimId)) {
      nextEliminatedPlayers.push(nextReport.victimId);
    }

    setNightReport(nextReport);
    setEliminatedPlayers(nextEliminatedPlayers);
    setSelectedTarget(null);
    setShowDetectiveResult(false);

    const nextWinner = handleCheckWinner(nextEliminatedPlayers);
    if (nextWinner) return;

    setPhase('day-discussion');
  };

  const continueEyesClosed = () => {
    if (eyesClosedNextPhase === 'night-mafia') {
      setPhase('night-mafia');
      setSelectedTarget(null);
      setShowDetectiveResult(false);
      return;
    }

    if (eyesClosedNextPhase === 'night-doctor') {
      setPhase('night-doctor');
      setSelectedTarget(null);
      return;
    }

    if (eyesClosedNextPhase === 'night-detective') {
      setPhase('night-detective');
      setSelectedTarget(null);
      return;
    }

    enterDayDiscussion(nightResults);
  };

  const getNextAfterMafia = () => {
    if (isDoctorEnabled) return 'night-doctor';
    if (isDetectiveEnabled) return 'night-detective';
    return 'day-discussion';
  };

  const getNextAfterDoctor = () => {
    if (isDetectiveEnabled) return 'night-detective';
    return 'day-discussion';
  };

  const getCurrentRoleHolder = (role) => {
    const player = activePlayers.find((candidate) => roles[candidate.id] === role && !eliminatedPlayers.includes(candidate.id));
    return player || null;
  };

  const goToNextNightStep = (next, results) => {
    setNightResults(results);
    setSelectedTarget(null);
    if (next === 'day-discussion') {
      enterDayDiscussion(results);
      return;
    }
    setPhase(next);
  };

  const handleConfirmMafiaKill = () => {
    if (!selectedTarget) return;
    goToNextNightStep(getNextAfterMafia(), { ...nightResults, killed: selectedTarget });
  };

  const handleConfirmDoctorSave = () => {
    goToNextNightStep(getNextAfterDoctor(), { ...nightResults, saved: selectedTarget });
  };

  const handleNoSave = () => {
    goToNextNightStep(getNextAfterDoctor(), { ...nightResults, saved: null });
  };

  const handleConfirmInvestigation = () => {
    if (!selectedTarget) return;
    setNightResults((current) => ({
      ...current,
      investigated: {
        targetId: selectedTarget,
        isMafia: roles[selectedTarget] === 'mafia'
      }
    }));
    setShowDetectiveResult(true);
  };

  const handleContinueAfterInvestigation = () => {
    setShowDetectiveResult(false);
    setSelectedTarget(null);
    setPhase('night-eyes-closed');
    setEyesClosedNextPhase('day-discussion');
  };

  const handleStartVoting = () => {
    setPhase('day-vote');
    setSelectedTarget(null);
  };

  const handleConfirmDayVote = () => {
    if (!selectedTarget) return;

    const nextEliminatedPlayers = eliminatedPlayers.includes(selectedTarget)
      ? eliminatedPlayers
      : [...eliminatedPlayers, selectedTarget];

    setEliminatedPlayers(nextEliminatedPlayers);
    setSelectedTarget(null);

    const nextWinner = handleCheckWinner(nextEliminatedPlayers);
    if (nextWinner) return;

    setNightResults({ killed: null, saved: null, investigated: null });
    setNightReport({
      type: 'quiet',
      victimId: null,
      playerName: '',
      cause: '',
      note: 'The night passed quietly'
    });
    setPhase('night-eyes-closed');
    setEyesClosedNextPhase('night-mafia');
    setNightCount((current) => current + 1);
    setShowDetectiveResult(false);
  };

  useEffect(() => {
    document.title = 'Mafia | Pass & Play';
  }, []);

  const view = renderPhase();
  if (!view) {
    return (
      <StatusScreen title="This game can't continue" message="Something went wrong with the round. Start a new one from Pass & Play.">
        <Button block onClick={handleReturnToPassPlay}>Back to Pass &amp; Play</Button>
      </StatusScreen>
    );
  }

  return (
    <Screen
      tone={view.tone}
      width={view.width}
      header={(
        <ScreenHeader
          width={view.width}
          title={game.name}
          subtitle={view.subtitle}
          onBack={phase === 'ended' ? handleReturnToPassPlay : () => setConfirmLeave(true)}
          backLabel="Leave game"
        />
      )}
    >
      <div key={view.key} className="flex flex-1 animate-enter flex-col pt-2">{view.body}</div>
      <ConfirmDialog
        open={confirmLeave}
        title="Leave this game?"
        message="The game ends and everyone's roles are lost."
        confirmLabel="Leave game"
        cancelLabel="Keep playing"
        tone="danger"
        onCancel={() => setConfirmLeave(false)}
        onConfirm={handleReturnToPassPlay}
      />
    </Screen>
  );

  /** The narrator picks a player on behalf of whoever is awake. */
  function pickList(candidates) {
    return (
      <ul className="grid gap-2 md:grid-cols-2">
        {candidates.map((player) => (
          <li key={player.id}>
            <SelectableRow
              selected={selectedTarget === player.id}
              onClick={() => setSelectedTarget(player.id)}
              leading={<Avatar player={player} size="lg" />}
              title={playerName(player)}
            />
          </li>
        ))}
      </ul>
    );
  }

  function narratorNote(children) {
    return <Notice icon={Megaphone} tone="brand">{children}</Notice>;
  }

  function renderPhase() {
    const narratorLine = `Narrator: ${narratorName}`;

    if (phase === 'role-reveal') {
      if (roleRevealStep === 'pass-to-player' && selectedRevealPlayer) {
        return {
          key: 'pass',
          subtitle: 'Role cards',
          body: (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
              <p className="text-lg font-medium text-ink-muted">Pass the phone to</p>
              <Avatar player={selectedRevealPlayer} size="2xl" />
              <h2 className="break-words text-4xl font-bold text-ink">{playerName(selectedRevealPlayer)}</h2>
              <p className="max-w-xs text-lg text-ink-muted">Make sure nobody else can see the screen.</p>
              <ScreenFooter>
                <Button size="lg" block onClick={startRoleCard}>I&apos;m {playerName(selectedRevealPlayer)}, show me</Button>
                <Button variant="ghost" block onClick={finishRoleReveal}>Back to the list</Button>
              </ScreenFooter>
            </div>
          )
        };
      }

      if (roleRevealStep === 'card' && selectedRevealPlayer) {
        return {
          key: 'card',
          subtitle: 'Role cards',
          body: (
            <div className="flex flex-1 flex-col items-center justify-center gap-6 py-4">
              <PhaseTitle
                title={`${playerName(selectedRevealPlayer)}'s role card`}
                hint={isCardFlipped ? 'Remember it, then hide it before you pass the phone on.' : 'For your eyes only. Tap the card to flip it.'}
              />
              <RoleCard role={selectedRole} flipped={isCardFlipped} onToggle={handleRoleCardTap} />
              <ScreenFooter>
                <Button size="lg" block onClick={handleRoleCardTap}>
                  {isCardFlipped ? 'Hide and pass it on' : 'Reveal my role'}
                </Button>
              </ScreenFooter>
            </div>
          )
        };
      }

      const remaining = activePlayers.length - revealedPlayers.length;
      return {
        key: 'list',
        subtitle: narratorLine,
        body: (
          <div className="flex flex-col gap-4">
            <PhaseTitle title="Hand out the roles" hint="Tap your name, look at your card on your own, then pass the phone on." />
            <ul className="grid gap-2 md:grid-cols-2">
              {activePlayers.map((player) => {
                const hasSeenRole = revealedPlayers.includes(player.id);
                return (
                  <li key={player.id}>
                    <SelectableRow
                      mark={false}
                      disabled={hasSeenRole}
                      onClick={() => revealPlayer(player.id)}
                      leading={<Avatar player={player} />}
                      title={playerName(player)}
                      trailing={hasSeenRole ? <Badge tone="success" icon={Check}>Seen</Badge> : <Badge>Tap to view</Badge>}
                    />
                  </li>
                );
              })}
            </ul>
            <ScreenFooter>
              <Button size="lg" block disabled={!allPlayersRevealed} onClick={startNight}>
                {allPlayersRevealed ? `Give the phone to ${narratorName} and start the night` : `Waiting for ${remaining} more player${remaining === 1 ? '' : 's'}`}
              </Button>
            </ScreenFooter>
          </div>
        )
      };
    }

    if (phase === 'night-eyes-closed') {
      return {
        key: `sleep-${eyesClosedNextPhase}`,
        subtitle: narratorLine,
        tone: 'night',
        body: (
          <>
            <SleepScreen title="Everyone, close your eyes" hint={`${narratorName}, read this out. Continue once all eyes are shut.`} />
            <ScreenFooter>
              <Button size="lg" block onClick={continueEyesClosed}>Continue</Button>
            </ScreenFooter>
          </>
        )
      };
    }

    if (phase === 'night-mafia') {
      const candidates = alivePlayers.filter((player) => roles[player.id] !== 'mafia');
      return {
        key: phase,
        subtitle: `Night ${nightCount}`,
        width: 'wide',
        body: (
          <div className="flex flex-col gap-4">
            <PhaseTitle title="Mafia, open your eyes" hint="Silently point at who to eliminate." />
            {narratorNote(<>The Mafia: {formatCommaNames(mafiaLiving)}</>)}
            {pickList(candidates)}
            <ScreenFooter>
              <Button size="lg" block disabled={!selectedTarget} onClick={handleConfirmMafiaKill}>Confirm target</Button>
            </ScreenFooter>
          </div>
        )
      };
    }

    if (phase === 'night-doctor') {
      const doctor = getCurrentRoleHolder('doctor');
      return {
        key: phase,
        subtitle: `Night ${nightCount}`,
        width: 'wide',
        body: (
          <div className="flex flex-col gap-4">
            <PhaseTitle title="Doctor, open your eyes" hint="Silently point at who to protect." />
            {narratorNote(<>The Doctor: {doctor?.displayName || 'nobody'}</>)}
            {pickList(alivePlayers)}
            <ScreenFooter>
              <Button size="lg" block disabled={!selectedTarget} onClick={handleConfirmDoctorSave}>Confirm protection</Button>
              <Button variant="secondary" block onClick={handleNoSave}>Protect nobody</Button>
            </ScreenFooter>
          </div>
        )
      };
    }

    if (phase === 'night-detective') {
      const detective = getCurrentRoleHolder('detective');
      const candidates = alivePlayers.filter((player) => roles[player.id] !== 'detective');
      const investigation = nightResults.investigated;
      const investigatedPlayer = investigation?.targetId ? activePlayers.find((player) => player.id === investigation.targetId) : null;

      if (showDetectiveResult) {
        return {
          key: 'detective-result',
          subtitle: `Night ${nightCount}`,
          body: (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center">
              {investigatedPlayer && <Avatar player={investigatedPlayer} size="2xl" />}
              <p className="text-lg text-ink-muted">{investigatedPlayer?.displayName || 'That player'}</p>
              <h2 className={cn('text-4xl font-bold', investigation?.isMafia ? 'text-mafia' : 'text-success')}>
                {investigation?.isMafia ? 'is Mafia' : 'is not Mafia'}
              </h2>
              <p className="max-w-xs text-base text-ink-muted">Show the Detective this screen without saying anything.</p>
              <ScreenFooter>
                <Button size="lg" block onClick={handleContinueAfterInvestigation}>Continue</Button>
              </ScreenFooter>
            </div>
          )
        };
      }

      return {
        key: phase,
        subtitle: `Night ${nightCount}`,
        width: 'wide',
        body: (
          <div className="flex flex-col gap-4">
            <PhaseTitle title="Detective, open your eyes" hint="Silently point at who to investigate." />
            {narratorNote(<>The Detective: {detective?.displayName || 'nobody'}</>)}
            {pickList(candidates)}
            <ScreenFooter>
              <Button size="lg" block disabled={!selectedTarget} onClick={handleConfirmInvestigation}>Investigate</Button>
            </ScreenFooter>
          </div>
        )
      };
    }

    if (phase === 'day-discussion') {
      const victim = nightReport.victimId ? activePlayers.find((player) => player.id === nightReport.victimId) : null;
      const saved = nightReport.type === 'save';
      return {
        key: phase,
        subtitle: `Day ${nightCount}`,
        width: 'wide',
        body: (
          <div className="grid gap-4 md:grid-cols-2 md:items-start md:gap-8">
            <div className="flex flex-col gap-4">
              <div className="rounded-card border border-line bg-surface p-5 text-center">
                <h2 className="font-serif text-2xl font-black uppercase tracking-wide">The morning after</h2>
                <PaperRule className="text-ink-faint" />
                <p className="text-base text-ink-muted">Everyone, wake up. {narratorName}, read out the report.</p>
              </div>
              <IncidentReport
                victim={victim}
                saved={saved}
                cause={saved ? '' : nightReport.cause}
                note={nightReport.type === 'quiet' ? '' : nightReport.note}
                extra={saved && nightReport.cause ? [['Treatment', nightReport.cause]] : []}
              />
            </div>
            <section className="rounded-card border border-line bg-surface p-4">
              <div className="flex items-center justify-between">
                <TypeLabel as="h3" className="text-sm text-ink">Suspects</TypeLabel>
                <span className="tabular font-mono text-sm text-ink-muted">{alivePlayers.length} alive</span>
              </div>
              <div className="my-3 h-0.5 bg-mafia/70" aria-hidden="true" />
              <ul className="grid grid-cols-2 gap-2">
                {alivePlayers.map((player) => (
                  <li key={player.id} className="flex min-w-0 items-center gap-2 rounded-control border border-line bg-surface-raised p-2">
                    <Avatar player={player} size="sm" />
                    <span className="min-w-0 truncate font-mono text-sm font-bold">{playerName(player)}</span>
                  </li>
                ))}
              </ul>
            </section>
            <ScreenFooter>
              <Button size="lg" block onClick={handleStartVoting}>Start the vote</Button>
            </ScreenFooter>
          </div>
        )
      };
    }

    if (phase === 'day-vote') {
      return {
        key: phase,
        subtitle: `Day ${nightCount} vote`,
        width: 'wide',
        body: (
          <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
            <Ballot subtitle="Count the hands, then mark the player with the most votes.">
              {alivePlayers.map((player) => (
                <BallotRow
                  key={player.id}
                  player={player}
                  selected={selectedTarget === player.id}
                  onClick={() => setSelectedTarget(player.id)}
                />
              ))}
            </Ballot>
            <ScreenFooter>
              <Button size="lg" block disabled={!selectedTarget} onClick={handleConfirmDayVote}>
                {selectedTarget ? `Vote out ${playerName(activePlayers.find((p) => p.id === selectedTarget))}` : 'Tick a name to vote'}
              </Button>
            </ScreenFooter>
          </div>
        )
      };
    }

    if (phase === 'ended') {
      const townWon = winner === 'town';
      const mafiaCount = activePlayers.filter((player) => roles[player.id] === 'mafia').length;
      return {
        key: phase,
        subtitle: 'Game over',
        width: 'wide',
        body: (
          <div className="grid gap-6 md:grid-cols-2 md:items-start md:gap-8">
            <GazetteMasthead
              left={`Mafia: ${mafiaCount}`}
              right={`Nights: ${nightCount}`}
              headline={townWon ? 'Town triumphs' : 'Mafia reigns'}
              deck={townWon ? 'Every member of the Mafia identified and run out of town' : 'Civilians deceived as the Mafia seize control of the town'}
            />
            <CaseClosed
              players={activePlayers}
              stampTone={townWon ? 'blue' : 'red'}
              isFaded={(player) => eliminatedPlayers.includes(player.id)}
              renderMeta={(player) => (eliminatedPlayers.includes(player.id) ? 'Eliminated' : 'Survived')}
              renderStamp={(player) => <RoleStamp role={roles[player.id]} />}
            />
            <ScreenFooter>
              <Button size="lg" block onClick={resetGame}>Play again</Button>
              <Button variant="secondary" block onClick={handleReturnToPassPlay}>Back to Pass &amp; Play</Button>
            </ScreenFooter>
          </div>
        )
      };
    }

    return null;
  }
}
