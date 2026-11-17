// Sunfield Energy: a fictional pay-as-you-go solar company selling home systems on monthly payments.
// Plans are "Initiative"s, incidents have their own "Incident" type, and there is no Confluence, so all
// history lives in Jira. All people and events are invented.
import { epic } from './builders.js';

export const company = { id: 'sunfield', name: 'Sunfield Energy', project: 'SE', planType: 'Initiative', incidentType: 'Incident', confluence: false };

export const epics = [
  // ---- 2021 ------------------------------------------------------------------
  epic('Solar home system starter kit', 'shipped', 'January 2021', 'Esi Badu', 'A panel, battery, three lights and a phone charger, paid off over 18 months.', ['Kit supplier contract', 'Installer checklist', 'Customer contract in English and Twi']),
  epic('Mobile money monthly payments', 'shipped', 'April 2021', 'Fiifi Coleman', 'Customers pay each month by mobile money; the system unlocks for 30 days.', ['Mobile money collection account', 'Payment-to-unlock service', 'Payment receipts by SMS']),
  epic('Field agent app', 'shipped', 'August 2021', 'Adwoa Sarpong', 'Agents register customers, take the deposit and book the install.', ['Customer registration form', 'Deposit collection', 'Install booking']),
  // ---- 2022 ------------------------------------------------------------------
  epic('Remote lock and unlock', 'shipped', 'February 2022', 'Fiifi Coleman', 'Systems lock when a payment is missed and unlock within a minute of paying.', ['Unlock code service', 'Grace period rules', 'Unlock code by SMS fallback']),
  epic('Solar TV bundle', 'shipped', 'May 2022', 'Esi Badu', 'A 24-inch TV that runs on the home system, added to the plan.', ['TV supplier trial', 'Bundle pricing', 'TV warranty process']),
  epic('Agent referral bonus', 'shipped', 'July 2022', 'Adwoa Sarpong', 'Agents earn a bonus for each customer who completes three payments.', ['Bonus rules', 'Bonus payout report', 'Bonus fraud checks']),
  epic(
    'Airtime top-up payments',
    'abandoned',
    'November 2022',
    'Fiifi Coleman',
    'Goal: customers without mobile money pay their monthly bill by sending phone airtime.',
    ['Telco airtime collection agreement', 'Airtime to cedi conversion rules', 'Pilot in the Volta region'],
    {
      why: 'the telcos paid the airtime money out to us weeks late and kept 15 percent, so systems stayed locked after customers had paid and the margin disappeared.',
      comment: 'Closing the airtime pilot. Customers paid and were still locked out while we waited for the telco.',
    },
  ),
  // ---- 2023 ------------------------------------------------------------------
  epic(
    'Solar water pumps for smallholder farmers',
    'abandoned',
    'September 2023',
    'Esi Badu',
    'Goal: sell solar water pumps to farmers for irrigation, paid back monthly like the home systems.',
    ['Pump supplier trial', 'Farmer pilot in the Bono East region'],
    { why: 'farmers earn at harvest, not every month; 60 percent of pump customers fell behind within four months and the pumps were hard to take back from the fields.' },
  ),
  epic('Credit scoring from payment history', 'shipped', 'March 2023', 'Fiifi Coleman', 'Customers who pay on time can buy upgrades without a new deposit.', ['Score model', 'Upgrade offer screen in the agent app', 'Score explanation for agents']),
  epic('Battery replacement programme', 'shipped', 'June 2023', 'Kwabena Owusu', 'Swap ageing batteries for customers who finished paying.', ['Battery health check by agents', 'Replacement price list', 'Old battery recycling partner']),
  epic('Northern region warehouse', 'shipped', 'October 2023', 'Kwabena Owusu', 'A warehouse in Tamale so northern installs do not wait for stock from Kumasi.', ['Warehouse lease', 'Stock transfer schedule', 'Stock count in Tamale']),
  // ---- 2024 ------------------------------------------------------------------
  epic('Solar fridges for small shops', 'shipped', 'February 2024', 'Esi Badu', 'A solar fridge for shops that sell cold drinks, on a 24-month plan.', ['Fridge supplier contract', 'Shop owner contract', 'Fridge temperature check by agents']),
  epic('USSD self-service menu', 'shipped', 'April 2024', 'Fiifi Coleman', 'Customers check their balance and unlock codes by dialling a short code.', ['Short code from the telco', 'Balance and code menus', 'USSD menu in Twi and Dagbani']),
  epic('Customer call centre in Tamale', 'shipped', 'June 2024', 'Adwoa Sarpong', 'A call centre with Dagbani and Twi speakers.', ['Call centre hiring', 'Call scripts', 'Call recording for quality checks']),
  epic('Installer certification course', 'shipped', 'August 2024', 'Kwabena Owusu', 'A two-day course every installer must pass.', ['Course material', 'Practical test', 'Refresher course every two years']),
  epic('Mini-grid for an island community', 'abandoned', 'November 2024', 'Esi Badu', 'A small grid for a village on Lake Volta.', ['Site survey', 'Permit application', 'Community meeting with the chief'], { why: 'the energy commission permit would take two years and boat transport doubled the cost of every part.' }),
  // ---- 2025 ------------------------------------------------------------------
  epic('Upgrade to a bigger system', 'shipped', 'February 2025', 'Esi Badu', 'Customers add a second panel and battery without starting a new plan.', ['Upgrade pricing', 'Agent upgrade flow', 'Upgrade install scheduling']),
  epic('Agent commission dashboard', 'shipped', 'April 2025', 'Adwoa Sarpong', 'Agents see their sales and commission each week.', ['Commission rules', 'Weekly dashboard', 'Commission dispute form']),
  epic('Theft reporting and tracking', 'shipped', 'June 2025', 'Kwabena Owusu', 'Customers report a stolen panel; the system is locked and flagged.', ['Theft report form', 'Lock on report', 'Police report template']),
  epic('Solar for rural schools', 'shipped', 'September 2025', 'Esi Badu', 'Lights and a laptop charger for rural schools, paid by sponsors.', ['Sponsor agreement', 'School install schedule', 'School visit report']),
  epic('Customer app for Android', 'shipped', 'November 2025', 'Fiifi Coleman', 'Balance, payments and support in an app for customers with smartphones.', ['Balance and payment screens', 'Support request form', 'App sign-in with phone number']),
  // ---- 2026 ------------------------------------------------------------------
  epic('Clean cooking stove bundle', 'in-progress', 'January 2026', 'Esi Badu', 'An electric pressure cooker added to larger systems.', ['Cooker supplier trial', 'Energy use test', 'Cooking demo for customers']),
  epic('Carbon credit reporting', 'in-progress', 'March 2026', 'Kwabena Owusu', 'Report the kerosene our systems replace, for carbon credits.', ['Measurement method', 'Annual report', 'Kerosene use survey']),
  epic('Expansion to Togo', 'todo', 'April 2026', 'Adwoa Sarpong', 'Sell home systems in Lomé and the south of Togo.', ['Market study']),
  epic('E-bike charging points', 'todo', 'May 2026', 'Kwabena Owusu', 'Charging points for electric motorbike taxis.', ['Partner search']),
];

