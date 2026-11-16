import React from 'react';
import { Check, EyeOff, Plane } from 'lucide-react';
import gameNightIcon from '../assets/itsgamesnight-icon.webp';
import { Avatar, AvatarStack, cn, formatClock, playerName } from '../ui';

/*
 * Printed props used inside the games: case files, ballots, police reports,
 * the town gazette, boarding passes, luggage tags and sealed envelopes.
 * They share one paper palette, one stamp style, the typewriter face for
 * text and the serif for headlines, so every game feels part of one set.
 */

const PAPER_TONES = {
  paper: 'border-paper-line bg-paper text-paper-ink',
  manila: 'border-manila-line bg-manila text-manila-ink',
  insert: 'border-manila-line/50 bg-manila-light text-manila-ink'
};

const PAPER_PADDING = { none: '', sm: 'p-4', md: 'p-5' };

export function Paper({ tone = 'paper', padding = 'md', as: Component = 'div', className, children, ...rest }) {
  return (
    <Component className={cn('relative overflow-hidden rounded-card border', PAPER_TONES[tone], PAPER_PADDING[padding], className)} {...rest}>
      {children}
    </Component>
  );
}

const STAMP_TONES = {
  red: 'text-stamp-red',
  green: 'text-stamp-green',
  blue: 'text-stamp-blue',
  brown: 'text-stamp-brown'
};

const STAMP_SIZES = {
  sm: 'border-2 px-2 py-0.5 text-xs tracking-[0.16em]',
  lg: 'border-[3px] px-4 py-1 text-3xl tracking-[0.18em]'
};

const STAMP_TILTS = { left: '-rotate-6', right: 'rotate-6', steep: '-rotate-12', none: '' };

/** Rubber-stamp label: CASE FILE, CLOSED, MAFIA, VOTED... */
export function Stamp({ tone = 'red', size = 'sm', tilt = 'left', className, children }) {
  return (
    <span
      className={cn(
        'inline-block shrink-0 whitespace-nowrap rounded-sm border-current font-mono font-bold uppercase leading-tight',
        STAMP_TONES[tone],
        STAMP_SIZES[size],
        STAMP_TILTS[tilt],
        className
      )}
    >
      {children}
    </span>
  );
}

/** Small typewritten label on a prop, e.g. "Destination". */
export function TypeLabel({ as: Component = 'p', className, children }) {
  return <Component className={cn('font-mono text-xs font-bold uppercase tracking-[0.16em] opacity-80', className)}>{children}</Component>;
}

export function PaperRule({ double = false, className }) {
  if (double) {
    return (
      <div className={cn('my-3', className)} aria-hidden="true">
        <div className="h-0.5 bg-current opacity-60" />
        <div className="mt-0.5 h-px bg-current opacity-40" />
      </div>
    );
  }
  return <div className={cn('my-3 h-px bg-current opacity-30', className)} aria-hidden="true" />;
}

function Watermark({ children }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex select-none items-center justify-center" aria-hidden="true">
      <span className="-rotate-[20deg] whitespace-nowrap font-mono text-5xl font-bold uppercase tracking-[0.28em] opacity-[0.07]">{children}</span>
    </div>
  );
}

// ─── Case files ──────────────────────────────────────────────────────────────

/** Manila folder used for lobbies and end-of-game results. */
export function CaseFile({ name, meta = null, stamp = 'Case file', stampTone = 'red', action = null, watermark = 'Confidential', children, className }) {
  return (
    <Paper tone="manila" className={className}>
      {watermark && <Watermark>{watermark}</Watermark>}
      <div className="relative">
        <div className="flex min-h-tap items-center justify-between gap-3">
          <Stamp tone={stampTone}>{stamp}</Stamp>
          {action}
        </div>
        <h2 className="mt-3 font-mono text-lg font-bold uppercase tracking-[0.12em]">Case: {name}</h2>
        {meta && <p className="mt-1 font-mono text-sm text-manila-ink/80">{meta}</p>}
        <PaperRule />
        <div className="flex flex-col gap-4">{children}</div>
      </div>
    </Paper>
  );
}

