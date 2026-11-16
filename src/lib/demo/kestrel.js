// Kestrel Freight: a fictional logistics company. All people and events are invented for the demo.
// Loaded from the Skeptic settings page (Demo data) or by seed/seed.mjs.
export const company = { id: 'kestrel', name: 'Kestrel Freight', project: 'KF', planType: 'Epic', incidentType: 'Bug', confluence: true };
// outcome: 'shipped' | 'abandoned' | 'in-progress' | 'todo'

export const epics = [
  // ---- The buried story ---------------------------------------------------
  {
    summary: 'In-app live chat for customers',
    outcome: 'abandoned',
    text: [
      'Goal: let customers chat with a support agent from inside the customer app instead of calling the hotline.',
      'Owner: Ama Owusu (Support Operations lead). Started 3 March 2025.',
      'Outcome: abandoned on 14 April 2025, six weeks in. Support could not staff the chat in the evenings, when most delivery problems happen, and the chat vendor quote came in at three times the estimate. See the Confluence page "Why we stopped live chat".',
    ],
    comment: 'We cannot staff evening chat. Stopping on Monday.',
    commentBy: 'Ama Owusu',
  },
  // ---- Near-miss: chat-related but a success --------------------------------
  {
    summary: 'Chatbot FAQ for the customer portal',
    outcome: 'shipped',
    text: [
      'Goal: answer the 20 most common tracking questions automatically in the customer portal.',
      'Owner: Daniel Asante. Shipped 9 September 2025. Deflected about a third of "where is my parcel" calls in the first month.',
      'No human agents involved; questions it cannot answer link to the service portal.',
    ],
  },
  // ---- Noise: shipped ------------------------------------------------------
  { summary: 'Live parcel tracking map', outcome: 'shipped', text: ['Customers see their van on a map in the last 30 minutes before delivery.', 'Owner: Efua Boateng. Shipped June 2025.'] },
  { summary: 'Proof of delivery photos', outcome: 'shipped', text: ['Drivers take a photo at the door; the photo is attached to the order.', 'Owner: Yaw Darko. Shipped February 2025.'] },
  { summary: 'Route optimisation v2', outcome: 'shipped', text: ['New routing engine cuts average route length.', 'Owner: Nana Adjei. Shipped November 2025.'] },
  { summary: 'Automated invoice emails', outcome: 'shipped', text: ['Business customers get a monthly PDF invoice by email.', 'Owner: Selina Ofori. Shipped April 2025.'] },
  { summary: 'Driver shift swap in the driver app', outcome: 'shipped', text: ['Drivers can offer and accept shift swaps without calling the depot.', 'Owner: Kwame Boadu. Shipped August 2025.'] },
  { summary: 'Warehouse barcode scanner integration', outcome: 'shipped', text: ['Handheld scanners update parcel status in real time.', 'Owner: Abena Kyei. Shipped January 2025.'] },
  { summary: 'Delivery time windows at checkout', outcome: 'shipped', text: ['Customers pick a two-hour window when they book.', 'Owner: Efua Boateng. Shipped October 2025.'] },
  { summary: 'Customer satisfaction survey after delivery', outcome: 'shipped', text: ['A one-question survey is sent by SMS after each delivery.', 'Owner: Ama Owusu. Shipped July 2025. Response rate around 18 percent.'] },
  { summary: 'Fuel card reconciliation', outcome: 'shipped', text: ['Finance matches fuel card spend to routes automatically.', 'Owner: Selina Ofori. Shipped May 2025.'] },
  { summary: 'Self-service returns booking', outcome: 'shipped', text: ['Customers book a return collection online.', 'Owner: Daniel Asante. Shipped December 2025.'] },
  // ---- Noise: abandoned (other reasons) -------------------------------------
  { summary: 'Drone delivery pilot', outcome: 'abandoned', text: ['Pilot for small parcels in one district.', 'Owner: Nana Adjei. Abandoned May 2025: aviation permits would take more than a year.'] },
  { summary: 'Blockchain proof of custody', outcome: 'abandoned', text: ['Record each parcel hand-off on a ledger.', 'Owner: Kwame Boadu. Abandoned March 2025: no customer asked for it and the cost per scan was too high.'] },
  { summary: 'Voice ordering through smart speakers', outcome: 'abandoned', text: ['Book a pickup by voice.', 'Owner: Yaw Darko. Abandoned September 2025: under 40 customers tried it in the beta.'] },
  { summary: 'Loyalty points for frequent senders', outcome: 'abandoned', text: ['Points per shipment, redeemable for discounts.', 'Owner: Selina Ofori. Abandoned January 2026: finance could not account for the liability.'] },
  // ---- Noise: in progress ---------------------------------------------------
  { summary: 'Electric van charging schedule', outcome: 'in-progress', text: ['Plan overnight charging so every van starts the day full.', 'Owner: Abena Kyei. Started February 2026.'] },
  { summary: 'Carbon footprint report for business customers', outcome: 'in-progress', text: ['Quarterly emissions report per customer account.', 'Owner: Nana Adjei.'] },
  { summary: 'Depot capacity forecasting', outcome: 'in-progress', text: ['Predict parcel volume per depot a week ahead.', 'Owner: Kwame Boadu.'] },
  { summary: 'Customer address verification', outcome: 'in-progress', text: ['Check addresses against the national postal register at booking.', 'Owner: Daniel Asante.'] },
  { summary: 'Driver safety training tracker', outcome: 'in-progress', text: ['Track which drivers completed the defensive driving course.', 'Owner: Yaw Darko.'] },
  // ---- Noise: not started ---------------------------------------------------
  { summary: 'Same-day delivery in Kumasi', outcome: 'todo', text: ['Explore a same-day service for business customers.'] },
  { summary: 'Parcel lockers at fuel stations', outcome: 'todo', text: ['Partner with fuel stations for pickup lockers.'] },
  { summary: 'API for e-commerce plugins', outcome: 'todo', text: ['Public API so online shops can book deliveries.'] },
  { summary: 'SMS delivery notifications in local languages', outcome: 'todo', text: ['Twi, Ewe and Ga versions of the delivery SMS.'] },
];

