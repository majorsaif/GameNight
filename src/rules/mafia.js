const mafiaRules = {
  title: 'Mafia',
  summary: 'The Mafia pick someone off each night. By day, the town talks it through and votes out a suspect.',
  sections: [
    {
      heading: 'Roles',
      items: [
        { role: 'Mafia', text: 'Know each other and choose one target each night. If they disagree, the most-picked target is hit.' },
        { role: 'Doctor', text: 'Protects one player each night (if switched on).' },
        { role: 'Detective', text: 'Checks one player each night to learn whether they are Mafia (if switched on).' },
        { role: 'Civilian', text: 'No night action. Finds the Mafia by talking and voting.' }
      ]
    },
    {
      heading: 'Night',
      text: 'Everyone closes their eyes. Sound cues wake each role in turn, so turn your volume up before the first night.'
    },
    {
      heading: 'Day',
      text: 'The night report shows who was attacked. Talk it over, then vote someone out. Ties are broken at random, and if nobody votes, nobody goes. Players who are out can keep watching.'
    },
    {
      heading: 'Winning',
      items: [
        { role: 'Town', text: 'Wins when every Mafia member is out.' },
        { role: 'Mafia', text: 'Win when they equal or outnumber everyone else.' }
      ]
    }
  ]
};

export default mafiaRules;
