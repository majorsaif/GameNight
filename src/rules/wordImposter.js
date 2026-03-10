const wordImposterRules = {
  title: 'Word Imposter',
  summary:
    'A social deduction game where everyone receives the same secret word — except the imposter(s), who must bluff their way through descriptions without knowing it.',

  sections: [
    {
      heading: 'Setup',
      text: 'All players except the imposter(s) receive the same secret word. Imposters receive nothing — they do not know the word. A random starting player and direction (clockwise or anticlockwise) is chosen.',
    },
    {
      heading: 'Describing',
      text: 'Starting from the chosen player and going in the announced direction, each player gives a one-word or short clue describing the word. The goal is to prove you know the word without making it too obvious for the imposter.',
    },
    {
      heading: 'Voting',
      text: 'After all players have described, everyone votes for who they think the imposter is. The player with the most votes is eliminated. If there is a tie, a random tiebreak decides.',
    },
    {
      heading: 'Imposter Guess',
      text: 'If the eliminated player was an imposter, they get one chance to guess the word out loud. The host confirms whether they guessed correctly.',
    },
    {
      heading: 'Win Conditions',
      items: [
        { role: 'Town wins', text: 'The imposter is voted out AND fails to guess the word.' },
        { role: 'Imposter wins', text: 'A non-imposter is voted out, OR the imposter guesses the word correctly after being caught.' },
      ],
    },
  ],
};

export default wordImposterRules;
