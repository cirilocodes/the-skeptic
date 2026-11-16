// The labelled evaluation set: 40 plans for the Kestrel Freight demo history (seed/data.mjs). Used by the
// admin page's "Measure precision", by eval/seed-eval.mjs and eval/score.mjs, and offline in npm test.
//
//   expect: 'flag'   the Skeptic should raise at least one objection at medium or above, citing one of
//                    `sources` (titles of seeded history items) or, for rule plans, the named rule
//   expect: 'clean'  the Skeptic should raise nothing at medium or above. Many clean plans deliberately
//                    sit next to history that succeeded, to catch a Skeptic that objects to anything familiar.
//
// eval/seed-eval.mjs creates these plans in your project (label skeptic-eval); eval/score.mjs scores the
// Skeptic's reviews against these labels and posts the measured precision to the dashboard.
// The same set runs offline in `npm test` against the radar (the deterministic first pass).

const LIVECHAT = ['In-app live chat for customers', 'Why we stopped live chat', 'DEC-014: No in-house chat; route customers to the service portal', 'Evening chat queue: customers waited over 40 minutes'];
const TRANSCRIPTS = ['Chat transcript retention: legal review', 'Why we stopped live chat'];

export const FREEZE = 'Peak season freeze: 2026-12-01 to 2027-01-10';

