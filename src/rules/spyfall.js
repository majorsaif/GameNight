const spyfallRules = {
  title: 'Spyfall',
  summary:
    'A social deduction game where everyone knows the secret location — except the spy. The spy must blend in while the town tries to expose them through questioning.',

  sections: [
    {
      heading: 'Setup',
      text: 'A secret location is chosen at random. All players except the spy are told the location (and optionally their role at that location). The spy is not told the location or their role, but sees a list of all possible locations.',
    },
    {
      heading: 'Questioning',
      text: 'A random player starts by asking any other player a question about the location. The person asked must answer, and then becomes the next asker. Play continues naturally with no fixed order. A countdown timer marks the end of the round.',
    },
    {
      heading: 'Ready to Vote',
      text: 'Any active player can click "Ready to Vote" at any time. When all active players have clicked Ready to Vote, voting starts automatically. The host can also click "Start Voting" to begin immediately.',
    },
    {
      heading: 'Spy Guess',
      text: 'At any point during questioning, a spy can click "Ready to Guess." All players are notified and the host confirms whether the spy guessed correctly. A correct guess wins the game for the spy; an incorrect guess eliminates that spy.',
    },
    {
      heading: 'Voting',
      text: 'Each player votes for who they think the spy is. The player with the most votes is eliminated — ties are broken randomly. If the eliminated player is a spy, the game may continue with remaining spies. If they are innocent, the spy wins.',
    },
    {
      heading: 'Win Conditions',
      items: [
        { role: 'Spy wins', text: 'All non-spy players vote to end the game and the spy correctly guesses the location, OR the spy clicks Ready to Guess and the host confirms a correct guess.' },
        { role: 'Town wins', text: 'All spies are voted out or guess the location incorrectly.' },
      ],
    },
  ],
};

export default spyfallRules;
