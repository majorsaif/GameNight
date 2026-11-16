import React, { useEffect, useMemo, useState } from 'react';
import { Eye } from 'lucide-react';
import { useAutoAdvance } from '../lib/activity';
import { Ballot, BallotRow } from './props';
import { Button, Notice, ScreenFooter, playerName } from '../ui';

const getPlayerUid = (player) => player?.uid || player?.id || null;

/**
 * Open voting used by every game, on a paper ballot: tick a player, confirm,
 * and watch the votes land. Closes itself 5 seconds after the last vote.
 */
export default function VotingPanel({
  players,
  requiredVoterUids = null,
  votes,
  currentUid,
  isHost,
  fallbackRank = 0,
  onVote,
  onEndVoting,
  paused = false,
  extraActions = null,
  subtitle = 'Mark one candidate',
  seconds = null
}) {
  const allPlayers = Array.isArray(players) ? players : [];
  const votesByVoter = votes && typeof votes === 'object' ? votes : {};

  const playersByUid = useMemo(() => {
    const entries = allPlayers
      .map((player) => [getPlayerUid(player), player])
      .filter(([uid]) => Boolean(uid));
    return new Map(entries);
  }, [allPlayers]);

  const confirmedTarget = currentUid ? votesByVoter[currentUid] ?? null : null;

  const [selectedTarget, setSelectedTarget] = useState(confirmedTarget);
  const [voteError, setVoteError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localConfirmed, setLocalConfirmed] = useState(Boolean(confirmedTarget));
  const [autoEndAt, setAutoEndAt] = useState(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const canVote = allPlayers.some((player) => getPlayerUid(player) === currentUid);
  const hasConfirmed = localConfirmed || confirmedTarget != null;
  const votableUids = useMemo(() => (
    Array.isArray(requiredVoterUids)
      ? requiredVoterUids
      : allPlayers.map((player) => getPlayerUid(player)).filter(Boolean)
  ), [allPlayers, requiredVoterUids]);
  const allVotesConfirmed = useMemo(() => {
    if (votableUids.length === 0) return false;
    return votableUids.every((uid) => votesByVoter[uid] != null);
  }, [votableUids, votesByVoter]);
  const votedCount = votableUids.filter((uid) => votesByVoter[uid] != null).length;

  useEffect(() => {
    if (confirmedTarget != null) {
      setSelectedTarget(confirmedTarget);
      setLocalConfirmed(true);
      return;
    }
    setLocalConfirmed(false);
  }, [confirmedTarget]);

  // Once everyone has voted, close the vote after a 5s countdown
  useEffect(() => {
    setAutoEndAt(allVotesConfirmed ? Date.now() + 5000 : null);
  }, [allVotesConfirmed]);

  useEffect(() => {
    if (!autoEndAt) return undefined;
    const id = setInterval(() => setNowTick(Date.now()), 250);
    return () => clearInterval(id);
  }, [autoEndAt]);

  const autoEndSeconds = autoEndAt ? Math.max(0, Math.ceil((autoEndAt - nowTick) / 1000)) : null;

  useAutoAdvance({
    key: autoEndAt,
    dueAt: autoEndAt,
    isHost,
    fallbackRank,
    advance: () => onEndVoting?.()
  });

  const handleSelectTarget = (targetUid) => {
    if (!canVote || hasConfirmed || paused) return;
    setSelectedTarget(targetUid);
    if (voteError) setVoteError('');
  };

  const handleConfirmVote = async () => {
    if (!canVote || hasConfirmed || !selectedTarget || isSubmitting) return;

    if (selectedTarget === currentUid) {
      setVoteError("You can't vote for yourself.");
      return;
    }

    try {
      setIsSubmitting(true);
      await onVote?.(selectedTarget);
      setLocalConfirmed(true);
      setVoteError('');
    } catch {
      setVoteError("Couldn't send your vote. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const status = paused
    ? 'Voting is paused'
    : allVotesConfirmed && autoEndSeconds != null
      ? `All votes are in. Counting in ${autoEndSeconds}s`
      : `${votedCount} of ${votableUids.length} voted`;

  return (
    <div className="flex flex-col gap-4">
      {!canVote && <Notice icon={Eye}>You&apos;re watching this vote.</Notice>}

      <Ballot subtitle={subtitle} seconds={seconds} status={status} stamped={hasConfirmed && canVote}>
        {allPlayers.map((player) => {
          const candidateUid = getPlayerUid(player);
          if (!candidateUid) return null;
          const voters = Object.entries(votesByVoter)
            .filter(([, targetUid]) => targetUid === candidateUid)
            .map(([voterUid]) => playersByUid.get(voterUid))
            .filter(Boolean);
          const isSelf = candidateUid === currentUid;
          return (
            <BallotRow
              key={candidateUid}
              player={player}
              suffix={isSelf ? ' (you)' : ''}
              selected={canVote && selectedTarget === candidateUid}
              disabled={!canVote || hasConfirmed || paused || isSelf}
              mark={canVote}
              onClick={() => handleSelectTarget(candidateUid)}
              voters={voters}
              count={voters.length}
            />
          );
        })}
      </Ballot>

      {voteError && <p role="alert" className="text-center text-sm text-danger">{voteError}</p>}

      <ScreenFooter>
        {canVote && (
          <Button
            size="lg"
            block
            onClick={handleConfirmVote}
            disabled={hasConfirmed || !selectedTarget || paused}
            loading={isSubmitting}
          >
            {hasConfirmed ? 'Vote cast' : selectedTarget ? `Vote for ${playerName(playersByUid.get(selectedTarget))}` : 'Tick a name to vote'}
          </Button>
        )}
        {isHost && (
          <Button variant="secondary" block onClick={onEndVoting} disabled={paused}>Close the ballot</Button>
        )}
        {extraActions}
      </ScreenFooter>
    </div>
  );
}
