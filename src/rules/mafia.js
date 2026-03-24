const mafiaRules = {
  title: 'Mafia',
  summary:
    'A social deduction game where Mafia act at night and Town works together during the day to identify and eliminate them.',

  sections: [
    {
      heading: 'Sound Effects',
      text: 'This game uses sound effects to signal each phase of the night. When the first night begins, you will have 7 seconds to turn up your volume before the night sounds start. Make sure your volume is on before the host starts the game.',
    },
    {
      heading: 'Roles',
      items: [
        { role: 'Mafia', text: 'Knows the other Mafia members and chooses one target each night.' },
        { role: 'Civilian', text: 'No special night action. Uses discussion and voting to identify Mafia.' },
        { role: 'Doctor', text: 'If enabled, chooses one player to protect each night.' },
        { role: 'Detective', text: 'If enabled, investigates one player each night to learn if they are Mafia.' },
      ],
    },
    {
      heading: 'Night Phase',
      text: 'Players act in hidden night phases. Mafia selects a target, Doctor protects (if enabled), and Detective investigates (if enabled). Results are revealed at day start.',
    },
    {
      heading: 'Day Phase',
      text: 'Surviving players discuss, then vote to eliminate one suspect. Eliminated players no longer take actions but can still watch the game.',
    },
    {
      heading: 'Win Conditions',
      items: [
        { role: 'Town wins', text: 'All Mafia members have been eliminated.' },
        { role: 'Mafia wins', text: 'Mafia members equal or outnumber the remaining non-Mafia players.' },
      ],
    },
  ],
};

export default mafiaRules;
