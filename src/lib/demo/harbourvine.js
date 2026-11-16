// Harbour & Vine: a fictional group of six restaurants in Accra, Kumasi and Takoradi. Plans are Epics,
// incidents are Bugs, decisions and retros live in Confluence. All people and events are invented.
import { epic } from './builders.js';

export const company = { id: 'harbourvine', name: 'Harbour & Vine', project: 'HV', planType: 'Epic', incidentType: 'Bug', confluence: true };

export const epics = [
  // ---- 2021 ------------------------------------------------------------------
  epic('Online table reservations', 'shipped', 'March 2021', 'Akosua Mensah', 'Guests book a table on our website instead of calling the restaurant.', ['Reservation widget on the website', 'Table plan for each restaurant', 'Confirmation SMS to guests']),
  epic('Kitchen display screens', 'shipped', 'July 2021', 'Joseph Tetteh', 'Orders appear on screens in the kitchen instead of paper tickets.', ['Screens at every cooking station', 'Order timers per dish', 'Training for head chefs']),
  epic('Regulars club with birthday treats', 'shipped', 'October 2021', 'Akosua Mensah', 'Regular guests sign up and get a free dessert in their birthday month.', ['Sign-up card at the till', 'Birthday dessert voucher', 'Regulars list export for marketing']),
  // ---- 2022 ------------------------------------------------------------------
  epic(
    'Table-side ordering tablets',
    'abandoned',
    'September 2022',
    'Kojo Asamoah',
    'Goal: a tablet on every table so guests order and pay without waiting for a waiter. Piloted at Osu and Adum.',
    ['Tablet ordering app pilot', 'Tablet stands and charging at tables', 'Menu photos for the tablet app'],
    {
      why: 'tablets were dropped, stolen or out of charge every week, the Wi-Fi dropped at the terrace tables, and older guests asked for a waiter anyway. Average spend per table fell during the pilot.',
      comment: 'Ending the tablet pilot. Guests miss the waiter and the hardware does not survive service.',
    },
  ),
  epic('Central prep kitchen in Accra', 'shipped', 'May 2022', 'Joseph Tetteh', 'Sauces, stocks and pastry made in one prep kitchen and sent to the Accra restaurants each morning.', ['Prep kitchen fit-out', 'Morning van run to the restaurants', 'Batch recipes for sauces']),
  epic('Supplier ordering app', 'shipped', 'August 2022', 'Efua Quaye', 'Head chefs order from suppliers in one app with agreed prices.', ['Supplier price lists', 'Order approval by the group buyer', 'Delivery check-in at the back door']),
  epic('Weekend brunch menu', 'shipped', 'November 2022', 'Joseph Tetteh', 'A brunch menu on Saturdays and Sundays at three restaurants.', ['Brunch menu tasting', 'Brunch staffing plan', 'Brunch price review']),
  // ---- 2023 ------------------------------------------------------------------
  epic(
    'Delivery-only kitchen brand "Night Bowl"',
    'abandoned',
    'August 2023',
    'Kojo Asamoah',
    'Goal: a delivery-only kitchen brand selling late-night rice bowls through the delivery apps, cooked after our restaurants close.',
    ['Night Bowl menu and packaging', 'Listing on two delivery apps', 'Late shift for two cooks'],
    { why: 'the delivery apps took 30 percent of every order and late-night orders never covered the cost of the extra shift.' },
  ),
  epic('Staff scheduling app', 'shipped', 'February 2023', 'Efua Quaye', 'Managers publish the weekly rota and staff swap shifts in an app.', ['Rota templates per restaurant', 'Shift swap requests', 'Overtime report']),
  epic('Tip pooling and payouts', 'shipped', 'April 2023', 'Efua Quaye', 'Card tips are pooled per shift and paid out with wages.', ['Tip pool rules', 'Payout report for payroll', 'Tip rules for the rooftop bar']),
  epic('Menu engineering review', 'shipped', 'June 2023', 'Joseph Tetteh', 'Rework every menu around the dishes that sell and make money.', ['Dish profit analysis', 'New menu layouts', 'Menu reprint for all restaurants']),
  // ---- 2024 ------------------------------------------------------------------
  epic('Digital menu with allergen filter', 'shipped', 'January 2024', 'Akosua Mensah', 'A QR-code menu where guests filter dishes by allergen: nuts, gluten, dairy, shellfish.', ['Allergen data for every dish', 'Filter buttons on the digital menu', 'Kitchen sign-off of allergen data']),
  epic('Catering for corporate events', 'shipped', 'March 2024', 'Kojo Asamoah', 'Packages for office lunches and launches, delivered by our own vans.', ['Catering menu and price list', 'Event booking form', 'Van and staff schedule for events']),
  epic('Rooftop bar at the Osu restaurant', 'shipped', 'May 2024', 'Akosua Mensah', 'Open the roof as a bar with small plates.', ['Roof safety inspection', 'Bar menu', 'Rooftop reservations']),
  epic('Inventory counts on phones', 'shipped', 'July 2024', 'Efua Quaye', 'Weekly stock counts done on a phone instead of clipboards.', ['Count sheets per store room', 'Variance report']),
  epic('Drive-through window at the Spintex branch', 'abandoned', 'October 2024', 'Kojo Asamoah', 'A drive-through window for takeaway at Spintex.', ['Traffic survey', 'Window design'], { why: 'the city would not approve a queue lane on the main road and the traffic survey showed cars backing onto it.' }),
  epic('Food waste tracking', 'shipped', 'November 2024', 'Joseph Tetteh', 'Kitchens weigh what is thrown away each night.', ['Scales in every kitchen', 'Weekly waste report']),
  // ---- 2025 ------------------------------------------------------------------
  epic('Gift cards', 'shipped', 'February 2025', 'Akosua Mensah', 'Gift cards sold at the till and online, valid at all six restaurants.', ['Gift card design and printing', 'Balance check online', 'Corporate gift card orders']),
  epic('Pay at the table by QR code', 'shipped', 'April 2025', 'Efua Quaye', 'Guests scan a code on the bill and pay by card or mobile money; the waiter still takes the order.', ['QR code on every bill', 'Mobile money payments', 'Split the bill']),
  epic('Takoradi restaurant opening', 'shipped', 'June 2025', 'Kojo Asamoah', 'Our sixth restaurant, by the harbour in Takoradi.', ['Lease and fit-out', 'Hiring and training the opening team', 'Opening week menu']),
  epic('Wine pairing suggestions on the menu', 'shipped', 'August 2025', 'Joseph Tetteh', 'A suggested wine for each main course.', ['Pairing tasting with the wine supplier', 'Menu reprint', 'Staff wine training']),
  epic('Guest feedback by SMS', 'shipped', 'October 2025', 'Akosua Mensah', 'One question by SMS the morning after a reservation.', ['Feedback question wording', 'Weekly feedback summary', 'Manager follow-up on low scores']),
  // ---- 2026 ------------------------------------------------------------------
  epic('Kitchen energy monitoring', 'in-progress', 'January 2026', 'Joseph Tetteh', 'Meters on ovens and cold rooms to cut the electricity bill.', ['Meters in two kitchens', 'Monthly energy report']),
  epic('Sunday cooking classes', 'in-progress', 'March 2026', 'Joseph Tetteh', 'Paid cooking classes in the Osu kitchen on Sunday mornings.', ['Class menu', 'Booking page']),
  epic('Second prep kitchen in Kumasi', 'todo', 'April 2026', 'Kojo Asamoah', 'A prep kitchen for the Kumasi restaurants.', ['Site search in Kumasi']),
  epic('Private dining room bookings', 'todo', 'May 2026', 'Akosua Mensah', 'Book the private room online with a set menu.', ['Set menus for private dining']),
];

