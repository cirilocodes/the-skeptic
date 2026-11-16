// Pinecrest Apps: a second, fictional demo site with a different shape from Kestrel Freight, used to show
// the Skeptic is not tied to one dataset. A software company; plans are "Initiative"s; incidents are their
// own "Incident" type; there is no Confluence, so history lives only in Jira. All names are invented.
export const company = { id: 'pinecrest', name: 'Pinecrest Apps', project: 'PA', planType: 'Initiative', incidentType: 'Incident', confluence: false };

export const epics = [
  {
    summary: 'Offline editing in the mobile app',
    outcome: 'abandoned',
    text: [
      'Goal: let people edit their notes on the train, with no signal, and sync later.',
      'Owner: Lena Hart (Mobile lead). Started 6 January 2025.',
      'Outcome: abandoned on 20 March 2025. Two people editing the same note offline kept overwriting each other, and the merge rules were never agreed.',
    ],
    comment: 'Stopping this: sync conflicts overwrote notes for 300 beta users and we have no merge design.',
    commentBy: 'Lena Hart',
  },
  {
    summary: 'Self-hosted edition for enterprise customers',
    outcome: 'abandoned',
    text: [
      'Goal: a version enterprise customers can run on their own servers.',
      'Owner: Marco Diaz. Started May 2024.',
      'Outcome: cancelled in October 2024 because supporting dozens of customer setups needed a support team we did not have.',
    ],
    comment: 'Cancelled because each self-hosted customer needed weeks of hands-on support.',
    commentBy: 'Marco Diaz',
  },
  { summary: 'Shared notebooks for teams', outcome: 'shipped', text: ['Teams share a notebook with edit rights. Shipped June 2025.'] },
  { summary: 'Web clipper browser extension', outcome: 'shipped', text: ['Save any web page into a note. Shipped February 2025.'] },
  { summary: 'Two-factor sign-in', outcome: 'shipped', text: ['Optional authenticator-app codes for every account. Shipped April 2025.'] },
  { summary: 'Handwriting search', outcome: 'shipped', text: ['Search inside handwritten notes. Shipped August 2025.'] },
  { summary: 'Annual billing with a discount', outcome: 'shipped', text: ['Pay yearly for two months free. Shipped March 2025.'] },
  { summary: 'Calendar integration', outcome: 'in-progress', text: ['Show meeting notes next to calendar events.'] },
  { summary: 'Template gallery', outcome: 'in-progress', text: ['Ready-made templates for meetings, journals and plans.'] },
  { summary: 'Public API', outcome: 'todo', text: ['A REST API so other tools can create notes.'] },
];

export const plans = [
  {
    key: 'offline',
    summary: 'Work offline on mobile and sync when back online',
    text: ['People lose work on flights and trains. Let them create and change notes with no connection, and sync when the connection returns.', 'Target: Q2 2027.'],
    dueDate: '2027-05-30',
  },
  {
    key: 'onprem',
    summary: 'On-premise version for banks',
    text: ['Banks will only buy if the product runs on premise, inside their own data centre. Package the app so their IT teams can install it.', 'Target: Q3 2027.'],
    dueDate: '2027-08-30',
  },
  {
    key: 'honest',
    summary: 'Keyboard shortcuts cheat sheet',
    text: ['Add a page listing every keyboard shortcut, opened with the question mark key.', 'Target: Q1 2027.'],
    dueDate: '2027-02-28',
  },
];

export const incidents = [
  {
    summary: 'Sync conflict overwrote notes for beta users',
    text: ['On 14 March 2025, during the offline editing beta, two devices editing one note offline overwrote each other and 300 beta users lost edits.', 'Resolved by switching offline editing off on 20 March 2025.'],
  },
  { summary: 'Search index outage', text: ['Search was down for two hours on 2 July 2025 after a bad deploy.', 'Fixed by rolling back.'] },
];

export const risks = [
  { summary: 'No merge design for concurrent edits', text: ['Raised during the offline project: we never agreed how to merge two people’s changes to the same note. Still open.'] },
];

export const pages = [];