// The two plans the demo reviews. Created last, left in To Do.
export const plans = [
  {
    key: 'livechat',
    summary: 'Add live chat to the mobile app',
    text: [
      'Customers keep asking to talk to someone from inside the app. Add a live chat button to every order screen, staffed by the support team.',
      'Proposed by: new product manager. Target: Q2 2027.',
    ],
    dueDate: '2027-04-30',
  },
  {
    key: 'honesty',
    summary: 'Night-time colour scheme for the driver app',
    text: [
      'Drivers working after sunset say the bright screens are hard on their eyes. Offer a darker colour scheme that switches on automatically at night.',
      'Proposed by: driver experience team. Target: Q1 2027.',
    ],
    dueDate: '2027-02-15',
  },
];

// Past incidents (Bugs, or tasks labelled "incident" if the project has no Bug type). All resolved.
export const incidents = [
  {
    summary: 'Evening chat queue: customers waited over 40 minutes',
    text: [
      'During the live chat trial in April 2025, chats opened after 6 pm waited an average of 40 minutes because nobody from support was on shift.',
      'Several customers complained on social media. Resolved by switching chat off in the evenings on 14 April 2025.',
    ],
  },
  {
    summary: 'Invoice emails sent twice to business customers',
    text: ['On 3 June 2025 the monthly invoice job ran twice and every business customer got two invoices.', 'Fixed by adding a run lock to the invoice job.'],
  },
  {
    summary: 'Route optimisation sent vans down closed roads in old districts',
    text: ['After the November 2025 launch, the routing engine used narrow streets that are closed to vans in the old districts.', 'Workaround: drivers report closed streets; the map data is patched weekly.'],
  },
];

// Open risk tickets (Jira tasks labelled "risk").
export const risks = [
  {
    summary: 'Chat transcript retention: legal review',
    text: [
      'Raised 20 March 2025 during the live chat project: chat transcripts may contain personal data. How long can we keep them, and where? Needs a legal review before any chat feature goes live.',
      'Status: never answered. Owner: unassigned.',
    ],
  },
  {
    summary: 'Single supplier for electric van batteries',
    text: ['All battery packs come from one supplier. A delay there stops the electric fleet.'],
  },
];

