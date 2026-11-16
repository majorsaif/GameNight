const wordImposterRules = {
  title: 'Word Imposter',
  summary: 'Everyone gets the same secret word, except the imposter. Give clues, spot who is bluffing and vote them out.',
  sections: [
    {
      heading: 'Setup',
      text: 'Imposters get a similar decoy word and may not realise they are the imposter. With "Imposter gets no word" on, they are simply told they are the imposter. "Show category" gives everyone the word\'s category.'
    },
    {
      heading: 'Clues',
      text: 'Starting with a random player, go round giving one clue each. Tap Ready to vote when you have heard enough.'
    },
    {
      heading: 'Voting',
      text: 'The player with the most votes is out, and everyone learns whether they were an imposter. A tied vote removes nobody and starts a new round.'
    },
    {
      heading: 'Guessing the word',
      text: 'Only when imposters have no word: an imposter can stop the game to guess the word out loud, and the host marks it right or wrong. A wrong guess puts that imposter out.'
    },
    {
      heading: 'Winning',
      items: [
        { role: 'Town', text: 'Wins when every imposter is out.' },
        { role: 'Imposters', text: 'Win when they equal or outnumber the town, or by guessing the word correctly.' }
      ]
    }
  ]
};

export default wordImposterRules;