/** The typed list of players clipped inside a case file. */
export function AgentList({ title = 'Agents assigned', players, renderMeta, renderStamp, isFaded, youId = null }) {
  return (
    <Paper tone="insert" padding="sm">
      <TypeLabel>{title}: {players.length}</TypeLabel>
      <PaperRule className="mb-1" />
      <ul className="divide-y divide-manila-line/30">
        {players.map((player) => {
          const id = player.uid || player.id;
          return (
            <li key={id} className="flex min-h-14 items-center gap-3 py-2">
              <Avatar player={player} size="sm" dimmed={isFaded ? isFaded(player) : false} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-base font-bold uppercase">
                  {playerName(player)}{id === youId ? ' (you)' : ''}
                </p>
                {renderMeta && <p className="font-mono text-xs text-manila-ink/75">{renderMeta(player)}</p>}
              </div>
              {renderStamp?.(player)}
            </li>
          );
        })}
      </ul>
    </Paper>
  );
}

/** End-of-game file: CASE: CLOSED with every player's role stamped. */
export function CaseClosed({ players, stampTone = 'blue', renderMeta, renderStamp, isFaded }) {
  return (
    <Paper tone="manila">
      <div className="flex items-center gap-3">
        <TypeLabel className="text-sm opacity-100">Case:</TypeLabel>
        <Stamp tone={stampTone}>Closed</Stamp>
      </div>
      <PaperRule />
      <AgentList players={players} renderMeta={renderMeta} renderStamp={renderStamp} isFaded={isFaded} />
    </Paper>
  );
}

// ─── Ballots and reports ─────────────────────────────────────────────────────

/** The paper ballot every vote happens on. Rows go in as children. */
export function Ballot({ title = 'Official ballot', subtitle = 'Mark one candidate', seconds = null, status = null, stamped = false, children }) {
  return (
    <Paper>
      <div className="text-center">
        <h2 className="font-serif text-2xl font-black uppercase tracking-wide">{title}</h2>
        {subtitle && <p className="mt-1 font-serif text-base italic text-paper-muted">{subtitle}</p>}
      </div>
      <PaperRule className="opacity-50" />
      {seconds != null && (
        <div className="text-center" role="timer" aria-label={`Time remaining: ${formatClock(seconds)}`}>
          <TypeLabel className="text-paper-muted">Time remaining</TypeLabel>
          <p className={cn('tabular font-serif text-display font-black', seconds <= 10 && 'text-stamp-red')}>{formatClock(seconds)}</p>
        </div>
      )}
      {status && <p className="mb-3 mt-2 text-center font-mono text-sm text-paper-muted">{status}</p>}
      {stamped && (
        <div className="mb-4 flex justify-center" role="status">
          <Stamp tone="red" size="lg" tilt="steep">Voted</Stamp>
        </div>
      )}
      <ul className="overflow-hidden rounded border border-paper-line">{children}</ul>
    </Paper>
  );
}

/** One candidate on a ballot: tick box, photo, name and the votes cast for them. */
export function BallotRow({ player, selected = false, disabled = false, mark = true, onClick, voters = [], count = null, suffix = '' }) {
  return (
    <li className="border-t border-paper-line first:border-t-0">
      <button
        type="button"
        aria-pressed={mark === true ? selected : undefined}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          'flex min-h-16 w-full items-center gap-3 px-3 py-2 text-left transition-colors duration-150',
          selected ? 'bg-paper-shade' : 'bg-paper',
          disabled ? 'cursor-not-allowed' : 'hover:bg-paper-shade'
        )}
      >
        {mark === 'blank' && <span className="h-7 w-7 shrink-0" aria-hidden="true" />}
        {mark === true && (
          <span
            aria-hidden="true"
            className={cn(
              'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border-2 border-paper-ink',
              selected ? 'bg-paper-ink text-paper' : 'text-transparent'
            )}
          >
            <Check className="h-5 w-5" strokeWidth={3} />
          </span>
        )}
        <Avatar player={player} size="lg" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-base font-bold">{playerName(player)}{suffix}</span>
          {voters.length > 0 && <AvatarStack players={voters} max={6} size="xs" ringClass="ring-paper" className="mt-1" />}
        </span>
        {count != null && (
          <span className="tabular inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full bg-paper-ink px-2 text-sm font-bold text-paper" aria-label={`${count} vote${count === 1 ? '' : 's'}`}>
            {count}
          </span>
        )}
      </button>
    </li>
  );
}

/** "You have been ELIMINATED" slip, shown to players who are out. */
export function EliminatedSlip() {
  return (
    <Paper padding="sm" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-center">
      <span className="font-serif text-lg font-black uppercase tracking-wide">You have been</span>
      <Stamp tone="red" tilt="right">Eliminated</Stamp>
      <p className="w-full text-sm text-paper-muted">You can keep watching, but you can&apos;t act or vote.</p>
    </Paper>
  );
}

