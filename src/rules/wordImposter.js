const wordImposterRules = {
  title: 'Word Imposter',
  summary:
    'A social deduction game where Town players share one word while imposter players try to survive voting and mislead the table.',

  sections: [
    {
      heading: 'Setup',
      text: 'Town players receive the town word. If "Imposter Has No Word" is ON, imposters get no word. If it is OFF, imposters get different word(s). With multiple imposters in OFF mode, each imposter gets a unique word.',
    },
    {
      heading: 'Describing',
      text: 'Each round starts with a random active starting player and direction. Active players give clues and then mark ready. Eliminated players can watch but cannot interact.',
    },
    {
      heading: 'Voting',
      text: 'Only active players can vote and be voted. The highest single vote target is eliminated. If voting is tied for top votes, no one is eliminated and a new describing round begins.',
    },
    {
      heading: 'Declare Guess (Only when No-Word is ON)',
      text: 'Imposters can declare a guess during describing or voting. The phase pauses for everyone, host confirms Correct or Incorrect, and play updates immediately from that result.',
    },
    {
      heading: 'Win Conditions',
      items: [
        { role: 'Town wins', text: 'All imposters are eliminated.' },
        { role: 'Imposter wins', text: 'Only 2 active players remain and at least one is an imposter.' },
        { role: 'Imposter wins (No-Word Mode)', text: 'If No-Word mode is enabled, an imposter also wins by correctly guessing the town word.' },
      ],
    },
  ],
};

export default wordImposterRules;
