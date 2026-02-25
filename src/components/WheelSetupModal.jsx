import React, { useState } from 'react';
import { getAvatarColor, getInitials } from '../utils/avatar';

export default function WheelSetupModal({ room, onLaunch, onClose }) {
  const [wheelType, setWheelType] = useState(null); // null, 'player', 'custom'
  const [excludedPlayerIds, setExcludedPlayerIds] = useState([]);
  const [customOptions, setCustomOptions] = useState(['', '']);

  const availablePlayers = room.players.filter(p => !excludedPlayerIds.includes(p.id));
  const excludedPlayers = room.players.filter(p => excludedPlayerIds.includes(p.id));

  const handleExcludePlayer = (playerId) => {
    if (availablePlayers.length > 2) {
      setExcludedPlayerIds([...excludedPlayerIds, playerId]);
    }
  };

  const handleIncludePlayer = (playerId) => {
    setExcludedPlayerIds(excludedPlayerIds.filter(id => id !== playerId));
  };

  const handleAddCustomOption = () => {
    if (customOptions.length < 8) {
      setCustomOptions([...customOptions, '']);
    }
  };

  const handleRemoveCustomOption = (index) => {
    if (customOptions.length > 2) {
      setCustomOptions(customOptions.filter((_, i) => i !== index));
    }
  };

  const handleCustomOptionChange = (index, value) => {
    const newOptions = [...customOptions];
    newOptions[index] = value;
    setCustomOptions(newOptions);
  };

  const handleLaunch = () => {
    if (wheelType === 'player') {
      const options = availablePlayers.map((player, index) => ({
        id: `player-${player.id}`,
        label: player.displayNameForGame || player.displayName,
        playerId: player.id,
        color: getAvatarColor(player, room.id)
      }));
      onLaunch({ type: 'playerWheel', options });
    } else if (wheelType === 'custom') {
      const colors = ['#8b5cf6', '#ec4899', '#3b82f6', '#f97316', '#10b981', '#ef4444', '#14b8a6', '#f59e0b'];
      const options = customOptions
        .filter(opt => opt.trim())
        .map((opt, index) => ({
          id: `custom-${index}`,
          label: opt.trim(),
          color: colors[index % colors.length]
        }));
      
      if (options.length >= 2) {
        onLaunch({ type: 'customWheel', options });
      }
    }
  };

  const canLaunch = 
    (wheelType === 'player' && availablePlayers.length >= 2) ||
    (wheelType === 'custom' && customOptions.filter(opt => opt.trim()).length >= 2);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-md w-full my-8">
        
        {!wheelType ? (
          /* Wheel Type Selection */
          <>
            <h3 className="text-white text-2xl font-bold mb-6 text-center">Setup Wheel Spin</h3>
            
            <div className="space-y-3">
              <button
                onClick={() => setWheelType('player')}
                className="w-full bg-gradient-to-br from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-xl p-6 text-left shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5"
              >
                <div className="flex items-center gap-4">
                  <div className="text-4xl">👥</div>
                  <div>
                    <div className="font-bold text-lg">Player Wheel</div>
                    <div className="text-violet-200 text-sm mt-1">Spin to choose a player</div>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setWheelType('custom')}
                className="w-full bg-slate-700/50 border border-slate-600 hover:bg-slate-700 hover:border-slate-500 text-white rounded-xl p-6 text-left shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5"
              >
                <div className="flex items-center gap-4">
                  <div className="text-4xl">✏️</div>
                  <div>
                    <div className="font-bold text-lg">Custom Wheel</div>
                    <div className="text-slate-400 text-sm mt-1">Add your own options</div>
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
          </>
        ) : wheelType === 'player' ? (
          /* Player Wheel Setup */
          <>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-white text-xl font-bold">Player Wheel</h3>
              <button
                onClick={() => setWheelType(null)}
                className="text-slate-400 hover:text-slate-300 transition-colors"
              >
                <span className="text-2xl">←</span>
              </button>
            </div>

            {/* Available Players */}
            <div className="mb-4">
              <label className="text-slate-300 text-sm font-medium mb-2 block">
                Players in wheel ({availablePlayers.length})
              </label>
              <div className="space-y-2">
                {availablePlayers.map(player => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-700"
                  >
                    <span className="text-slate-200 font-medium">
                      {player.displayNameForGame || player.displayName}
                    </span>
                    <button
                      onClick={() => handleExcludePlayer(player.id)}
                      disabled={availablePlayers.length <= 2}
                      className={`text-xl ${
                        availablePlayers.length > 2
                          ? 'text-red-400 hover:text-red-300 cursor-pointer'
                          : 'text-slate-600 cursor-not-allowed'
                      } transition-colors`}
                      title={availablePlayers.length > 2 ? 'Remove' : 'Minimum 2 options required'}
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
                        onClick={() => handleIncludePlayer(player.id)}
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
                onClick={handleLaunch}
                disabled={!canLaunch}
                className="flex-1 px-4 py-3 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-600 disabled:text-slate-500 text-white rounded-lg font-bold transition-colors disabled:cursor-not-allowed"
              >
                Launch Wheel
              </button>
            </div>
          </>
        ) : (
          /* Custom Wheel Setup */
          <>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-white text-xl font-bold">Custom Wheel</h3>
              <button
                onClick={() => setWheelType(null)}
                className="text-slate-400 hover:text-slate-300 transition-colors"
              >
                <span className="text-2xl">←</span>
              </button>
            </div>

            {/* Custom Options */}
            <div className="mb-4">
              <label className="text-slate-300 text-sm font-medium mb-2 block">
                Options ({customOptions.filter(opt => opt.trim()).length}/8)
              </label>
              <div className="space-y-2 mb-3">
                {customOptions.map((option, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={option}
                      onChange={(e) => handleCustomOptionChange(index, e.target.value)}
                      placeholder={`Option ${index + 1}`}
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    />
                    {customOptions.length > 2 && (
                      <button
                        onClick={() => handleRemoveCustomOption(index)}
                        className="text-xl text-red-400 hover:text-red-300 transition-colors px-2"
                        title="Remove"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {customOptions.length < 8 && (
                <button
                  onClick={handleAddCustomOption}
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
                onClick={handleLaunch}
                disabled={!canLaunch}
                className="flex-1 px-4 py-3 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-600 disabled:text-slate-500 text-white rounded-lg font-bold transition-colors disabled:cursor-not-allowed"
              >
                Launch Wheel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
