const wordImposterRules = {
  title: 'Word Imposter',
  summary:
    'A social deduction game where Town players share one word while imposter players try to survive voting and mislead the table.',

  sections: [
    {
      heading: 'Setup',
      text: 'Town players receive the town word. If "Imposter gets no word" is ON, imposters only learn that they are the imposter. If it is OFF, each imposter secretly gets a different, similar word and may not even realise they are the imposter. With "Show Category" on, everyone sees the word\'s category.',
    },
    {
      heading: 'Describing',
      text: 'Each round starts with a random active starting player and direction. Active players give clues and then mark ready. Eliminated players can watch but cannot interact.',
    },
    {
      heading: 'Voting',
      text: 'Only active players can vote and be voted for. The player with the most votes is eliminated and everyone learns whether they were an imposter. If the top vote is tied, nobody is eliminated and a new describing round begins.',
    },
    {
      heading: 'Declare Guess (Only when No-Word is ON)',
      text: 'Imposters can declare a guess during describing or voting. The game pauses, the imposter says the word out loud, and the host marks it Correct or Incorrect. A wrong guess eliminates that imposter.',
    },
    {
      heading: 'Win Conditions',
      items: [
        { role: 'Town wins', text: 'All imposters are eliminated.' },
        { role: 'Imposter wins', text: 'The imposters equal or outnumber the remaining town players (with one imposter, that means only 2 players are left).' },
        { role: 'Imposter wins (No-Word Mode)', text: 'If No-Word mode is enabled, an imposter also wins by correctly guessing the town word.' },
      ],
    },
  ],
};

export default wordImposterRules;
