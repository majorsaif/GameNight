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
      text: 'Any active player can tap "Ready to Vote" at any time. When everyone is ready, or the timer runs out, voting starts automatically. The host can also tap "Start Voting" to begin straight away. Tap locations on your list to cross them out as you rule them out.',
    },
    {
      heading: 'Spy Guess',
      text: 'During questioning or voting, a spy can tap "Ready to Guess". The game pauses, the spy names the location out loud and the host confirms whether it was right. A correct guess wins the game for the spies; a wrong guess eliminates that spy.',
    },
    {
      heading: 'Voting',
      text: 'Each player votes for who they think the spy is. The player with the most votes is eliminated, and ties are broken at random. If they were a spy and other spies remain, questioning continues. If they were innocent, the spies win.',
    },
    {
      heading: 'Win Conditions',
      items: [
        { role: 'Spies win', text: 'An innocent player is voted out, or a spy correctly guesses the location.' },
        { role: 'Town wins', text: 'Every spy is voted out or guesses the location wrong.' },
      ],
    },
  ],
};

export default spyfallRules;