/** Police report for what happened overnight. */
export function IncidentReport({ victim = null, saved = false, cause = '', note = '', extra = [] }) {
  const rows = [
    [saved ? 'Patient' : 'Victim', victim ? playerName(victim) : 'None'],
    ...extra,
    victim && !saved && cause ? ['Cause', cause] : null,
    victim ? ['Status', saved ? 'Alive' : 'Deceased'] : null
  ].filter(Boolean);
  const stamp = !victim
    ? { tone: 'blue', text: 'All quiet' }
    : saved ? { tone: 'green', text: 'Alive' } : { tone: 'red', text: 'Deceased' };

  return (
    <Paper>
      <div className="flex items-start justify-between gap-3">
        <TypeLabel className="pt-1">Incident report</TypeLabel>
        <Stamp tone={stamp.tone} tilt="right">{stamp.text}</Stamp>
      </div>
      <PaperRule />
      <div className="flex items-center gap-4">
        {victim && <Avatar player={victim} size="xl" dimmed={!saved} />}
        <dl className="min-w-0 flex-1 space-y-1 font-mono text-base">
          {rows.map(([label, value]) => (
            <div key={label} className="flex flex-wrap gap-x-2">
              <dt className="font-bold uppercase">{label}:</dt>
              <dd className="min-w-0 break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      {(note || !victim) && (
        <>
          <PaperRule />
          <p className="text-center font-mono text-base">{note || 'The night passed quietly.'}</p>
        </>
      )}
    </Paper>
  );
}

/** Newspaper front page for the end of Mafia. */
export function GazetteMasthead({ headline, deck, left, right }) {
  return (
    <header className="text-paper">
      <div className="h-0.5 bg-current opacity-50" aria-hidden="true" />
      <div className="flex items-center justify-between gap-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.14em] text-paper/80">
        <span>{left}</span>
        <span>{right}</span>
      </div>
      <p className="text-center font-serif text-lg font-bold italic">The Games Night Gazette</p>
      <PaperRule double className="mt-2" />
      <h2 className="text-balance text-center font-serif text-4xl font-black uppercase tracking-wide md:text-display">{headline}</h2>
      <p className="mt-2 text-center font-serif text-base italic text-paper/80">{deck}</p>
      <PaperRule />
    </header>
  );
}

/** Typed memo with a few "LABEL: value" lines, used for Word Imposter results. */
export function TypedMemo({ rows, footnote }) {
  return (
    <div className="font-mono text-ink">
      <PaperRule className="mt-0 text-ink-faint" />
      <dl className="space-y-2">
        {rows.filter(Boolean).map(([label, value]) => (
          <div key={label} className="flex flex-wrap gap-x-3 text-lg">
            <dt className="uppercase tracking-[0.14em] text-ink-muted">{label}:</dt>
            <dd className="min-w-0 break-words font-bold">{value}</dd>
          </div>
        ))}
      </dl>
      <PaperRule className="text-ink-faint" />
      {footnote && <p className="font-serif text-sm italic text-ink-muted">{footnote}</p>}
    </div>
  );
}

// ─── Secrets ─────────────────────────────────────────────────────────────────

/**
 * "Eyes only" memo holding a secret word. Sealed until revealed; pass
 * `onToggle` to show a Reveal / Hide button.
 */
export function TopSecret({ revealed, onToggle = null, label, value, danger = false, details = [], note = null }) {
  const long = String(value || '').length > 12;
  return (
    <div className="flex min-h-72 flex-col items-center justify-center gap-4 rounded-card border border-line bg-surface px-5 py-8 text-center">
      <TypeLabel className="text-ink-muted">Eyes only</TypeLabel>
      {revealed ? (
        <>
          <p className="font-mono text-base uppercase tracking-[0.14em] text-ink-muted">{label}</p>
          <p className={cn('break-words font-mono font-bold uppercase', long ? 'text-3xl' : 'text-4xl', danger ? 'text-danger' : 'text-ink')}>{value}</p>
          {details.filter(Boolean).map((detail) => (
            <p key={detail} className="font-mono text-lg text-ink-muted">{detail}</p>
          ))}
          {note && <p className="font-serif text-lg italic text-danger">{note}</p>}
        </>
      ) : (
        <>
          <span className="inline-flex h-20 w-20 -rotate-6 items-center justify-center rounded-full border-[3px] border-dashed border-ink-faint text-center font-mono text-xs font-bold uppercase leading-tight text-ink-faint" aria-hidden="true">
            Top<br />secret
          </span>
          <div>
            <p className="font-mono text-lg font-bold text-ink">Your word is sealed</p>
            <p className="mt-1 text-base text-ink-muted">Reveal it when nobody else can see your screen.</p>
          </div>
        </>
      )}
      {onToggle && (
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            'inline-flex h-12 items-center justify-center gap-2 rounded-control px-6 font-semibold transition-colors duration-150',
            revealed ? 'border border-line bg-surface-raised text-ink hover:border-line-strong' : 'bg-brand-600 text-white hover:bg-brand-700'
          )}
        >
          {revealed && <EyeOff className="h-5 w-5" aria-hidden="true" />}
          {revealed ? 'Hide' : 'Reveal'}
        </button>
      )}
    </div>
  );
}

