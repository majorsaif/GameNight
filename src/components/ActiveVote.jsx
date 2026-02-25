import React from 'react';

export default function ActiveVote({ activity, room, userId, isHost, onVote, onEndVote }) {
  const userVote = activity.votes?.[userId];

  // Calculate results
  const results = {};
  activity.options.forEach(option => {
    results[option.id] = {
      count: 0,
      percentage: 0,
      voters: []
    };
  });

  if (activity.votes) {
    const totalVotes = Object.keys(activity.votes).length;
    Object.entries(activity.votes).forEach(([voterId, optionId]) => {
      if (results[optionId]) {
        results[optionId].count++;
        results[optionId].voters.push(voterId);
        results[optionId].percentage = totalVotes > 0 
          ? Math.round((results[optionId].count / totalVotes) * 100)
          : 0;
      }
    });
  }

  const totalVotes = Object.values(results).reduce((sum, r) => sum + r.count, 0);

  return (
    <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-slate-300">
          {activity.type === 'playerVote' ? '👥' : '📝'} Active Poll
        </h3>
        {isHost && (
          <button
            onClick={onEndVote}
            className="px-3 py-1 bg-red-600/20 border border-red-500/50 hover:bg-red-600/30 text-red-400 text-xs font-bold rounded-full transition-colors"
          >
            End Vote
          </button>
        )}
      </div>

      {/* Question */}
      <div className="mb-6">
        <p className="text-white text-lg font-semibold">{activity.question}</p>
        {totalVotes > 0 && (
          <p className="text-slate-400 text-sm mt-2">
            {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'} • {room.players.length - totalVotes} pending
          </p>
        )}
      </div>

      {/* Options */}
      <div className="space-y-3">
        {activity.options.map(option => {
          const result = results[option.id];
          const isSelected = userVote === option.id;
          
          // Always show clickable results with bars - allow vote changing
          return (
            <button
              key={option.id}
              onClick={() => onVote(option.id)}
              className={`w-full relative overflow-hidden p-4 rounded-xl border-2 transition-all hover:-translate-y-0.5 ${
                isSelected
                  ? 'bg-violet-600/20 border-violet-500 hover:border-violet-400'
                  : 'bg-slate-900/50 border-slate-700 hover:border-slate-600'
              }`}
            >
              {/* Progress bar background */}
              {result.count > 0 && (
                <div
                  className={`absolute inset-0 transition-all duration-500 ${
                    isSelected ? 'bg-violet-600/30' : 'bg-slate-700/30'
                  }`}
                  style={{ width: `${result.percentage}%` }}
                />
              )}

              {/* Content */}
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isSelected && (
                    <span className="text-violet-400 text-xl">✓</span>
                  )}
                  <span className={`font-medium ${
                    isSelected ? 'text-violet-200' : 'text-white'
                  }`}>
                    {option.label}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-bold ${
                    isSelected ? 'text-violet-300' : 'text-slate-400'
                  }`}>
                    {result.percentage}%
                  </span>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                    isSelected
                      ? 'bg-violet-600 text-white'
                      : 'bg-slate-700 text-slate-300'
                  }`}>
                    {result.count}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