export const evalPlans = [
  // ---- Should be flagged ---------------------------------------------------
  { id: 'f01', expect: 'flag', summary: 'Add live chat to the customer app', text: ['Let customers chat with support from the order screen. The support team will answer chats.'], sources: [...LIVECHAT, ...TRANSCRIPTS] },
  { id: 'f02', expect: 'flag', summary: 'Evening live chat support for customers', text: ['Open a live chat channel from 6 pm to 10 pm, answered by the support team, because most delivery problems happen in the evening.'], sources: LIVECHAT },
  { id: 'f03', expect: 'flag', summary: 'Live chat for business customers', text: ['Business customers get a live chat button in the portal, answered by support agents.'], sources: [...LIVECHAT, ...TRANSCRIPTS] },
  { id: 'f04', expect: 'flag', summary: 'Outsourced live chat vendor for evenings', text: ['Contract a chat vendor to answer customer chats in the evenings so our own support team does not need a second shift.'], sources: LIVECHAT },
  { id: 'f05', expect: 'flag', summary: 'Chatbot that hands customers to a live agent at night', text: ['Extend the FAQ chatbot so that, when it cannot answer, it opens a live chat with a support agent, including at night.'], sources: LIVECHAT },
  { id: 'f06', expect: 'flag', summary: 'Keep chat transcripts to train a support assistant', text: ['Store every customer chat transcript for three years and use them to train an assistant.'], sources: TRANSCRIPTS },
  { id: 'f07', expect: 'flag', summary: 'In-app messaging between customers and drivers', text: ['Customers can message their driver in the app on the day of delivery. Messages are kept on our servers.'], sources: TRANSCRIPTS },
  { id: 'f08', expect: 'flag', summary: 'Drone delivery for rural districts', text: ['Use drones to deliver small parcels to villages that vans reach slowly.'], sources: ['Drone delivery pilot', 'Drone delivery pilot: retro'] },
  { id: 'f09', expect: 'flag', summary: 'Drone delivery of medical parcels to clinics', text: ['Fly urgent medical parcels to rural clinics by drone.'], sources: ['Drone delivery pilot', 'Drone delivery pilot: retro'] },
  { id: 'f10', expect: 'flag', summary: 'Blockchain record of every parcel hand-off', text: ['Write each scan and hand-off to a shared ledger so customers can verify custody.'], sources: ['Blockchain proof of custody'] },
  { id: 'f11', expect: 'flag', summary: 'Book pickups by voice with smart speakers', text: ['Customers book a pickup by talking to their smart speaker.'], sources: ['Voice ordering through smart speakers'] },
  { id: 'f12', expect: 'flag', summary: 'Loyalty points for frequent senders, second attempt', text: ['Give points per shipment that customers redeem for discounts.'], sources: ['Loyalty points for frequent senders', 'Loyalty points: why we stopped'] },
  { id: 'f13', expect: 'flag', summary: 'Rewards points for business customers', text: ['Business accounts earn points on every invoice and redeem them for free deliveries.'], sources: ['Loyalty points for frequent senders', 'Loyalty points: why we stopped'] },
  { id: 'f14', expect: 'flag', summary: 'Move the whole fleet to electric vans this year', text: ['Replace every diesel van with an electric van, using our current battery supplier.'], sources: ['Single supplier for electric van batteries', 'Fleet electrification plan 2026'] },
  { id: 'f15', expect: 'flag', summary: 'Use route optimisation for the old districts', text: ['Switch the old districts from manual routes to the routing engine.'], sources: ['Route optimisation sent vans down closed roads in old districts', 'Route optimisation v2: launch notes'] },
  { id: 'f16', expect: 'flag', summary: 'Automatic invoice reminder emails', text: ['Send business customers a reminder email when an invoice is overdue, from the monthly invoice job.'], sources: ['Invoice emails sent twice to business customers'] },
  { id: 'f17', expect: 'flag', rule: 'freeze', dueDate: '2026-12-20', summary: 'Checkout redesign for the holiday season', text: ['Redesign the booking checkout before the holidays.'], sources: [] },
  { id: 'f18', expect: 'flag', rule: 'freeze', dueDate: '2026-12-15', summary: 'Upgrade depot scanner firmware', text: ['Install the new firmware on every handheld scanner.'], sources: [] },

  // ---- Should be clean -----------------------------------------------------
  { id: 'c01', expect: 'clean', summary: 'Night-time colour scheme for the driver app', text: ['Offer a darker colour scheme that switches on automatically after sunset.'] },
  { id: 'c02', expect: 'clean', summary: 'Larger text option in the customer app', text: ['Add a setting for larger text for customers who find the app hard to read.'] },
  { id: 'c03', expect: 'clean', summary: 'Offline map caching for drivers', text: ['Drivers download the day’s maps at the depot so navigation works without signal.'] },
  { id: 'c04', expect: 'clean', summary: 'Customs paperwork checklist for cross-border parcels', text: ['A checklist that tells senders which forms a cross-border parcel needs.'] },
  { id: 'c05', expect: 'clean', summary: 'Fuel price dashboard for finance', text: ['A weekly chart of fuel prices per depot for the finance team.'] },
  { id: 'c06', expect: 'clean', summary: 'Parcel weight estimator at booking', text: ['Estimate a parcel’s weight from its size and contents so the price shown is closer to the final price.'] },
  { id: 'c07', expect: 'clean', summary: 'Show the estimated arrival time on the tracking map', text: ['Add an arrival time estimate to the live tracking map customers already use.'] },
  { id: 'c08', expect: 'clean', summary: 'Prompt drivers to retake blurry delivery photos', text: ['When a proof of delivery photo is blurry, ask the driver to take it again.'] },
  { id: 'c09', expect: 'clean', summary: 'Address autocomplete in the booking form', text: ['Suggest addresses as the customer types.'] },
  { id: 'c10', expect: 'clean', summary: 'Two-step login for the business portal', text: ['Business customers confirm sign-in with a code sent to their phone.'] },
  { id: 'c11', expect: 'clean', summary: 'Export monthly delivery reports as CSV', text: ['Business customers download their monthly deliveries as a spreadsheet.'] },
  { id: 'c12', expect: 'clean', summary: 'Tyre pressure check log for vans', text: ['Drivers record tyre pressure at the start of each shift.'] },
  { id: 'c13', expect: 'clean', summary: 'Public holiday calendar for depots', text: ['One calendar of public holidays per depot, used by scheduling.'] },
  { id: 'c14', expect: 'clean', summary: 'Printable shipping labels at home', text: ['Customers print the shipping label at home instead of at a depot.'] },
  { id: 'c15', expect: 'clean', summary: 'Recycled packaging option at checkout', text: ['Offer recycled boxes for a small fee at checkout.'] },
  { id: 'c16', expect: 'clean', summary: 'Weekend pickup slots for business customers', text: ['Let business customers book pickups on Saturdays.'] },
  { id: 'c17', expect: 'clean', summary: 'Driver training video library', text: ['Short videos on loading, lifting and customer handover for new drivers.'] },
  { id: 'c18', expect: 'clean', summary: 'Delivery satisfaction survey by email', text: ['Send the one-question satisfaction survey by email to customers without a mobile number.'] },
  { id: 'c19', expect: 'clean', summary: 'Barcode scanning for returns at depots', text: ['Depot staff scan returned parcels with the existing handheld scanners.'] },
  { id: 'c20', expect: 'clean', summary: 'Shift swap reminders for drivers', text: ['Remind drivers the day before a swapped shift.'] },
  { id: 'c21', expect: 'clean', summary: 'Self-service returns for business customers', text: ['Extend self-service returns booking to business accounts.'] },
  { id: 'c22', expect: 'clean', summary: 'Choose a two-hour window when rescheduling', text: ['When a customer reschedules a delivery, let them pick a new two-hour window.'] },
];

export const counts = () => ({
  total: evalPlans.length,
  flag: evalPlans.filter((p) => p.expect === 'flag').length,
  clean: evalPlans.filter((p) => p.expect === 'clean').length,
});