/** Sealed envelope holding a word, for the end of Word Imposter. */
export function Envelope({ label, word, tone = 'brown' }) {
  const long = String(word || '').length;
  const size = long <= 8 ? 'text-2xl' : long <= 14 ? 'text-xl' : 'text-base';
  return (
    <figure className="relative h-52 w-full" aria-label={`${label}: ${word}`}>
      <div className="absolute inset-x-0 bottom-0 h-36 rounded bg-manila-line" aria-hidden="true" />
      <div className="absolute inset-x-[8%] top-3 h-[74%] rounded-sm bg-paper px-3 pt-3 text-center text-paper-ink">
        <TypeLabel className="text-paper-muted">{label}</TypeLabel>
        <p className={cn('mt-2 break-words font-mono font-bold', size, STAMP_TONES[tone])}>{word}</p>
      </div>
      <div
        className={cn('absolute inset-x-0 bottom-0 h-20 rounded-b bg-manila border-b-4', tone === 'red' ? 'border-stamp-red' : 'border-stamp-brown')}
        style={{ clipPath: 'polygon(0 0, 50% 55%, 100% 0, 100% 100%, 0 100%)' }}
        aria-hidden="true"
      />
    </figure>
  );
}

// ─── Spyfall ─────────────────────────────────────────────────────────────────

function Redacted({ className }) {
  return <span className={cn('inline-block rounded-sm bg-paper-ink', className)} aria-hidden="true" />;
}

