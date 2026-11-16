import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Megaphone, Settings2 } from 'lucide-react';
import { GAMES } from '../../games/catalog';
import { maxMafiaFor } from '../../games/mafia/logic';
import GameSettings, { summarizeRules } from '../../components/GameSettings';
import { CaseFile, Paper, PaperButton, PaperRule, Stamp, TypeLabel } from '../../components/props';
import { Avatar, Button, EmptyState, Screen, ScreenHeader, Sheet, cn } from '../../ui';

const game = GAMES.mafia;

export default function OnePhoneMafiaLobby({ players = [] }) {
  const navigate = useNavigate();
  const activePlayers = Array.isArray(players) ? players : [];
  const [rules, setRules] = useState({ mafiaCount: 1, doctorEnabled: true, detectiveEnabled: true });
  const [narratorId, setNarratorId] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    document.title = 'Mafia | Pass & Play';
  }, []);

  const narrator = useMemo(
    () => activePlayers.find((player) => player.id === narratorId) || null,
    [activePlayers, narratorId]
  );

  // The narrator runs the game and doesn't get a role, so count everyone else
  const rolePlayerCount = Math.max(0, activePlayers.length - (narrator ? 1 : 0));
  const maxMafia = maxMafiaFor(rolePlayerCount);
  const mafiaCount = Math.min(Number(rules.mafiaCount) || 1, maxMafia);
  const canStart = Boolean(narrator) && rolePlayerCount >= game.minPlayers;

  const handleStartGame = () => {
    if (!canStart || !narrator) return;

    const activeGamePlayers = activePlayers.filter((player) => player.id !== narrator.id);
    navigate('/one-phone/mafia', {
      state: {
        started: true,
        players: activeGamePlayers,
        narrator,
        rules: {
          mafiaCount,
          doctorEnabled: Boolean(rules.doctorEnabled),
          detectiveEnabled: Boolean(rules.detectiveEnabled)
        }
      }
    });
  };

  const startLabel = !narrator
    ? 'Choose a narrator to start'
    : rolePlayerCount < game.minPlayers
      ? `Needs ${game.minPlayers} players besides the narrator`
      : `Hand out roles to ${rolePlayerCount} players`;

  return (
    <Screen
      header={(
        <ScreenHeader
          title={game.name}
          subtitle="Pass & Play"
          onBack={() => navigate('/one-phone/games', { state: { players: activePlayers } })}
          backLabel="Back to games"
        />
      )}
      footer={<Button size="lg" block disabled={!canStart} onClick={handleStartGame}>{startLabel}</Button>}
    >
      <div className="flex animate-enter flex-col gap-section pt-2">
        <p className="text-base text-ink-muted">
          One of you narrates and keeps the phone during the night. Everyone else gets a secret role.
        </p>

        {activePlayers.length === 0 ? (
          <EmptyState icon={Megaphone} title="No players yet" message="Go back and add the people who are playing." />
        ) : (
          <CaseFile
            name={game.name}
            meta={summarizeRules('mafia', { mafiaCount, doctor: rules.doctorEnabled, detective: rules.detectiveEnabled }).slice(0, 3).join(' · ')}
            action={<PaperButton icon={Settings2} onClick={() => setShowSettings(true)} className="px-3">Edit</PaperButton>}
          >
            <Paper tone="insert" padding="sm">
              <TypeLabel>Choose the narrator</TypeLabel>
              <PaperRule className="mb-1" />
              <ul className="divide-y divide-manila-line/30">
                {activePlayers.map((player) => {
                  const selected = narratorId === player.id;
                  return (
                    <li key={player.id}>
                      <button
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setNarratorId((current) => (current === player.id ? '' : player.id))}
                        className={cn(
                          'flex min-h-14 w-full items-center gap-3 rounded-sm px-1 py-2 text-left transition-colors duration-150',
                          selected ? 'bg-manila/40' : 'hover:bg-manila/25'
                        )}
                      >
                        <Avatar player={player} size="sm" />
                        <span className="min-w-0 flex-1 truncate font-mono text-base font-bold uppercase">{player.displayName}</span>
                        {selected && <Stamp tone="red" tilt="right">Narrator</Stamp>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Paper>
            <p className="font-mono text-sm">
              {narrator
                ? `${rolePlayerCount} agents get a role. ${narrator.displayName} runs the night.`
                : 'Tap a name to make them the narrator.'}
            </p>
          </CaseFile>
        )}
      </div>

      <Sheet
        open={showSettings}
        onClose={() => setShowSettings(false)}
        title="Mafia settings"
        footer={<Button block onClick={() => setShowSettings(false)}>Done</Button>}
      >
        <GameSettings
          type="mafia"
          timed={false}
          playerCount={rolePlayerCount}
          rules={{ mafiaCount, doctor: rules.doctorEnabled, detective: rules.detectiveEnabled }}
          onChange={(patch) => setRules((prev) => ({
            mafiaCount: patch.mafiaCount ?? prev.mafiaCount,
            doctorEnabled: patch.doctor ?? prev.doctorEnabled,
            detectiveEnabled: patch.detective ?? prev.detectiveEnabled
          }))}
        />
      </Sheet>
    </Screen>
  );
}
