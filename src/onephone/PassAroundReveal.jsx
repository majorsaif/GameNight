import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { PhaseTitle } from '../components/gameParts';
import { Avatar, Badge, Button, ScreenFooter, SelectableRow, playerName } from '../ui';

/**
 * Hands the phone to each player in turn so they can privately see their
 * secret. Calls onDone once everyone has looked.
 */
export default function PassAroundReveal({ players, renderSecret, onDone, title = 'Secret cards', startLabel = 'Start' }) {
  const [seen, setSeen] = useState([]);
  const [current, setCurrent] = useState(null);
  const [step, setStep] = useState('list'); // list | handover | secret

  const currentPlayer = players.find((p) => p.uid === current) || null;
  const allSeen = players.length > 0 && players.every((p) => seen.includes(p.uid));
  const remaining = players.length - seen.length;

  if (step === 'handover' && currentPlayer) {
    return (
      <div key="handover" className="flex flex-1 animate-enter flex-col items-center justify-center gap-3 py-10 text-center">
        <p className="text-lg font-medium text-ink-muted">Pass the phone to</p>
        <Avatar player={currentPlayer} size="2xl" />
        <h2 className="break-words text-4xl font-bold text-ink">{playerName(currentPlayer)}</h2>
        <p className="max-w-xs text-lg text-ink-muted">Make sure nobody else can see the screen.</p>
        <ScreenFooter>
          <Button size="lg" block onClick={() => setStep('secret')}>I&apos;m {playerName(currentPlayer)}, show me</Button>
          <Button
            variant="ghost"
            block
            onClick={() => {
              setCurrent(null);
              setStep('list');
            }}
          >
            Back to the list
          </Button>
        </ScreenFooter>
      </div>
    );
  }

  if (step === 'secret' && currentPlayer) {
    return (
      <div key="secret" className="flex flex-1 animate-enter flex-col justify-center gap-4 py-4">
        {renderSecret(currentPlayer)}
        <ScreenFooter>
          <Button
            size="lg"
            block
            onClick={() => {
              setSeen((list) => (list.includes(currentPlayer.uid) ? list : [...list, currentPlayer.uid]));
              setCurrent(null);
              setStep('list');
            }}
          >
            Hide and pass it on
          </Button>
        </ScreenFooter>
      </div>
    );
  }

  return (
    <div key="list" className="flex animate-enter flex-col gap-4">
      <PhaseTitle title={title} hint="Tap your name, then look at the screen on your own." />
      <ul className="grid gap-2 md:grid-cols-2">
        {players.map((player) => {
          const done = seen.includes(player.uid);
          return (
            <li key={player.uid}>
              <SelectableRow
                mark={false}
                disabled={done}
                onClick={() => {
                  setCurrent(player.uid);
                  setStep('handover');
                }}
                leading={<Avatar player={player} />}
                title={playerName(player)}
                trailing={done ? <Badge tone="success" icon={Check}>Seen</Badge> : <Badge>Tap to view</Badge>}
              />
            </li>
          );
        })}
      </ul>
      <ScreenFooter>
        <Button size="lg" block disabled={!allSeen} onClick={onDone}>
          {allSeen ? startLabel : `Waiting for ${remaining} more player${remaining === 1 ? '' : 's'}`}
        </Button>
      </ScreenFooter>
    </div>
  );
}
