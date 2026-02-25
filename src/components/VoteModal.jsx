import React, { useState } from 'react';

export default function VoteModal({ room, onClose, onStartVote }) {
  const [step, setStep] = useState('choose'); // 'choose', 'playerVote', 'customPoll'
  const [question, setQuestion] = useState('');
  
  // Player Vote state
  const [selectedPlayers, setSelectedPlayers] = useState(
    room.players.map(p => p.id)
  );
  
  // Custom Poll state
  const [customOptions, setCustomOptions] = useState(['', '']);

  const handleStartPlayerVote = () => {
    if (!question.trim() || selectedPlayers.length < 2) return;
    
    const options = room.players
      .filter(p => selectedPlayers.includes(p.id))
      .map(p => ({
        id: p.id,
        label: p.displayNameForGame || p.displayName
      }));
    
    onStartVote({
      type: 'playerVote',
      question: question.trim(),
      options,
      votes: {}
    });
    onClose();
  };

  const handleStartCustomPoll = () => {
    const validOptions = customOptions.filter(opt => opt.trim());
    if (!question.trim() || validOptions.length < 2) return;
    
    const options = validOptions.map((label, index) => ({
      id: `option-${index}`,
      label: label.trim()
    }));
    
    onStartVote({
      type: 'customPoll',
      question: question.trim(),
      options,
      votes: {}
    });
    onClose();
  };

  const togglePlayer = (playerId) => {
    if (selectedPlayers.includes(playerId)) {
      // Don't allow removing if only 2 players left
      if (selectedPlayers.length <= 2) return;
      setSelectedPlayers(selectedPlayers.filter(id => id !== playerId));
    } else {
      setSelectedPlayers([...selectedPlayers, playerId]);
    }
  };

  const addCustomOption = () => {
    if (customOptions.length < 6) {
      setCustomOptions([...customOptions, '']);
    }
  };

  const removeCustomOption = (index) => {
    if (customOptions.length > 2) {
      setCustomOptions(customOptions.filter((_, i) => i !== index));
    }
  };

  const updateCustomOption = (index, value) => {
    const newOptions = [...customOptions];
    newOptions[index] = value;
    setCustomOptions(newOptions);
  };

  if (step === 'choose') {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-md w-full">
          <h3 className="text-white text-2xl font-bold mb-6 text-center">Start a Vote</h3>
          
          <div className="space-y-3">
            <button
              onClick={() => setStep('playerVote')}
              className="w-full bg-gradient-to-br from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-xl p-6 text-left shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5"
            >
              <div className="flex items-center gap-4">
                <div className="text-4xl">👥</div>
                <div>
                  <div className="font-bold text-lg">Player Vote</div>
                  <div className="text-violet-200 text-sm mt-1">Vote for players in the room</div>
                </div>
              </div>
            </button>

            <button
              onClick={() => setStep('customPoll')}
              className="w-full bg-slate-700/50 border border-slate-600 hover:bg-slate-700 hover:border-slate-500 text-white rounded-xl p-6 text-left shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5"
            >
              <div className="flex items-center gap-4">
                <div className="text-4xl">📝</div>
                <div>
                  <div className="font-bold text-lg">Custom Poll</div>
                  <div className="text-slate-400 text-sm mt-1">Create custom answer options</div>
                </div>
              </div>
            </button>
          </div>

          <button
            onClick={onClose}
            className="w-full mt-6 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (step === 'playerVote') {
    const excludedPlayers = room.players.filter(p => !selectedPlayers.includes(p.id));
    const canRemove = selectedPlayers.length > 2;

    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-md w-full my-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-white text-xl font-bold">Player Vote</h3>
            <button
              onClick={() => setStep('choose')}
              className="text-slate-400 hover:text-slate-300 transition-colors"
            >
              <span className="text-2xl">←</span>
            </button>
          </div>

          {/* Question Input */}
          <div className="mb-6">
            <label className="text-slate-300 text-sm font-medium mb-2 block">Question</label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g., Who was the worst at that round?"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              autoFocus
            />
          </div>

          {/* Selected Players */}
          <div className="mb-4">
            <label className="text-slate-300 text-sm font-medium mb-2 block">
              Vote Options ({selectedPlayers.length})
            </label>
            <div className="space-y-2">
              {room.players
                .filter(p => selectedPlayers.includes(p.id))
                .map(player => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-700"
                  >
                    <span className="text-slate-200 font-medium">
                      {player.displayNameForGame || player.displayName}
                    </span>
                    <button
                      onClick={() => togglePlayer(player.id)}
                      disabled={!canRemove}
                      className={`text-xl ${
                        canRemove
                          ? 'text-red-400 hover:text-red-300 cursor-pointer'
                          : 'text-slate-600 cursor-not-allowed'
                      } transition-colors`}
                      title={canRemove ? 'Remove' : 'Minimum 2 options required'}
                    >
                      ✕
                    </button>
                  </div>
                ))}
            </div>
          </div>

          {/* Excluded Players */}
          {excludedPlayers.length > 0 && (
            <div className="mb-6">
              <label className="text-slate-500 text-sm font-medium mb-2 block">
                Excluded
              </label>
              <div className="space-y-2">
                {excludedPlayers.map(player => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between p-3 bg-slate-900/30 rounded-lg border border-slate-700/50"
                  >
                    <span className="text-slate-500 font-medium">
                      {player.displayNameForGame || player.displayName}
                    </span>
                    <button
                      onClick={() => togglePlayer(player.id)}
                      className="text-xl text-green-400 hover:text-green-300 transition-colors"
                      title="Add back"
                    >
                      +
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleStartPlayerVote}
              disabled={!question.trim() || selectedPlayers.length < 2}
              className="flex-1 px-4 py-3 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-600 disabled:text-slate-500 text-white rounded-lg font-bold transition-colors disabled:cursor-not-allowed"
            >
              Start Vote
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'customPoll') {
    const validOptions = customOptions.filter(opt => opt.trim()).length;
    const canStart = question.trim() && validOptions >= 2;
    const canAddMore = customOptions.length < 6;

    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-md w-full my-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-white text-xl font-bold">Custom Poll</h3>
            <button
              onClick={() => setStep('choose')}
              className="text-slate-400 hover:text-slate-300 transition-colors"
            >
              <span className="text-2xl">←</span>
            </button>
          </div>

          {/* Question Input */}
          <div className="mb-6">
            <label className="text-slate-300 text-sm font-medium mb-2 block">Question</label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g., What movie should we watch?"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              autoFocus
            />
          </div>

          {/* Custom Options */}
          <div className="mb-4">
            <label className="text-slate-300 text-sm font-medium mb-2 block">
              Options ({validOptions}/6)
            </label>
            <div className="space-y-2 mb-3">
              {customOptions.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={option}
                    onChange={(e) => updateCustomOption(index, e.target.value)}
                    placeholder={`Option ${index + 1}`}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  />
                  {customOptions.length > 2 && (
                    <button
                      onClick={() => removeCustomOption(index)}
                      className="text-xl text-red-400 hover:text-red-300 transition-colors px-2"
                      title="Remove"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>

            {canAddMore && (
              <button
                onClick={addCustomOption}
                className="w-full py-2 bg-slate-700/50 border border-slate-600 hover:bg-slate-700 text-slate-300 rounded-lg font-medium transition-colors"
              >
                + Add Option
              </button>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleStartCustomPoll}
              disabled={!canStart}
              className="flex-1 px-4 py-3 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-600 disabled:text-slate-500 text-white rounded-lg font-bold transition-colors disabled:cursor-not-allowed"
            >
              Start Vote
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
