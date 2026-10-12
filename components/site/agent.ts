/* The agent behind PropertyPro AI. Demo identity for this showcase site: replace with the real agent's details
 * (CEA rules require the agent's name and registration number, plus the agency's name and licence number, on
 * advertising, which is why they appear in every page footer). */
export const agent = {
  name: "Rachel Lim",
  firstName: "Rachel",
  initials: "RL",
  role: "Senior Property Consultant, Singapore",
  ceaReg: "R061842C",
  agency: "PropertyPro Realty Pte Ltd",
  agencyLicence: "L3010842K",
  hours: "Daily, 9am – 9pm",
  areas: "Ang Mo Kio, Bishan, Toa Payoh, Tampines and the city fringe",
  stats: [
    { value: "180+", label: "Homes sold" },
    { value: "S$142M", label: "Transacted" },
    { value: "4.9★", label: "Google rating" },
  ],
  testimonials: [
    {
      quote: "The valuation was within S$8k of our final price. Rachel showed us every comparable sale before we listed, so there was no guesswork.",
      name: "Wei Ming & Joanne",
      property: "Sold 4-room HDB, Ang Mo Kio",
    },
    {
      quote: "We had to sell our flat and buy a condo in the same window. The timeline was mapped out week by week and we never paid double rent.",
      name: "Priya S.",
      property: "Upgraded HDB to condo, Bishan",
    },
    {
      quote: "Clear about lease decay and COV from day one. We got three offers in the first weekend and closed above the asking price.",
      name: "Daniel Ong",
      property: "Sold 5-room HDB, Tampines",
    },
  ],
};

/* Demo case studies for the results section (SmartHomes' featured case + three cards). Replace with real sales. */
export const cases = {
  featured: {
    place: "Ang Mo Kio · 4-room HDB",
    title: "Sold above the range in nine days",
    detail: "92 sqm · storey 10–12 · 1979 lease",
    quote: agent.testimonials[0].quote,
    client: agent.testimonials[0].name,
    since: "Sold March 2026",
    estimate: 528000,
    sold: 541000,
    days: 9,
  },
  more: [
    {
      place: "Tampines · 5-room HDB",
      title: "Three offers in the first weekend",
      quote: "Clear about lease decay and COV from day one, so every buyer knew our price was fair.",
      client: "Daniel Ong",
      estimate: 640000,
      sold: 655000,
      days: 12,
    },
    {
      place: "Bishan · HDB to condo",
      title: "Upgraded with no double rent",
      quote: "Selling and buying in the same window was mapped out week by week. We never paid for two homes.",
      client: "Priya S.",
      estimate: 1620000,
      sold: 1650000,
      days: 21,
    },
    {
      place: "Toa Payoh · 3-room HDB",
      title: "Right-sized, right on time",
      quote: "We wanted something smaller near our daughter. The flat sold in two weeks and the dates lined up perfectly.",
      client: "Mdm Lee",
      estimate: 418000,
      sold: 425000,
      days: 14,
    },
  ],
  totals: [
    { value: "180+", label: "Homes sold" },
    { value: "S$142M", label: "Transacted" },
    { value: "4.9★", label: "Google rating" },
    { value: "14 days", label: "Median time to first offer" },
  ],
};
