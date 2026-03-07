const mafiaRules = {
  title: 'Mafia',
  emoji: '🔪',
  summary:
    'A social deduction game where the Mafia secretly eliminates players at night while the Town tries to identify and vote them out during the day.',

  sections: [
    {
      heading: 'Roles',
      items: [
        { role: 'Mafia 🔪', text: 'Knows who the other Mafia members are. Each night, the Mafia collectively chooses one player to eliminate.' },
        { role: 'Civilian 🧑', text: 'A regular townsperson with no special ability. Uses discussion and voting to find the Mafia.' },
        { role: 'Doctor ⚕️', text: 'Each night, secretly chooses one player to protect. If the Mafia targets that player, they survive.' },
        { role: 'Detective 🔍', text: 'Each night, secretly investigates one player to learn whether they are Mafia or not.' },
      ],
    },
    {
      heading: 'Night Phase 🌙',
      text: 'Everyone "closes their eyes." The Mafia picks a target to eliminate. The Doctor picks someone to save. The Detective picks someone to investigate. All choices are made simultaneously and secretly.',
    },
    {
      heading: 'Day Phase ☀️',
      text: 'The results of the night are revealed — a player may have been eliminated. Surviving players discuss who they suspect is Mafia, then hold a vote to eliminate one player. The player with the most votes is removed from the game.',
    },
    {
      heading: 'Win Conditions 🏆',
      items: [
        { role: 'Town wins', text: 'All Mafia members have been eliminated.' },
        { role: 'Mafia wins', text: 'Mafia members equal or outnumber the remaining Town players.' },
      ],
    },
  ],
};

export default mafiaRules;
