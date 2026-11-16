// Pinecrest Apps: a second, fictional demo site with a different shape from Kestrel Freight, used to show
// the Skeptic is not tied to one dataset. A notes-app software company; plans are "Initiative"s; incidents
// are their own "Incident" type; there is no Confluence, so history lives only in Jira. All names are invented.
import { epic } from './builders.js';

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
    tasks: ['Local note storage on the phone', 'Sync queue for offline changes', 'Conflict screen for two edited copies'],
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
    tasks: ['Installer package for customer servers', 'Upgrade path for self-hosted installs'],
    comment: 'Cancelled because each self-hosted customer needed weeks of hands-on support.',
    commentBy: 'Marco Diaz',
  },
  { summary: 'Shared notebooks for teams', outcome: 'shipped', text: ['Teams share a notebook with edit rights. Shipped June 2025.'], tasks: ['Notebook sharing permissions', 'Invite teammates by email'] },
  { summary: 'Web clipper browser extension', outcome: 'shipped', text: ['Save any web page into a note. Shipped February 2025.'], tasks: ['Chrome extension', 'Firefox extension'] },
  { summary: 'Two-factor sign-in', outcome: 'shipped', text: ['Optional authenticator-app codes for every account. Shipped April 2025.'], tasks: ['Authenticator app setup screen', 'Recovery codes', 'Help article for two-factor setup'] },
  { summary: 'Handwriting search', outcome: 'shipped', text: ['Search inside handwritten notes. Shipped August 2025.'], tasks: ['Handwriting recognition model', 'Search results for handwritten pages', 'Handwriting search on Android tablets'] },
  { summary: 'Annual billing with a discount', outcome: 'shipped', text: ['Pay yearly for two months free. Shipped March 2025.'], tasks: ['Annual plan in the billing system', 'Upgrade prompt for monthly payers', 'Renewal reminder email'] },
  { summary: 'Calendar integration', outcome: 'in-progress', text: ['Show meeting notes next to calendar events.'], tasks: ['Google Calendar connection', 'Outlook calendar connection'] },
  { summary: 'Template gallery', outcome: 'in-progress', text: ['Ready-made templates for meetings, journals and plans.'], tasks: ['First 20 templates', 'Template picker'] },
  { summary: 'Public API', outcome: 'todo', text: ['A REST API so other tools can create notes.'], tasks: ['API design review'] },

  // ---- Earlier years (2021 to 2024) ---------------------------------------
  epic('Desktop app for Windows and Mac', 'shipped', 'April 2021', 'Marco Diaz', 'A desktop app with the same notes as the phone.', ['Windows installer', 'Mac app notarisation', 'Auto-update for desktop']),
  epic('Markdown formatting in notes', 'shipped', 'August 2021', 'Priya Nair', 'Headings, lists and bold text with Markdown shortcuts.', ['Markdown parser', 'Formatting toolbar', 'Markdown export']),
  epic('Import from other note apps', 'shipped', 'January 2022', 'Priya Nair', 'Bring notes in from other apps in one step.', ['Import from exported HTML files', 'Import progress screen']),
  epic('Browser-only lite version', 'abandoned', 'May 2022', 'Tom Becker', 'A lighter version that runs only in the browser, for school computers.', ['Lite editor prototype', 'School pilot with two classes'], { why: 'large notebooks took over ten seconds to open and teachers went back to the full app.' }),
  epic('Student discount plan', 'shipped', 'September 2022', 'Ama Serwaa', 'Half price for verified students.', ['Student email verification', 'Discount in the billing system', 'Yearly student re-verification']),
  epic('Tablet layout for Android', 'shipped', 'November 2022', 'Lena Hart', 'A two-pane layout for Android tablets.', ['Two-pane note list', 'Stylus support on tablets']),
  epic('Reminders on notes', 'shipped', 'March 2023', 'Tom Becker', 'Set a reminder on any note.', ['Reminder picker', 'Push notification for reminders']),
  epic('Voice notes with transcription', 'shipped', 'June 2023', 'Priya Nair', 'Record a voice note and get the text underneath.', ['Recording screen', 'Transcription service contract']),
  epic('Encrypted notes with a personal key', 'abandoned', 'October 2023', 'Marco Diaz', 'Notes locked with a key only the user knows.', ['Key setup flow', 'Encrypted storage format'], { why: 'people who forgot their key lost their notes for good and support could not help them.' }),
  epic('Real-time co-editing of shared notes', 'shipped', 'December 2023', 'Lena Hart', 'Two people type in the same note at once, online, and see each other’s cursor.', ['Live cursors', 'Presence indicator', 'Load test with 50 editors']),
  epic('Team admin console', 'shipped', 'February 2024', 'Ama Serwaa', 'Admins manage seats, roles and billing for a team.', ['Seat management', 'Role permissions', 'Invoice history', 'Single sign-on for teams']),
  epic('Public notes with share links', 'abandoned', 'July 2024', 'Tom Becker', 'Publish a note to the web with a public link.', ['Public page renderer', 'Report abuse button'], { why: 'spam pages appeared within days and moderating them took a full-time person.' }),
  epic('Email-to-note address', 'shipped', 'September 2024', 'Priya Nair', 'Forward an email to a personal address and it becomes a note.', ['Inbound email service', 'Attachment handling', 'Spam filter for inbound email']),
  epic('Pricing page redesign', 'shipped', 'November 2024', 'Ama Serwaa', 'A clearer pricing page with a plan comparison table.', ['Plan comparison table', 'Pricing page A/B test']),
  epic('Usage analytics for team admins', 'shipped', 'May 2025', 'Ama Serwaa', 'Admins see how many people use the team notebooks each week.', ['Weekly active users chart', 'CSV export of usage']),
  epic('Note version history', 'shipped', 'September 2025', 'Lena Hart', 'See and restore earlier versions of a note.', ['Version list', 'Restore a version', 'Version retention limits']),
  epic('Smart summaries of long notes', 'in-progress', 'February 2026', 'Priya Nair', 'A short summary at the top of long notes.', ['Summary quality review', 'Summary toggle in settings', 'Summary language support']),
];

