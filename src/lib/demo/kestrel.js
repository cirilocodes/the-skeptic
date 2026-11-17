// Kestrel Freight: a fictional logistics company. All people and events are invented for the demo.
// Loaded from the Skeptic settings page (Demo data) or by seed/seed.mjs.
import { epic } from './builders.js';

export const company = { id: 'kestrel', name: 'Kestrel Freight', project: 'KF', planType: 'Epic', incidentType: 'Bug', confluence: true };
// outcome: 'shipped' | 'abandoned' | 'in-progress' | 'todo'

export const epics = [
  // ---- The buried story ---------------------------------------------------
  {
    summary: 'In-app live chat for customers', tasks: ['Shortlist chat widget vendors', 'Evening support rota for chat', 'Chat transcript storage design'],
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
    summary: 'Chatbot FAQ for the customer portal', tasks: ['Write answers for the top 20 tracking questions', 'Hand-off link from the bot to the service portal'],
    outcome: 'shipped',
    text: [
      'Goal: answer the 20 most common tracking questions automatically in the customer portal.',
      'Owner: Daniel Asante. Shipped 9 September 2025. Deflected about a third of "where is my parcel" calls in the first month.',
      'No human agents involved; questions it cannot answer link to the service portal.',
    ],
  },
  // ---- Noise: shipped ------------------------------------------------------
  { summary: 'Live parcel tracking map', tasks: ['Van GPS feed into the tracking service', 'Map view for the last 30 minutes'], outcome: 'shipped', text: ['Customers see their van on a map in the last 30 minutes before delivery.', 'Owner: Efua Boateng. Shipped June 2025.'] },
  { summary: 'Proof of delivery photos', tasks: ['Camera step in the driver app', 'Attach photos to the order record'], outcome: 'shipped', text: ['Drivers take a photo at the door; the photo is attached to the order.', 'Owner: Yaw Darko. Shipped February 2025.'] },
  { summary: 'Route optimisation v2', tasks: ['Benchmark the new routing engine', 'Depot-by-depot rollout of routing v2'], outcome: 'shipped', text: ['New routing engine cuts average route length.', 'Owner: Nana Adjei. Shipped November 2025.'] },
  { summary: 'Automated invoice emails', tasks: ['Monthly invoice PDF template', 'Invoice email scheduler'], outcome: 'shipped', text: ['Business customers get a monthly PDF invoice by email.', 'Owner: Selina Ofori. Shipped April 2025.'] },
  { summary: 'Driver shift swap in the driver app', tasks: ['Swap request and accept screens', 'Depot manager approval rule for swaps'], outcome: 'shipped', text: ['Drivers can offer and accept shift swaps without calling the depot.', 'Owner: Kwame Boadu. Shipped August 2025.'] },
  { summary: 'Warehouse barcode scanner integration', tasks: ['Scanner pairing with the warehouse system', 'Real-time status updates from scans'], outcome: 'shipped', text: ['Handheld scanners update parcel status in real time.', 'Owner: Abena Kyei. Shipped January 2025.'] },
  { summary: 'Delivery time windows at checkout', tasks: ['Slot capacity per depot', 'Window picker in the booking flow'], outcome: 'shipped', text: ['Customers pick a two-hour window when they book.', 'Owner: Efua Boateng. Shipped October 2025.'] },
  { summary: 'Customer satisfaction survey after delivery', tasks: ['SMS survey wording and timing', 'Survey results report'], outcome: 'shipped', text: ['A one-question survey is sent by SMS after each delivery.', 'Owner: Ama Owusu. Shipped July 2025. Response rate around 18 percent.'] },
  { summary: 'Fuel card reconciliation', tasks: ['Import fuel card statements', 'Match spend to routes'], outcome: 'shipped', text: ['Finance matches fuel card spend to routes automatically.', 'Owner: Selina Ofori. Shipped May 2025.'] },
  { summary: 'Self-service returns booking', tasks: ['Returns booking form', 'Collection slot for returns'], outcome: 'shipped', text: ['Customers book a return collection online.', 'Owner: Daniel Asante. Shipped December 2025.'] },
  // ---- Noise: abandoned (other reasons) -------------------------------------
  { summary: 'Drone delivery pilot', tasks: ['Aviation permit application', 'Test flights over the pilot district'], outcome: 'abandoned', text: ['Pilot for small parcels in one district.', 'Owner: Nana Adjei. Abandoned May 2025: aviation permits would take more than a year.'] },
  { summary: 'Blockchain proof of custody', tasks: ['Ledger vendor evaluation', 'Cost per scan estimate'], outcome: 'abandoned', text: ['Record each parcel hand-off on a ledger.', 'Owner: Kwame Boadu. Abandoned March 2025: no customer asked for it and the cost per scan was too high.'] },
  { summary: 'Voice ordering through smart speakers', tasks: ['Voice skill prototype', 'Beta invite for voice ordering'], outcome: 'abandoned', text: ['Book a pickup by voice.', 'Owner: Yaw Darko. Abandoned September 2025: under 40 customers tried it in the beta.'] },
  { summary: 'Loyalty points for frequent senders', tasks: ['Points rules and redemption catalogue', 'Finance treatment of unredeemed points'], outcome: 'abandoned', text: ['Points per shipment, redeemable for discounts.', 'Owner: Selina Ofori. Abandoned January 2026: finance could not account for the liability.'] },
  // ---- Noise: in progress ---------------------------------------------------
  { summary: 'Electric van charging schedule', tasks: ['Depot charger inventory', 'Overnight charging plan per van'], outcome: 'in-progress', text: ['Plan overnight charging so every van starts the day full.', 'Owner: Abena Kyei. Started February 2026.'] },
  { summary: 'Carbon footprint report for business customers', tasks: ['Emissions factors per van type', 'Quarterly report layout'], outcome: 'in-progress', text: ['Quarterly emissions report per customer account.', 'Owner: Nana Adjei.'] },
  { summary: 'Depot capacity forecasting', tasks: ['Historic volume data clean-up', 'Weekly forecast model'], outcome: 'in-progress', text: ['Predict parcel volume per depot a week ahead.', 'Owner: Kwame Boadu.'] },
  { summary: 'Customer address verification', tasks: ['Postal register API access', 'Address check at booking'], outcome: 'in-progress', text: ['Check addresses against the national postal register at booking.', 'Owner: Daniel Asante.'] },
  { summary: 'Driver safety training tracker', tasks: ['Course completion import', 'Reminder for overdue courses'], outcome: 'in-progress', text: ['Track which drivers completed the defensive driving course.', 'Owner: Yaw Darko.'] },
  // ---- Noise: not started ---------------------------------------------------
  // ---- Earlier years (2021 to 2024) ---------------------------------------
  epic('Online booking for walk-in customers', 'shipped', 'March 2021', 'Daniel Asante', 'Customers book and pay for a parcel online instead of queuing at the depot counter.', ['Booking form with parcel sizes', 'Card and mobile money payments', 'Depot counter view of online bookings']),
  epic('Depot management system migration', 'shipped', 'September 2021', 'Abena Kyei', 'Move all depots from spreadsheets to one depot management system.', ['Data migration from depot spreadsheets', 'Training for depot supervisors', 'Switch off the old spreadsheets']),
  epic('Cash on delivery for every order', 'abandoned', 'November 2021', 'Selina Ofori', 'Let any customer pay the driver in cash at the door.', ['Cash float rules for drivers', 'End-of-day cash reconciliation'], { why: 'cash shortfalls at depots grew every week and drivers felt unsafe carrying large sums at night.' }),
  epic('Mobile money payments at the door', 'shipped', 'May 2022', 'Selina Ofori', 'Drivers take mobile money payments on their phone at delivery.', ['Payment prompt in the driver app', 'Mobile money settlement report']),
  epic('Bicycle couriers for the city centre', 'abandoned', 'August 2022', 'Nana Adjei', 'Small parcels in the city centre delivered by bicycle couriers.', ['Courier insurance quotes', 'Bicycle route trial in Osu'], { why: 'insurance for the couriers cost more than the vans it was meant to replace.' }),
  epic('Business customer accounts', 'shipped', 'October 2022', 'Daniel Asante', 'Companies get one account with several users and monthly billing.', ['Account roles for business users', 'Credit limit per account', 'Business sign-up review']),
  epic('Overnight trunking between Accra and Kumasi', 'shipped', 'January 2023', 'Kwame Boadu', 'Night lorries move parcels between the two hubs so next-day delivery works between the cities.', ['Partner haulier contract', 'Night loading schedule at both hubs']),
  epic('Franchise depots in the northern regions', 'abandoned', 'June 2023', 'Kofi Mensah', 'Let local partners run Kestrel depots under our brand in Tamale and Bolgatanga.', ['Franchise agreement draft', 'Partner selection visits'], { why: 'partners would not meet our service standards and we could not audit them from Accra.' }),
  epic('Driver app rewrite', 'shipped', 'July 2023', 'Kwame Boadu', 'Rebuild the driver app so it works on low-end Android phones.', ['Offline queue for status updates', 'Test matrix of low-end phones', 'Staged rollout to all drivers']),
  epic('Hub sorter at the Accra hub', 'shipped', 'November 2023', 'Abena Kyei', 'An automatic parcel sorter at the Accra hub to cut sorting time before the morning runs.', ['Sorter installation and safety sign-off', 'Sorting rules by route']),
  epic('Insurance cover for high-value parcels', 'shipped', 'February 2024', 'Selina Ofori', 'Senders can insure parcels worth more than 5,000 cedis at booking.', ['Insurer partnership', 'Claims form for damaged parcels']),
  epic('Cold-chain deliveries for pharmacies', 'in-progress', 'April 2024', 'Abena Kyei', 'Temperature-controlled boxes for pharmacy deliveries.', ['Cool box supplier trial', 'Temperature logging per box']),
  epic('Customer service portal', 'shipped', 'August 2024', 'Ama Owusu', 'One portal where customers raise and follow up delivery problems, answered within four working hours.', ['Request categories and forms', 'Four-hour response target report', 'Portal link from the customer app']),
  epic('Peak season temporary drivers', 'shipped', 'December 2024', 'Yaw Darko', 'Hire and onboard temporary drivers for the December peak.', ['Temporary driver onboarding pack', 'Short-term van rental']),
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
    expect: 'several',
    sources: ['In-app live chat for customers', 'Evening chat queue: customers waited over 40 minutes', 'Chat transcript retention: legal review', 'Why we stopped live chat', 'DEC-014: No in-house chat; route customers to the service portal'],
  },
  {
    key: 'honesty',
    summary: 'Night-time colour scheme for the driver app',
    text: [
      'Drivers working after sunset say the bright screens are hard on their eyes. Offer a darker colour scheme that switches on automatically at night.',
      'Proposed by: driver experience team. Target: Q1 2027.',
    ],
    dueDate: '2027-02-15',
    expect: 'none',
  },
  {
    key: 'voice',
    summary: 'Voice booking for pickups through smart speakers',
    text: [
      'Let business customers book a pickup by asking their smart speaker, so the office does not need to open the portal.',
      'No recordings, transcripts or personal data are kept beyond the pickup address and time, so transcript retention does not arise.',
      'Proposed by: customer products team. Target: Q3 2027.',
    ],
    dueDate: '2027-07-31',
    expect: 'one',
    sources: ['Voice ordering through smart speakers'],
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
  {
    summary: 'Cash shortfall at the Tema depot',
    text: ['In October 2021, during the cash on delivery rollout, the Tema depot was 18,000 cedis short at the end-of-day count three days in a row.', 'Resolved by stopping cash on delivery on 30 November 2021.'],
  },
  {
    summary: 'Mobile money settlements arrived three days late',
    text: ['In June 2022 the mobile money provider held our settlements for three days during a system upgrade, and drivers were asked to re-collect payments that had already gone through.', 'Fixed by checking settlement status before asking a customer to pay again.'],
  },
  {
    summary: 'Hub sorter stopped during the December 2024 peak',
    text: ['On 18 December 2024 the Accra hub sorter stopped for five hours after a belt failure, and 2,400 parcels missed the morning runs.', 'Resolved by a spare belt kept on site and a manual sorting plan.'],
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
  {
    summary: 'Night lorries on the Kumasi trunk route are past their service life',
    text: ['Raised February 2025: two of the three partner lorries on the Accra to Kumasi night route are over ten years old. A breakdown delays next-day delivery between the cities.'],
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
  {
    title: 'Cash on delivery: why we stopped',
    html: '<p><strong>Retro, December 2021.</strong> Cash on delivery for every order ran from August to November 2021. Depots were short at the end of the day, drivers felt unsafe carrying cash at night, and counting took an hour per depot. We moved to mobile money payments at the door instead.</p>',
  },
  { title: 'Franchise depots: retro', html: '<p><strong>Retro, July 2023.</strong> Partners in the north would not meet our service standards and we could not audit them from Accra. Revisit only with our own regional manager in place.</p>' },
  { title: 'Peak season 2024 review', html: '<p>Volumes were up 40 percent in December 2024. Temporary drivers worked well. The Accra hub sorter stopped once for five hours; we now keep a spare belt on site.</p>' },
  { title: 'Hub sorter operating guide', html: '<p>Start-up checks, belt inspection every week, and the manual sorting plan if the sorter stops.</p>' },
  { title: 'Overnight trunking: how it works', html: '<p>Night lorries leave each hub at 10 pm and arrive by 5 am. Loading closes at 9 pm.</p>' },
  { title: 'Team directory', html: '<p>Ama Owusu, Support Operations lead. Kofi Mensah, Head of Support. Daniel Asante, Customer Products. Efua Boateng, Tracking. Nana Adjei, Routing. Selina Ofori, Finance Systems. Kwame Boadu, Driver Products. Yaw Darko, Driver Safety. Abena Kyei, Fleet and Warehouse.</p>' },
];
