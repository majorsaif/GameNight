import React, { useEffect, useMemo, useState } from 'react';
import { getInitials } from '../utils/avatar';

const getPlayerUid = (player) => player?.uid || player?.id || null;

const getPlayerName = (player) => player?.displayNameForGame || player?.displayName || 'Unknown';

const getPlayerPhoto = (player) => player?.photo || player?.photoURL || null;

export default function VotingPanel({
  players,
  votes,
  currentUid,
  isHost,
  onVote,
  onEndVoting
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

  const canVote = allPlayers.some((player) => getPlayerUid(player) === currentUid);
  const hasConfirmed = localConfirmed || confirmedTarget != null;

  useEffect(() => {
    if (confirmedTarget != null) {
      setSelectedTarget(confirmedTarget);
      setLocalConfirmed(true);
      return;
    }

    setLocalConfirmed(false);
  }, [confirmedTarget]);

  const handleSelectTarget = (targetUid) => {
    if (!canVote || hasConfirmed) return;
    setSelectedTarget(targetUid);
    if (voteError) {
      setVoteError('');
    }
  };

  const handleConfirmVote = async () => {
    if (!canVote || hasConfirmed || !selectedTarget || isSubmitting) return;

    if (selectedTarget === currentUid) {
      setVoteError('You cannot vote for yourself');
      return;
    }

    try {
      setIsSubmitting(true);
      await onVote?.(selectedTarget);
      setLocalConfirmed(true);
      setVoteError('');
    } catch (error) {
      setVoteError('Could not confirm vote. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold text-lg">Voting</h3>
        {isHost && (
          <button
            onClick={onEndVoting}
            className="px-3 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold rounded-lg transition-colors"
          >
            End Voting
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 mb-4">
        {allPlayers.map((player) => {
          const candidateUid = getPlayerUid(player);
          if (!candidateUid) return null;

          const candidateVotes = Object.entries(votesByVoter)
            .filter(([, targetUid]) => targetUid === candidateUid)
            .map(([voterUid]) => playersByUid.get(voterUid))
            .filter(Boolean);

          const candidateVoteCount = candidateVotes.length;
          const candidatePhoto = getPlayerPhoto(player);
          const isSelected = selectedTarget === candidateUid;
          const isCurrentUser = candidateUid === currentUid;

          return (
            <button
              key={candidateUid}
              type="button"
              onClick={() => handleSelectTarget(candidateUid)}
              disabled={!canVote || hasConfirmed}
              className={`flex items-start gap-3 rounded-xl p-4 transition-all ${
                isSelected
                  ? 'bg-violet-600 ring-2 ring-white'
                  : 'bg-slate-800/50 hover:bg-slate-700'
              } ${(!canVote || hasConfirmed) ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {candidatePhoto ? (
                <img
                  src={candidatePhoto}
                  alt={getPlayerName(player)}
                  className="w-12 h-12 rounded-full object-cover"
                />
              ) : (
                <div className={`w-12 h-12 ${player.avatarColor || 'bg-slate-600'} rounded-full flex items-center justify-center text-white font-bold`}>
                  {getInitials(getPlayerName(player))}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-white font-semibold truncate">
                    {getPlayerName(player)} {isCurrentUser ? '(You)' : ''}
                  </span>
                  <span className="inline-flex items-center justify-center min-w-8 h-8 px-2 rounded-full bg-slate-700 text-slate-200 text-sm font-bold">
                    {candidateVoteCount}
                  </span>
                </div>

                <div className="flex items-center mt-2">
                  {candidateVotes.map((voter, index) => {
                    const voterUid = getPlayerUid(voter);
                    const voterPhoto = getPlayerPhoto(voter);
                    const overlapClass = index > 0 ? '-ml-2' : '';
                    const voterName = getPlayerName(voter);

                    return voterPhoto ? (
                      <img
                        key={voterUid}
                        src={voterPhoto}
                        alt={voterName}
                        className={`w-7 h-7 rounded-full border-2 border-slate-900 object-cover ${overlapClass}`}
                        title={voterName}
                      />
                    ) : (
                      <div
                        key={voterUid}
                        className={`w-7 h-7 ${voter.avatarColor || 'bg-slate-600'} rounded-full border-2 border-slate-900 flex items-center justify-center text-[10px] text-white font-bold ${overlapClass}`}
                        title={voterName}
                      >
                        {getInitials(voterName)}
                      </div>
                    );
                  })}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {canVote && !hasConfirmed && (
        <>
          <button
            type="button"
            onClick={handleConfirmVote}
            disabled={!selectedTarget || isSubmitting}
            className="w-full bg-white hover:bg-slate-200 disabled:bg-slate-600 text-slate-900 disabled:text-slate-400 font-bold py-4 rounded-xl transition-colors"
          >
            {isSubmitting ? 'Confirming...' : 'Confirm Vote'}
          </button>

          {voteError && <p className="text-red-400 text-sm text-center mt-2">{voteError}</p>}
        </>
      )}

      {hasConfirmed && (
        <div className="bg-slate-700/40 border border-slate-600 rounded-xl p-4 text-center mt-3">
          <p className="text-violet-300 font-semibold">Vote confirmed ✅ Waiting for others</p>
        </div>
      )}
    </div>
  );
}
