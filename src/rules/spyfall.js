const spyfallRules = {
  title: 'Spyfall',
  summary: 'Everyone knows the secret location, except the spy. Question each other to expose the spy before they work out where you are.',
  sections: [
    {
      heading: 'Setup',
      text: 'Everyone except the spy sees the location, and a role there if roles are on. The spy only sees the list of possible locations.'
    },
    {
      heading: 'Questioning',
      text: 'A random player asks anyone a question about the location. Whoever answers asks next. Tap locations on your list to cross them out as you rule them out.'
    },
    {
      heading: 'Voting',
      text: 'Voting starts when everyone taps Ready to vote, when the timer ends, or when the host starts it. The player with the most votes is out; ties are broken at random.'
    },
    {
      heading: 'Spy guess',
      text: 'At any time a spy can stop the game to name the location out loud, and the host confirms it. A wrong guess puts that spy out.'
    },
    {
      heading: 'Winning',
      items: [
        { role: 'Spies', text: 'Win if an innocent player is voted out, or a spy names the location.' },
        { role: 'Town', text: 'Wins when every spy is voted out or guesses wrong.' }
      ]
    }
  ]
};

export default spyfallRules;
