import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  onEndVoting,
  theme = 'default',
  timerLabel = 'TIME REMAINING',
  timerValue = null,
  title,
  subtitle
}) {
  const allPlayers = Array.isArray(players) ? players : [];
  const votesByVoter = votes && typeof votes === 'object' ? votes : {};
  const isBallotTheme = theme === 'ballot';
  const panelTitle = title || (isBallotTheme ? 'OFFICIAL BALLOT' : 'Voting');
  const panelSubtitle = subtitle || (isBallotTheme ? 'Cast your vote - mark one candidate' : null);

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
  const [autoEndSeconds, setAutoEndSeconds] = useState(null);
  const autoEndTriggeredRef = useRef(false);
  const onEndVotingRef = useRef(onEndVoting);

  const canVote = allPlayers.some((player) => getPlayerUid(player) === currentUid);
  const hasConfirmed = localConfirmed || confirmedTarget != null;
  const votableUids = useMemo(
    () => allPlayers.map((player) => getPlayerUid(player)).filter(Boolean),
    [allPlayers]
  );
  const allVotesConfirmed = useMemo(() => {
    if (votableUids.length === 0) return false;
    return votableUids.every((uid) => votesByVoter[uid] != null);
  }, [votableUids, votesByVoter]);

  useEffect(() => {
    onEndVotingRef.current = onEndVoting;
  }, [onEndVoting]);

  useEffect(() => {
    if (confirmedTarget != null) {
      setSelectedTarget(confirmedTarget);
      setLocalConfirmed(true);
      return;
    }

    setLocalConfirmed(false);
  }, [confirmedTarget]);

  useEffect(() => {
    if (!allVotesConfirmed) {
      setAutoEndSeconds(null);
      autoEndTriggeredRef.current = false;
      return;
    }

    setAutoEndSeconds(5);
    autoEndTriggeredRef.current = false;
  }, [allVotesConfirmed]);

  useEffect(() => {
    if (!allVotesConfirmed || autoEndSeconds == null || autoEndSeconds <= 0) return;

    const timeoutId = setTimeout(() => {
      setAutoEndSeconds((seconds) => {
        if (seconds == null) return null;
        return Math.max(0, seconds - 1);
      });
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [allVotesConfirmed, autoEndSeconds]);

  useEffect(() => {
    if (!isHost || !allVotesConfirmed || autoEndSeconds !== 0) return;
    if (autoEndTriggeredRef.current) return;

    autoEndTriggeredRef.current = true;
    Promise.resolve(onEndVotingRef.current?.()).catch(() => {});
  }, [isHost, allVotesConfirmed, autoEndSeconds]);

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

  if (isBallotTheme) {
    return (
      <div className="relative bg-[#f5f0e8] border-2 border-[#bfae95] rounded-xl p-4 shadow-[0_8px_24px_rgba(0,0,0,0.3)] text-[#3f3127] overflow-hidden">
        {hasConfirmed && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <div
              className="border-4 border-red-700 px-6 py-2 text-red-700 text-5xl font-black uppercase tracking-[0.2em] opacity-35"
              style={{ transform: 'rotate(-15deg)' }}
            >
              VOTED
            </div>
          </div>
        )}

        <div className="text-center mb-4">
          <h3 className="font-serif text-[#3f3127] text-2xl font-black uppercase tracking-wide">{panelTitle}</h3>
          {panelSubtitle && (
            <p className="mt-1 text-sm italic text-[#5a4837]">{panelSubtitle}</p>
          )}
          <div className="border-t border-[#5a4837] mt-3" />
        </div>

        {timerValue != null && (
          <div className="text-center mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5a4837]">{timerLabel}</p>
            <p className="text-3xl font-black font-serif text-[#3f3127]">{timerValue}</p>
          </div>
        )}

        {allVotesConfirmed && autoEndSeconds != null && (
          <div className="bg-[#ece2d2] border border-[#c8b89f] rounded-lg p-3 text-center mb-4">
            <p className="text-[#4a3a2b] text-sm font-semibold">
              All votes confirmed. Ending in {autoEndSeconds}s...
            </p>
          </div>
        )}

        <div className="mb-4 overflow-hidden rounded-lg border border-[#ccbda6] bg-[#f8f3ea]">
          {allPlayers.map((player, index) => {
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
            const rowDisabled = !canVote || hasConfirmed;

            return (
              <button
                key={candidateUid}
                type="button"
                onClick={() => handleSelectTarget(candidateUid)}
                disabled={rowDisabled}
                className={`w-full text-left px-3 py-3 transition-colors ${
                  index > 0 ? 'border-t border-[#d5c7b2]' : ''
                } ${
                  isSelected ? 'bg-[#eadfcf]' : 'bg-[#f8f3ea]'
                } ${
                  rowDisabled ? 'opacity-60 cursor-not-allowed' : 'hover:bg-[#efe3cf]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-1 inline-flex h-6 w-6 items-center justify-center border-2 text-sm font-black ${
                      isSelected
                        ? 'bg-[#3f3127] border-[#3f3127] text-[#f5f0e8]'
                        : 'bg-[#fdfaf3] border-[#5a4837] text-transparent'
                    }`}
                  >
                    {isSelected ? '✓' : ''}
                  </span>

                  {candidatePhoto ? (
                    <img
                      src={candidatePhoto}
                      alt={getPlayerName(player)}
                      className="w-11 h-11 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full border border-[#bfae95] bg-[#decfb8] flex items-center justify-center text-[#3f3127] font-bold">
                      {getInitials(getPlayerName(player))}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[#2f241c] font-mono font-semibold truncate">
                        {getPlayerName(player)} {isCurrentUser ? '(You)' : ''}
                      </span>
                      <span className="inline-flex items-center justify-center min-w-8 h-8 px-2 rounded-full bg-[#3f3127] text-[#f5f0e8] text-sm font-bold">
                        {candidateVoteCount}
                      </span>
                    </div>

                    <div className="flex items-center mt-2 min-h-7">
                      {candidateVotes.map((voter, voteIndex) => {
                        const voterUid = getPlayerUid(voter);
                        const voterPhoto = getPlayerPhoto(voter);
                        const overlapClass = voteIndex > 0 ? '-ml-2' : '';
                        const voterName = getPlayerName(voter);

                        return voterPhoto ? (
                          <img
                            key={voterUid}
                            src={voterPhoto}
                            alt={voterName}
                            className={`w-7 h-7 rounded-full border-2 border-[#f5f0e8] object-cover ${overlapClass}`}
                            title={voterName}
                          />
                        ) : (
                          <div
                            key={voterUid}
                            className={`w-7 h-7 rounded-full border-2 border-[#f5f0e8] bg-[#d7c8b2] flex items-center justify-center text-[10px] text-[#3f3127] font-bold ${overlapClass}`}
                            title={voterName}
                          >
                            {getInitials(voterName)}
                          </div>
                        );
                      })}
                    </div>
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
              className="w-full border-2 border-[#4a3a2b] bg-[#f5f0e8] hover:bg-[#ece1cf] disabled:bg-[#ddd2c2] text-[#3f3127] disabled:text-[#867a6b] font-black uppercase tracking-[0.16em] py-3 rounded-md shadow-[0_3px_0_#4a3a2b] active:translate-y-[2px] active:shadow-none transition-all"
            >
              {isSubmitting ? 'STAMPING...' : 'CONFIRM VOTE'}
            </button>

            {voteError && <p className="text-red-800 text-sm text-center mt-2 font-semibold">{voteError}</p>}
          </>
        )}

        {hasConfirmed && (
          <p className="text-center text-[#4b3b2d] font-semibold mt-2">Vote confirmed. Waiting for others...</p>
        )}

        {isHost && (
          <button
            onClick={onEndVoting}
            className="w-full mt-3 border-2 border-red-700 bg-[#f5f0e8] hover:bg-[#f0e3d6] text-red-700 font-black uppercase tracking-[0.16em] py-3 rounded-md transition-colors"
          >
            CLOSE BALLOT
          </button>
        )}
      </div>
    );
  }

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

      {allVotesConfirmed && autoEndSeconds != null && (
        <div className="bg-slate-700/40 border border-slate-600 rounded-xl p-3 text-center mb-4">
          <p className="text-slate-200 text-sm font-semibold">
            All votes confirmed. Ending in {autoEndSeconds}s...
          </p>
        </div>
      )}

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
          <p className="text-violet-300 font-semibold">Vote confirmed. Waiting for others...</p>
        </div>
      )}
    </div>
  );
}