// The plans the demo reviews. Created last, left in To Do. `expect` is what a judge should see.
export const plans = [
  {
    key: 'tablets',
    summary: 'Self-order tablets at every table',
    text: ['Guests order and pay from a tablet at their table, so waiters spend less time taking orders. Start with all six restaurants.', 'Proposed by: operations. Target: Q2 2027.'],
    dueDate: '2027-05-31',
    expect: 'several',
    sources: ['Table-side ordering tablets', 'Tablet ordering went down on Valentine’s night', 'Wi-Fi does not reach the terrace and garden tables', 'Tablet ordering: why we stopped', 'DEC-07: Waiters take every order; no self-order tablets'],
  },
  {
    key: 'nightbowl',
    summary: 'Open a delivery-only kitchen brand for late-night orders',
    text: ['Sell a separate late-night menu only through the delivery apps, under its own brand name, cooked after the restaurants close.', 'Proposed by: growth team. Target: Q3 2027.'],
    dueDate: '2027-08-31',
    expect: 'one',
    sources: ['Delivery-only kitchen brand "Night Bowl"'],
  },
  {
    key: 'allergens',
    summary: 'Allergen icons on the printed menus',
    text: ['Print small icons next to each dish for nuts, gluten, dairy and shellfish, matching the filter on the digital menu.', 'Proposed by: front of house. Target: Q1 2027.'],
    dueDate: '2027-02-28',
    expect: 'none',
  },
];

