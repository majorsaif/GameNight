import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import PassAroundReveal from '../PassAroundReveal';
import { loadPassPlayPlayers, toGamePlayers } from '../passPlay';
import { dealSpyfall, maxSpiesFor, SPYFALL_MIN_PLAYERS } from '../../games/spyfall/logic';
import { useCountdown } from '../../lib/activity';
import { pickRandom } from '../../lib/random';
import { GAMES } from '../../games/catalog';
import GameSettings from '../../components/GameSettings';
import { BoardingPass, DeparturesBoard, LuggageTag, TypeLabel } from '../../components/props';
import { LocationGrid } from '../../spyfall/LocationGrid';
import { Avatar, Button, Card, ConfirmDialog, Notice, Screen, ScreenFooter, ScreenHeader, playerName } from '../../ui';

const game = GAMES.spyfall;

export default function OnePhoneSpyfall() {
  const navigate = useNavigate();
  const players = useMemo(() => toGamePlayers(loadPassPlayPlayers()), []);
  const [rules, setRules] = useState({ spyCount: 1, showRoles: true, discussionTime: 8 });
  const [dealt, setDealt] = useState(null);
  const [stage, setStage] = useState('setup'); // setup | reveal | question | answer
  const [endsAt, setEndsAt] = useState(null);
  const [crossed, setCrossed] = useState(() => new Set());
  const [confirmReveal, setConfirmReveal] = useState(false);
  const secondsLeft = useCountdown(stage === 'question' ? endsAt : null);

  useEffect(() => {
    document.title = 'Spyfall | Pass & Play';
  }, []);

  if (players.length === 0) return <Navigate to="/one-phone" replace />;

  const max = maxSpiesFor(players.length);
  const enough = players.length >= SPYFALL_MIN_PLAYERS;
  const byUid = (uid) => players.find((p) => p.uid === uid) || { displayName: 'Someone' };

  const deal = () => {
    const next = dealSpyfall(players, { ...rules, spyCount: Math.min(rules.spyCount, max) }, null);
    setDealt({ ...next, firstAsker: pickRandom(players)?.uid });
    setCrossed(new Set());
    setConfirmReveal(false);
    setStage('reveal');
  };

  const toggleCrossed = (name) => {
    setCrossed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const frame = (subtitle, children, width = 'column') => (
    <Screen
      width={width}
      header={(
        <ScreenHeader
          width={width}
          title={game.name}
          subtitle={subtitle}
          onBack={() => (stage === 'setup' ? navigate('/one-phone/games') : setStage('setup'))}
          backLabel={stage === 'setup' ? 'Back to games' : 'Back to settings'}
        />
      )}
    >
      <div key={stage} className="flex flex-1 animate-enter flex-col pt-2">{children}</div>
    </Screen>
  );

  if (stage === 'setup' || !dealt) {
    return frame('Pass & Play', (
      <div className="flex flex-col gap-4">
        <p className="text-base text-ink-muted">
          Everyone learns the secret location, except the spy. Question each other to find the spy before they work out where you are.
        </p>
        <Card padding="sm">
          <GameSettings
            type="spyfall"
            rules={{ ...rules, spyCount: Math.min(rules.spyCount, max) }}
            playerCount={players.length}
            onChange={(patch) => setRules((prev) => ({ ...prev, ...patch }))}
          />
        </Card>
        <ScreenFooter>
          <Button size="lg" block disabled={!enough} onClick={deal}>
            {enough ? `Deal to ${players.length} players` : `Needs ${SPYFALL_MIN_PLAYERS} or more players`}
          </Button>
        </ScreenFooter>
      </div>
    ));
  }

  if (stage === 'reveal') {
    return frame('Secret location', (
      <PassAroundReveal
        players={dealt.players}
        title="Secret location"
        startLabel="Start the clock"
        onDone={() => {
          setEndsAt(Date.now() + dealt.rules.discussionTime * 60 * 1000);
          setStage('question');
        }}
        renderSecret={(player) => {
          const isSpy = dealt.spyIds.includes(player.uid);
          return (
            <div className="flex flex-col gap-4">
              <BoardingPass
                sealed={false}
                destination={dealt.location}
                isSpy={isSpy}
                passenger={playerName(player)}
                role={player.role}
              />
              {isSpy && <p className="text-center text-base text-ink-muted">Work out where everyone is without giving yourself away.</p>}
            </div>
          );
        }}
      />
    ));
  }

  if (stage === 'question') {
    const first = byUid(dealt.firstAsker);
    return frame('Questioning', (
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 md:grid-cols-[20rem_minmax(0,1fr)] md:items-start md:gap-8">
          <div className="flex flex-col gap-4">
            <DeparturesBoard seconds={secondsLeft ?? 0} />
            {secondsLeft === 0 ? (
              <Notice tone="danger">Time&apos;s up. Vote by pointing on three.</Notice>
            ) : (
              <Card padding="sm" className="flex items-center gap-3">
                <Avatar player={first} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-muted">First question from</p>
                  <p className="truncate text-xl font-semibold text-ink">{playerName(first)}</p>
                </div>
              </Card>
            )}
          </div>
          <LocationGrid crossedOut={crossed} onToggle={toggleCrossed} />
        </div>
        <ScreenFooter>
          <Button size="lg" block onClick={() => setConfirmReveal(true)}>Reveal the spy</Button>
        </ScreenFooter>
        <ConfirmDialog
          open={confirmReveal}
          title="Reveal the spy and the location?"
          message="Only do this once everyone has voted. It ends the round."
          confirmLabel="Reveal"
          cancelLabel="Not yet"
          onCancel={() => setConfirmReveal(false)}
          onConfirm={() => {
            setConfirmReveal(false);
            setStage('answer');
          }}
        />
      </div>
    ), 'wide');
  }

  const spyNames = dealt.spyIds.map((uid) => playerName(byUid(uid))).join(', ');
  return frame('Round over', (
    <div className="flex flex-1 flex-col justify-center gap-4 py-4">
      <header>
        <TypeLabel className="text-ink-muted">Operation Spyfall</TypeLabel>
        <h2 className="mt-2 break-words font-serif text-4xl font-black uppercase text-danger">{spyNames}</h2>
        <p className="mt-2 font-mono text-sm font-bold uppercase tracking-[0.12em] text-ink-muted">
          {dealt.spyIds.length > 1 ? 'Were the spies' : 'Was the spy'}
        </p>
      </header>
      <LuggageTag destination={dealt.location} />
      <ScreenFooter>
        <Button size="lg" block onClick={deal}>Play again</Button>
        <Button variant="secondary" block onClick={() => navigate('/one-phone')}>Back to Pass &amp; Play</Button>
      </ScreenFooter>
    </div>
  ));
}