/** Boarding pass holding a player's location and role. Redacted until revealed. */
export function BoardingPass({ sealed, destination, isSpy = false, passenger, role }) {
  const long = String(destination || '').length > 10;
  return (
    <div className="mx-auto w-full max-w-sm overflow-hidden rounded-card border border-paper-line bg-paper text-paper-ink" aria-live="polite">
      <div className="flex h-11 items-center justify-between bg-stamp-brown px-5 text-paper">
        <span className="font-mono text-sm font-bold uppercase tracking-[0.18em]">Boarding pass</span>
        <Plane className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="px-5 py-6">
        <div className="text-center">
          <TypeLabel className="text-paper-muted">Destination</TypeLabel>
          <div className="mt-2 flex min-h-12 items-center justify-center">
            {sealed ? (
              <Redacted className="h-10 w-52" />
            ) : (
              <p className={cn('break-words font-mono font-bold uppercase', long ? 'text-2xl' : 'text-4xl', isSpy && 'text-stamp-red')}>
                {isSpy ? 'Unknown' : destination}
              </p>
            )}
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-x-6">
          <div className="min-w-0">
            <TypeLabel className="text-paper-muted">Passenger</TypeLabel>
            <div className="mt-1 flex min-h-8 items-center">
              {sealed ? <Redacted className="h-4 w-24" /> : <p className="truncate font-mono text-lg font-bold">{passenger}</p>}
            </div>
          </div>
          <div className="min-w-0">
            <TypeLabel className="text-paper-muted">Role</TypeLabel>
            <div className="mt-1 flex min-h-8 items-center">
              {sealed ? (
                <Redacted className="h-4 w-24" />
              ) : (
                <p className={cn('break-words font-mono text-lg font-bold', isSpy && 'text-stamp-red')}>{isSpy ? 'Spy' : (role || 'Passenger')}</p>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="relative border-t-2 border-dashed border-paper-line" aria-hidden="true">
        <span className="absolute -left-3 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-bg" />
        <span className="absolute -right-3 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-bg" />
      </div>
      <div className="flex items-center justify-between bg-paper-shade px-5 py-3" aria-hidden="true">
        <div>
          <div className="flex h-8 items-stretch gap-[2px]">
            {Array.from({ length: 26 }).map((_, index) => (
              <span key={index} className={cn('bg-paper-ink', index % 3 === 0 ? 'w-[3px]' : 'w-px')} />
            ))}
          </div>
          <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-[0.2em]">Its Games Night</p>
        </div>
        <img src={gameNightIcon} alt="" className="h-10 w-10 rounded object-cover opacity-70 grayscale" />
      </div>
    </div>
  );
}

function Flap({ char, big }) {
  return (
    <span
      className={cn(
        'relative inline-flex items-center justify-center rounded-sm border border-[#2b2b2b] bg-[#151515] font-mono font-bold',
        big ? 'h-12 w-8 text-3xl sm:h-14 sm:w-10 sm:text-4xl' : 'h-9 w-6 text-base sm:w-7 sm:text-lg'
      )}
    >
      {char}
      <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-black/70" />
    </span>
  );
}

/** Airport departures board showing the round's countdown. */
export function DeparturesBoard({ seconds, paused = false }) {
  const clock = seconds == null ? '-:--' : formatClock(seconds);
  const tone = seconds === 0 ? 'text-danger' : paused ? 'text-ink-muted' : 'text-warning';
  const status = seconds === 0 ? 'Closed' : paused ? 'On hold' : 'Boarding';
  return (
    <div className="overflow-hidden rounded-card border border-line bg-black" role="timer" aria-label={`Time left: ${clock}${paused ? ', paused' : ''}`}>
      <div className="flex h-11 items-center justify-between border-b border-[#2b2b2b] px-4 font-mono text-sm font-bold uppercase tracking-[0.18em] text-ink">
        <span>Departures</span>
        <span className={tone}>{status}</span>
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-4 sm:px-4">
        <span className="flex gap-0.5 text-ink sm:gap-1" aria-hidden="true">
          {'TIME'.split('').map((char, i) => <Flap key={i} char={char} />)}
        </span>
        <span className={cn('flex gap-0.5 sm:gap-1', tone)} aria-hidden="true">
          {clock.split('').map((char, i) => <Flap key={i} char={char} big />)}
        </span>
      </div>
    </div>
  );
}

/** Leather luggage tag naming the location, for the end of Spyfall. */
export function LuggageTag({ destination }) {
  const long = String(destination || '').length > 9;
  return (
    <div className="relative h-32 w-full" role="img" aria-label={`The location was ${destination}`}>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 360 120" preserveAspectRatio="none" aria-hidden="true">
        <path d="M 78 10 L 334 10 Q 346 10 346 22 L 346 98 Q 346 110 334 110 L 78 110 L 44 86 L 24 86 Q 20 86 20 82 L 20 38 Q 20 34 24 34 L 44 34 L 78 10 Z" fill="#6b4226" />
        <path d="M 86 20 L 326 20 Q 336 20 336 30 L 336 90 Q 336 100 326 100 L 86 100 L 58 80 L 38 80 Q 34 80 34 76 L 34 44 Q 34 40 38 40 L 58 40 L 86 20 Z" fill="#f4eee2" />
        <path d="M 81 16 L 330 16 Q 341 16 341 27 L 341 93 Q 341 104 330 104 L 81 104 L 53 82 L 29 82 L 29 38 L 53 38 L 81 16 Z" fill="none" stroke="#8f6f42" strokeWidth="2" strokeDasharray="5,3" opacity="0.7" />
        <circle cx="48" cy="60" r="10" fill="#0b0d1c" stroke="#8f6f42" strokeWidth="2" />
      </svg>
      <div className="relative flex h-full items-center pl-[28%] pr-[8%] text-paper-ink">
        <div className="min-w-0">
          <TypeLabel className="text-paper-muted">Destination</TypeLabel>
          <p className={cn('break-words font-mono font-bold uppercase leading-tight', long ? 'text-2xl' : 'text-3xl')}>{destination}</p>
        </div>
      </div>
    </div>
  );
}

/** Secondary action printed on a case file (dashed "stamp" outline). */
export function PaperButton({ icon: Icon = null, className, children, ...rest }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex min-h-tap items-center justify-center gap-2 rounded-control border-2 border-dashed border-manila-line bg-manila-light/70 px-4 font-mono text-sm font-bold uppercase tracking-[0.12em] text-manila-ink transition-colors duration-150 hover:bg-manila-light disabled:cursor-not-allowed disabled:opacity-60',
        className
      )}
      {...rest}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
      {children}
    </button>
  );
}