export const incidents = [
  {
    summary: 'Tablet ordering went down on Valentine’s night',
    text: ['On 14 February 2022, during the tablet pilot at Osu, the ordering tablets lost Wi-Fi at 8 pm. Orders sat unsent for 25 minutes and waiters had to retake every order on paper.', 'Resolved by switching the pilot tables back to waiters for the rest of the night.'],
  },
  { summary: 'Walk-in fridge failed at the prep kitchen', text: ['On 3 March 2023 the walk-in fridge at the prep kitchen failed overnight and we threw away two days of sauces and stocks.', 'Resolved with a temperature alarm that calls the duty manager.'] },
  { summary: 'Card machines offline on the Independence Day weekend', text: ['On 6 March 2024 the card machines at three restaurants were offline for three hours because the payment provider had an outage.', 'Workaround: mobile money by QR code as a backup.'] },
  { summary: 'Rooftop double-booked for two parties', text: ['On 21 September 2025 the reservations system let two private parties book the whole rooftop for the same evening.', 'Fixed by making the rooftop one bookable space.'] },
  { summary: 'Catering van broke down on the way to an event', text: ['On 12 November 2024 a catering van broke down on the motorway and lunch for 200 guests arrived 90 minutes late.', 'Resolved by a standby van hire agreement.'] },
];

export const risks = [
  { summary: 'Wi-Fi does not reach the terrace and garden tables', text: ['Raised during the tablet pilot in 2022: the restaurant Wi-Fi drops at the terrace and garden tables at Osu and Adum. Never fixed.'] },
  { summary: 'One fish supplier for all six restaurants', text: ['All fish comes from one supplier in Tema. A problem there takes fish off every menu.'] },
  { summary: 'Gas supply contract ends June 2027', text: ['The kitchens’ gas contract ends in June 2027 and no new quote has been requested.'] },
];

export const pages = [
  {
    title: 'Tablet ordering: why we stopped',
    html: `<p><strong>Retro, 4 October 2022.</strong> Facilitator: Kojo Asamoah.</p>
<h2>What happened</h2><p>We put ordering tablets on 40 tables at Osu and Adum from June to September 2022.</p>
<h2>Why we stopped</h2><ul>
<li><strong>Hardware.</strong> Tablets were dropped, stolen or flat every week; we replaced 11 in three months.</li>
<li><strong>Wi-Fi.</strong> Orders failed at the terrace and garden tables, where the signal drops.</li>
<li><strong>Guests.</strong> Older guests and large groups asked for a waiter anyway, and average spend per table fell, because waiters were no longer suggesting starters and drinks.</li></ul>
<h2>What we would need to try again</h2><p>Wi-Fi that covers every table, rugged hardware with a budget for losses, and a way for waiters to keep upselling.</p>`,
  },
  {
    title: 'DEC-07: Waiters take every order; no self-order tablets',
    html: `<p><strong>Decision record.</strong> Decided 12 October 2022 by Ama Darko, Managing Director.</p>
<h2>Decision</h2><p>Harbour &amp; Vine restaurants will not use self-order tablets. Waiters take every order. Guests may pay at the table by card or code.</p>
<h2>Reasons</h2><p>See "Tablet ordering: why we stopped". Spend per table is higher when a waiter takes the order.</p>
<h2>Revisit when</h2><p>Wi-Fi covers every table and a trial shows spend per table does not fall.</p>`,
  },
  { title: 'Drive-through at Spintex: retro', html: '<p><strong>Retro, November 2024.</strong> The city would not approve a queue lane on the main road. Revisit only at a site with its own car park.</p>' },
  { title: 'Allergen information: kitchen guide', html: '<p>Every dish has its allergens recorded before it goes on the menu. The head chef signs off the list. The digital menu filter reads from the same list.</p>' },
  { title: 'Opening checklist for a new restaurant', html: '<p>Lease, fit-out, licences, hiring, training, soft launch, opening week. Used for Takoradi in 2025.</p>' },
  { title: 'Menu engineering 2023: notes', html: '<p>Stars, plough-horses, puzzles and dogs for every dish. We removed 14 dishes and moved the best sellers to the top right of the menu.</p>' },
  { title: 'Peak nights playbook', html: '<p>Valentine’s, Mother’s Day, Christmas Eve and New Year’s Eve: extra staff, a shorter menu and two sittings.</p>' },
  { title: 'Supplier list and order days', html: '<p>Fish from Tema on Monday and Thursday, vegetables daily, dry goods weekly.</p>' },
  { title: 'Front of house handbook', html: '<p>Greeting guests, taking orders, suggesting drinks and starters, handling complaints.</p>' },
  { title: 'Catering price list 2025', html: '<p>Office lunch boxes, buffets and canapés, priced per head.</p>' },
  { title: 'Team directory', html: '<p>Ama Darko, Managing Director. Kojo Asamoah, Operations. Joseph Tetteh, Executive Chef. Akosua Mensah, Guest Experience. Efua Quaye, Finance and People.</p>' },
];
