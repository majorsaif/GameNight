import React from 'react';
import { Moon } from 'lucide-react';
import { Avatar, AvatarStack, Button, Card, Sheet, cn, formatClock, playerName } from '../ui';

/** Heading for a phase: what's happening and what to do. */
export function PhaseTitle({ title, hint, className }) {
  return (
    <div className={cn('text-center', className)}>
      <h2 className="text-2xl font-semibold text-ink">{title}</h2>
      {hint && <p className="mt-1 text-base text-ink-muted">{hint}</p>}
    </div>
  );
}

export { EliminatedSlip as EliminatedNotice } from './props';

/** Black "eyes closed" screen shown to everyone who isn't acting at night. */
export function SleepScreen({ title = 'Close your eyes', hint = 'Keep them shut until you hear your cue.', seconds = null, children }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center">
      {children}
      <Moon className="h-16 w-16 text-brand-300" aria-hidden="true" />
      <h2 className="text-4xl font-bold text-ink">{title}</h2>
      <p className="max-w-xs text-lg text-ink-muted">{hint}</p>
      {seconds != null && <p className="tabular text-2xl font-semibold text-ink-faint">{formatClock(seconds)}</p>}
    </div>
  );
}

/** Who has tapped "Ready to vote" so far. */
export function ReadyStatus({ players, readyUids, label = 'Ready to vote' }) {
  const ready = players.filter((p) => readyUids.includes(p.uid || p.id)).length;
  return (
    <Card padding="sm" className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-ink-muted">{label}</p>
        <p className="tabular text-xl font-semibold text-ink">{ready} of {players.length}</p>
      </div>
      <AvatarStack
        players={players}
        max={8}
        size="sm"
        ringClass="ring-surface"
        isDimmed={(player) => !readyUids.includes(player.uid || player.id)}
      />
    </Card>
  );
}

/**
 * Shown to everyone while a spy/imposter says their guess out loud.
 * The host confirms whether it was right; it can't be dismissed.
 */
export function GuessSheet({ open, guesser, what, isHost, busy, onResolve }) {
  const name = guesser ? playerName(guesser) : 'A player';
  return (
    <Sheet
      open={open}
      dismissible={false}
      title={`${name} is guessing ${what}`}
      description="The game is paused while they say it out loud."
      footer={isHost ? (
        <div className="flex gap-3">
          <Button variant="danger" className="flex-1" disabled={busy} onClick={() => onResolve(false)}>Wrong</Button>
          <Button className="flex-1" disabled={busy} onClick={() => onResolve(true)}>Correct</Button>
        </div>
      ) : null}
    >
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        {guesser && <Avatar player={guesser} size="xl" />}
        <p className="text-base text-ink-muted">
          {isHost ? 'Listen to their answer, then mark it.' : 'Waiting for the host to confirm their answer.'}
        </p>
      </div>
    </Sheet>
  );
}