// The plans the demo reviews. Created last, left in To Do. `expect` is what a judge should see.
export const plans = [
  {
    key: 'offline',
    summary: 'Work offline on mobile and sync when back online',
    text: ['People lose work on flights and trains. Let them create and change notes with no connection, and sync when the connection returns.', 'Target: Q2 2027.'],
    dueDate: '2027-05-30',
    expect: 'several',
    sources: ['Offline editing in the mobile app', 'Sync conflict overwrote notes for beta users', 'No merge design for concurrent edits'],
  },
  {
    key: 'onprem',
    summary: 'On-premise version for banks',
    text: ['Banks will only buy if the product runs on premise, inside their own data centre. Package the app so their IT teams can install it.', 'Target: Q3 2027.'],
    dueDate: '2027-08-30',
    expect: 'one',
    sources: ['Self-hosted edition for enterprise customers'],
  },
  {
    key: 'honest',
    summary: 'Keyboard shortcuts cheat sheet',
    text: ['Add a page listing every keyboard shortcut, opened with the question mark key.', 'Target: Q1 2027.'],
    dueDate: '2027-02-28',
    expect: 'none',
  },
];

export const incidents = [
  {
    summary: 'Sync conflict overwrote notes for beta users',
    text: ['On 14 March 2025, during the offline editing beta, two devices editing one note offline overwrote each other and 300 beta users lost edits.', 'Resolved by switching offline editing off on 20 March 2025.'],
  },
  { summary: 'Search index outage', text: ['Search was down for two hours on 2 July 2025 after a bad deploy.', 'Fixed by rolling back.'] },
  { summary: 'Users locked out of encrypted notes', text: ['In September 2023, 140 people in the encrypted notes beta forgot their key and could not open their notes. Support had no way to recover them.', 'Resolved by ending the beta and decrypting notes for users who still had their key.'] },
  { summary: 'Spam pages on public share links', text: ['In June 2024 thousands of spam pages were published through public notes within a week, and our domain was flagged by an email provider.', 'Resolved by switching public links off on 12 July 2024.'] },
  { summary: 'Lock-screen previews showed other people’s note titles', text: ['On 9 May 2023 a cache bug showed note titles from the wrong accounts on phone lock screens for 40 minutes.', 'Fixed by clearing the cache and checking the account before showing a preview.'] },
  { summary: 'Annual renewals charged twice', text: ['On 1 March 2026 the renewal job ran twice and 600 annual customers were charged twice.', 'Refunded the same day; the job now takes a lock.'] },
];

export const risks = [
  { summary: 'No merge design for concurrent edits', text: ['Raised during the offline project: we never agreed how to merge two people’s changes to the same note. Still open.'] },
  { summary: 'Only one engineer knows the billing code', text: ['Raised January 2026: if Ama Serwaa is away, nobody can safely change billing.'] },
  { summary: 'App store review delays urgent fixes', text: ['Phone app fixes wait one to three days for store review, so a bad release stays live for days.'] },
];

export const pages = [];
