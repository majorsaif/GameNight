import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, EllipsisVertical, OctagonX } from 'lucide-react';
import { ACCENT_TINT } from '../games/catalog';
import RulesSheet from './RulesSheet';
import { ConfirmDialog, IconButton, LoadingScreen, Screen, Sheet, cn } from '../ui';

export function GameLoading({ label = 'Loading game' }) {
  return <LoadingScreen label={label} />;
}

function MenuRow({ icon: Icon, tone = 'default', children, ...rest }) {
  return (
    <button
      type="button"
      className={cn(
        'flex min-h-14 w-full items-center gap-3 rounded-control px-3 text-left text-base font-medium transition-colors duration-150 hover:bg-surface-raised',
        tone === 'danger' ? 'text-danger' : 'text-ink'
      )}
      {...rest}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      {children}
    </button>
  );
}

/**
 * Frame for every in-game screen: the game's name and current phase at the
 * top, and a menu so players can always get back to the room, re-read the
 * rules, or (host only) end a game that's gone wrong.
 */
export default function GameShell({
  roomId,
  isHost,
  game: gameProp,
  gameName,
  subtitle = null,
  tone = 'default',
  width = 'column',
  center = false,
  phaseKey,
  onEndGame,
  children
}) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  // `gameName` is the old API, still used by games not yet rebuilt
  const game = gameProp || { name: gameName, icon: BookOpen, accent: 'mafia', rules: null };
  const Icon = game.icon;
  const night = tone === 'night';

  return (
    <Screen
      tone={tone}
      width={width}
      header={(
        <header className={cn('sticky top-0 z-30 pt-safe transition-colors duration-300', night ? 'bg-black' : 'bg-bg/95 backdrop-blur')}>
          <div className={cn('mx-auto flex h-16 w-full max-w-column items-center gap-3 px-safe', width === 'wide' && 'md:max-w-wide')}>
            <span className={cn('inline-flex h-tap w-tap shrink-0 items-center justify-center rounded-full', ACCENT_TINT[game.accent])}>
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-semibold text-ink">{game.name}</h1>
              {subtitle && <p className="truncate text-sm text-ink-muted">{subtitle}</p>}
            </div>
            <IconButton icon={EllipsisVertical} label="Game menu" aria-haspopup="dialog" onClick={() => setMenuOpen(true)} />
          </div>
        </header>
      )}
    >
      <div key={phaseKey} className={cn('flex flex-1 animate-enter flex-col pt-2', center && 'justify-center')}>
        {children}
      </div>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Game menu">
        <div className="flex flex-col gap-1">
          <MenuRow icon={ArrowLeft} onClick={() => navigate(`/room/${roomId}`)}>Back to room</MenuRow>
          <MenuRow
            icon={BookOpen}
            onClick={() => {
              setMenuOpen(false);
              setRulesOpen(true);
            }}
          >
            How to play
          </MenuRow>
          {isHost && (
            <MenuRow
              icon={OctagonX}
              tone="danger"
              onClick={() => {
                setMenuOpen(false);
                setConfirmEnd(true);
              }}
            >
              End game for everyone
            </MenuRow>
          )}
        </div>
      </Sheet>

      <RulesSheet open={rulesOpen} onClose={() => setRulesOpen(false)} rules={game.rules} />

      <ConfirmDialog
        open={confirmEnd}
        title={`End ${game.name}?`}
        message="This ends the game for everyone and takes the room back to choosing a game."
        confirmLabel="End game"
        cancelLabel="Keep playing"
        tone="danger"
        onCancel={() => setConfirmEnd(false)}
        onConfirm={async () => {
          setConfirmEnd(false);
          await onEndGame?.();
          navigate(`/room/${roomId}`);
        }}
      />
    </Screen>
  );
}
