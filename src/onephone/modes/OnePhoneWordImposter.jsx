import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { RotateCcw, RotateCw } from 'lucide-react';
import PassAroundReveal from '../PassAroundReveal';
import { loadPassPlayPlayers, toGamePlayers } from '../passPlay';
import { dealWordImposter, maxImpostersFor, WORD_IMPOSTER_MIN_PLAYERS } from '../../games/wordImposter/logic';
import { pickRandom } from '../../lib/random';
import { GAMES } from '../../games/catalog';
import GameSettings from '../../components/GameSettings';
import { SecretFace, WinnerBanner } from '../../components/gameParts';
import { Avatar, Badge, Button, Card, ConfirmDialog, Screen, ScreenFooter, ScreenHeader, playerName } from '../../ui';

const game = GAMES.wordImposter;

export default function OnePhoneWordImposter() {
  const navigate = useNavigate();
  const players = useMemo(() => toGamePlayers(loadPassPlayPlayers()), []);
  const [rules, setRules] = useState({ imposterCount: 1, showCategory: true, imposterNoWord: false });
  const [dealt, setDealt] = useState(null);
  const [stage, setStage] = useState('setup'); // setup | reveal | describe | answer
  const [confirmReveal, setConfirmReveal] = useState(false);

  useEffect(() => {
    document.title = 'Word Imposter | Pass & Play';
  }, []);

  if (players.length === 0) return <Navigate to="/one-phone" replace />;

  const max = maxImpostersFor(players.length);
  const enough = players.length >= WORD_IMPOSTER_MIN_PLAYERS;
  const byUid = (uid) => players.find((p) => p.uid === uid) || { displayName: 'Someone' };

  const deal = () => {
    const next = dealWordImposter(players, { ...rules, imposterCount: Math.min(rules.imposterCount, max) }, null);
    setDealt({ ...next, firstPlayer: pickRandom(players)?.uid });
    setStage('reveal');
    setConfirmReveal(false);
  };

  const frame = (subtitle, children) => (
    <Screen
      header={(
        <ScreenHeader
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
          Everyone gets the same secret word, except the imposter. Take turns giving one clue each, then vote by pointing.
        </p>
        <Card padding="sm">
          <GameSettings
            type="wordImposter"
            rules={{ ...rules, imposterCount: Math.min(rules.imposterCount, max) }}
            playerCount={players.length}
            onChange={(patch) => setRules((prev) => ({ ...prev, ...patch }))}
          />
        </Card>
        <ScreenFooter>
          <Button size="lg" block disabled={!enough} onClick={deal}>
            {enough ? `Deal words to ${players.length} players` : `Needs ${WORD_IMPOSTER_MIN_PLAYERS} or more players`}
          </Button>
        </ScreenFooter>
      </div>
    ));
  }

  if (stage === 'reveal') {
    return frame('Secret words', (
      <PassAroundReveal
        players={players}
        title="Secret words"
        startLabel="Everyone has seen their word"
        onDone={() => setStage('describe')}
        renderSecret={(player) => {
          const isImposter = dealt.imposterIds.includes(player.uid);
          const noWord = isImposter && dealt.rules.imposterNoWord;
          return (
            <SecretFace
              accent="imposter"
              label={noWord ? 'You are the' : 'Your word'}
              value={noWord ? 'Imposter' : (isImposter ? dealt.imposterWordsByUid?.[player.uid] : dealt.word)}
              valueTone={noWord ? 'danger' : 'accent'}
              details={[
                dealt.rules.showCategory ? `Category: ${dealt.category}` : null,
                noWord ? 'Blend in, or work out the word.' : null
              ]}
            />
          );
        }}
      />
    ));
  }

  if (stage === 'describe') {
    const first = byUid(dealt.firstPlayer);
    const clockwise = dealt.direction === 'clockwise';
    return frame('Clues', (
      <div className="flex flex-1 flex-col justify-center gap-4 py-4">
        <Card className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-base font-medium text-ink-muted">First clue from</p>
          <Avatar player={first} size="xl" />
          <h2 className="break-words text-3xl font-bold text-ink">{playerName(first)}</h2>
          <Badge tone="imposter" icon={clockwise ? RotateCw : RotateCcw}>Then {clockwise ? 'clockwise' : 'anticlockwise'}</Badge>
          <p className="text-lg text-ink-muted">One clue each. Go round as often as you like, then vote by pointing on three.</p>
        </Card>
        <ScreenFooter>
          <Button size="lg" block onClick={() => setConfirmReveal(true)}>Reveal the imposter</Button>
        </ScreenFooter>
        <ConfirmDialog
          open={confirmReveal}
          title="Reveal the imposter?"
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
    ));
  }

  const imposterNames = dealt.imposterIds.map((uid) => playerName(byUid(uid))).join(', ');
  return frame('Round over', (
    <div className="flex flex-1 flex-col justify-center gap-4 py-4">
      <WinnerBanner
        accent="imposter"
        title={imposterNames}
        subtitle={dealt.imposterIds.length > 1 ? 'were the imposters' : 'was the imposter'}
      />
      <div className={dealt.imposterWord ? 'grid grid-cols-2 gap-3' : ''}>
        <Card padding="sm" className="text-center">
          <p className="text-sm font-medium text-ink-muted">The word</p>
          <p className="mt-1 break-words text-2xl font-bold text-imposter">{dealt.word}</p>
        </Card>
        {dealt.imposterWord && (
          <Card padding="sm" className="text-center">
            <p className="text-sm font-medium text-ink-muted">Imposter&apos;s word</p>
            <p className="mt-1 break-words text-2xl font-bold text-danger">{dealt.imposterWord}</p>
          </Card>
        )}
      </div>
      <ScreenFooter>
        <Button size="lg" block onClick={deal}>Play again</Button>
        <Button variant="secondary" block onClick={() => navigate('/one-phone')}>Back to Pass &amp; Play</Button>
      </ScreenFooter>
    </div>
  ));
}
