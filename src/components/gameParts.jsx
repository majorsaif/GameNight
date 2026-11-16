import React from 'react';
import { Eye, EyeOff, Moon, Trophy, UserX } from 'lucide-react';
import { ACCENT_TEXT, ACCENT_TINT } from '../games/catalog';
import { Avatar, AvatarStack, Badge, Button, Card, Notice, Sheet, cn, formatClock, playerName } from '../ui';

/** Heading for a phase: what's happening and what to do. */
export function PhaseTitle({ title, hint, className }) {
  return (
    <div className={cn('text-center', className)}>
      <h2 className="text-2xl font-semibold text-ink">{title}</h2>
      {hint && <p className="mt-1 text-base text-ink-muted">{hint}</p>}
    </div>
  );
}

export function EliminatedNotice({ children = "You're out of the game. You can keep watching." }) {
  return <Notice tone="danger" icon={UserX}>{children}</Notice>;
}

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

/** The revealed side of a secret: a label, the secret itself in large type, and any extra lines. */
export function SecretFace({ accent, label, value, details = [], valueTone = 'accent', children }) {
  const long = String(value || '').length > 12;
  return (
    <Card className="flex min-h-72 flex-col items-center justify-center gap-4 text-center">
      <p className="text-base font-medium text-ink-muted">{label}</p>
      <p className={cn('break-words font-bold', long ? 'text-3xl' : 'text-4xl', valueTone === 'danger' ? 'text-danger' : ACCENT_TEXT[accent])}>
        {value}
      </p>
      {details.filter(Boolean).map((detail) => (
        <p key={detail} className="text-lg text-ink-muted">{detail}</p>
      ))}
      {children}
    </Card>
  );
}

/**
 * A secret only one player should see (their word, location or role).
 * Hidden until tapped, with type large enough to read at arm's length.
 */
export function SecretCard({ revealed, onToggle, accent, hiddenTitle = 'Your secret is hidden', ...face }) {
  if (revealed) {
    return (
      <SecretFace accent={accent} {...face}>
        <Button variant="secondary" icon={EyeOff} onClick={onToggle}>Hide</Button>
      </SecretFace>
    );
  }
  return (
    <Card className="flex min-h-72 flex-col items-center justify-center gap-4 text-center">
      <span className={cn('inline-flex h-16 w-16 items-center justify-center rounded-full', ACCENT_TINT[accent])}>
        <EyeOff className="h-8 w-8" aria-hidden="true" />
      </span>
      <div>
        <p className="text-xl font-semibold text-ink">{hiddenTitle}</p>
        <p className="mt-1 text-base text-ink-muted">Make sure nobody else can see your screen.</p>
      </div>
      <Button icon={Eye} onClick={onToggle}>Reveal</Button>
    </Card>
  );
}

/** Game-over headline. */
export function WinnerBanner({ accent, title, subtitle, children }) {
  return (
    <div className="flex flex-col items-center py-4 text-center">
      <span className={cn('inline-flex h-16 w-16 items-center justify-center rounded-full', ACCENT_TINT[accent])}>
        <Trophy className="h-8 w-8" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-4xl font-bold text-ink">{title}</h2>
      {subtitle && <p className="mt-2 text-lg text-ink-muted">{subtitle}</p>}
      {children && <div className="mt-4 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

/** End-of-game list of every player with their role revealed. */
export function ResultList({ title = 'Players', players, renderBadge, renderMeta, isFaded }) {
  return (
    <Card padding="none">
      <h3 className="px-4 pb-1 pt-4 text-base font-semibold text-ink">{title}</h3>
      <ul className="divide-y divide-line px-4">
        {players.map((player) => (
          <li key={player.uid || player.id} className="flex min-h-14 items-center gap-3 py-2">
            <Avatar player={player} size="sm" dimmed={isFaded ? isFaded(player) : false} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-medium text-ink">{playerName(player)}</p>
              {renderMeta && <p className="text-sm text-ink-faint">{renderMeta(player)}</p>}
            </div>
            {renderBadge?.(player)}
          </li>
        ))}
      </ul>
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

/** A row of small facts, e.g. "3 nights". */
export function Facts({ items }) {
  return (
    <>
      {items.filter(Boolean).map((item) => <Badge key={item}>{item}</Badge>)}
    </>
  );
}