// The plans the demo reviews. Created last, left in To Do. `expect` is what a judge should see.
export const plans = [
  {
    key: 'airtime',
    summary: 'Let customers pay their monthly bill with airtime',
    text: ['Many customers have no mobile money account. Let them pay the monthly bill by sending airtime from their phone, collected through the telcos.', 'Proposed by: collections team. Target: Q2 2027.'],
    dueDate: '2027-05-31',
    expect: 'several',
    sources: ['Airtime top-up payments', 'Airtime payments stuck for nine days; 1,200 systems locked', 'Telco settlement contract has no penalty for late payouts'],
  },
  {
    key: 'pumps',
    summary: 'Solar water pumps for farmers',
    text: ['Offer solar water pumps for irrigation to farmers in the north.', 'Proposed by: new markets team. Target: Q3 2027.'],
    dueDate: '2027-09-30',
    expect: 'one',
    sources: ['Solar water pumps for smallholder farmers'],
  },
  {
    key: 'referral',
    summary: 'Referral bonus for customers who bring a neighbour',
    text: ['When a customer refers a neighbour who signs up, give the customer one free week of power after the neighbour’s third monthly payment, the same rule as the agent referral bonus.', 'Proposed by: sales team. Target: Q1 2027.'],
    dueDate: '2027-02-28',
    expect: 'none',
  },
];

export const incidents = [
  {
    summary: 'Airtime payments stuck for nine days; 1,200 systems locked',
    text: ['In October 2022, during the airtime top-up pilot, the telco held our airtime settlements for nine days. 1,200 customers who had paid stayed locked out, and the call centre took 3,000 complaint calls.', 'Resolved by unlocking the pilot customers by hand and closing the pilot.'],
  },
  { summary: 'Unlock codes failed after a server update', text: ['On 8 August 2023 a server update broke the unlock service for six hours and paying customers stayed dark overnight.', 'Fixed by rolling back; updates now happen in the morning.'] },
  { summary: 'Counterfeit batteries sold by a rogue agent', text: ['In April 2024 an agent in Techiman swapped new batteries for fakes and resold the originals.', 'Resolved by serial number checks at install.'] },
  { summary: 'USSD menu down on a payday weekend', text: ['On 28 February 2025 the short code stopped working for a day and customers could not get their codes.', 'Workaround: the call centre read out codes by phone.'] },
  { summary: 'Tamale warehouse flooded', text: ['On 2 September 2024 heavy rain flooded the Tamale warehouse and 300 panels were damaged.', 'Resolved by moving stock onto racks and insuring the warehouse.'] },
];

export const risks = [
  { summary: 'Telco settlement contract has no penalty for late payouts', text: ['Raised during the airtime pilot in 2022: our contract with the telcos lets them pay airtime money out whenever they like, with no penalty for paying late. Never renegotiated.'] },
  { summary: 'Panel prices tied to the US dollar', text: ['Panels are bought in dollars; a weaker cedi raises the cost of every new kit.'] },
  { summary: 'Agent churn above 30 percent a year', text: ['A third of field agents leave each year, and new agents sell less in their first months.'] },
];

export const pages = [];