// Confluence pages. Storage-format HTML.
export const pages = [
  {
    title: 'Why we stopped live chat',
    html: `<p><strong>Retro, 16 April 2025.</strong> Facilitator: Ama Owusu.</p>
<h2>What happened</h2>
<p>We started in-app live chat on 3 March 2025. We stopped it on 14 April 2025.</p>
<h2>Why we stopped</h2>
<ul>
<li><strong>Staffing.</strong> Most delivery problems happen between 6 pm and 10 pm. Support works 8 am to 5 pm. Evening chats waited an average of 40 minutes, which made customers angrier than the hotline did.</li>
<li><strong>Cost.</strong> The chat vendor's final quote was three times our estimate once we added the evening seats.</li>
<li><strong>Legal.</strong> Nobody could tell us how long we may keep chat transcripts. The legal review was raised and never finished.</li>
</ul>
<h2>What we would need to try again</h2>
<p>Evening support cover, a vendor budget signed off up front, and the transcript retention question answered.</p>`,
  },
  {
    title: 'DEC-014: No in-house chat; route customers to the service portal',
    html: `<p><strong>Decision record.</strong> Decided 2 May 2025 by Kofi Mensah, Head of Support.</p>
<h2>Decision</h2>
<p>Kestrel Freight will not run its own live chat. Customers who need a person are routed to the service portal, where requests are answered within four working hours. The chatbot FAQ handles common questions.</p>
<h2>Reasons</h2>
<p>See "Why we stopped live chat". We cannot staff a real-time channel in the evenings without hiring a second shift.</p>
<h2>Revisit when</h2>
<p>Support has evening cover, or volume justifies a second shift.</p>`,
  },
  {
    title: 'Support team handbook',
    html: `<p>Hours: 8 am to 5 pm, Monday to Saturday. Channels: hotline, email, service portal. We do not offer chat; see DEC-014.</p>
<p>Escalations go to the Support Operations lead.</p>`,
  },
  { title: 'Route optimisation v2: launch notes', html: '<p>Launched November 2025. Average route length down. Known issue: very narrow streets in older districts.</p>' },
  { title: 'Drone delivery pilot: retro', html: '<p>Stopped in May 2025. Aviation permits would take more than a year. Revisit if regulations change.</p>' },
  { title: 'Proof of delivery photos: how it works', html: '<p>Drivers take one photo at the door. Photos are kept for 90 days.</p>' },
  { title: 'Fleet electrification plan 2026', html: '<p>Replace a third of the diesel vans with electric vans by end of 2026. Charging overnight at depots.</p>' },
  { title: 'Customer satisfaction results 2025', html: '<p>Top complaints: late evening deliveries, hard to reach a person after 5 pm, missed time windows.</p>' },
  { title: 'Engineering onboarding guide', html: '<p>Welcome to Kestrel Freight engineering. Our services, how we deploy, who to ask.</p>' },
  { title: 'Pricing for business customers', html: '<p>Volume tiers, monthly invoicing, fuel surcharge rules.</p>' },
  { title: 'Loyalty points: why we stopped', html: '<p>Finance could not account for unredeemed points as a liability. Stopped January 2026.</p>' },
  { title: 'Quarterly planning notes Q1 2026', html: '<p>Priorities: electric fleet, depot forecasting, address verification. The team discussed whether to revisit customer chat and agreed to wait for evening support cover.</p>' },
  { title: 'Driver app release checklist', html: '<p>Test on low-end Android phones, check offline queueing, update the help page.</p>' },
  { title: 'Warehouse scanner rollout', html: '<p>All depots live with handheld scanners since January 2025.</p>' },
  {
    title: 'Proposal: live chat for warehouse staff',
    html: '<p><strong>Proposal.</strong> Give warehouse staff a live chat channel to the support team for damaged-parcel questions, staffed by support. Target Q2 2027.</p>',
  },
  { title: 'Team directory', html: '<p>Ama Owusu, Support Operations lead. Kofi Mensah, Head of Support. Daniel Asante, Customer Products. Efua Boateng, Tracking. Nana Adjei, Routing. Selina Ofori, Finance Systems. Kwame Boadu, Driver Products. Yaw Darko, Driver Safety. Abena Kyei, Fleet and Warehouse.</p>' },
];
