// Plan catalogue shown when the app runs without a backend (developer mode).
// Mirrors the seed in supabase/migrations/20261024000000_menya_core.sql; in
// commercial mode the plans come from the server instead, so keep them in sync.
export const PLAN_CATALOG = [
  {
    id: "free", name: "Free", tagline: "Try guided tutoring", priceMonthlyCents: 0,
    daily: 20, monthly: 300, premium: 0,
    features: ["Step-by-step Socratic tutoring", "Three progressive hints per problem", "Your sessions saved to your account"],
  },
  {
    id: "pro", name: "Pro", tagline: "For regular study", priceMonthlyCents: 1500, highlight: true,
    daily: 150, monthly: 3000, premium: 0,
    features: ["Everything in Free", "Many more messages each day", "Longer sessions that remember more of your work",
      "More detailed explanations and checks", "A stronger model for hard questions", "Up to 3 pictures or diagrams a day"],
  },
  {
    id: "professional", name: "Unlimited", tagline: "Unlimited pictures and practically unlimited practice", priceMonthlyCents: 2000,
    daily: 1000, monthly: 20000, premium: 190,
    features: ["Everything in Pro", "Unlimited pictures and diagrams", "Practically unlimited messages (fair use)", "Our strongest standard model for everyday tutoring",
      "Advanced reasoning on hard problems, within a monthly allowance"],
  },
];

export function formatUsd(cents) {
  return cents === 0 ? "Free" : `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
}
