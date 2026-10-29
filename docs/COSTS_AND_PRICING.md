# Costs, and how to set prices

The brief says: design pricing only after estimating the cost of delivery and testing
willingness to pay. This is the estimate and the test plan; it sets no prices.

## Cost per learner (estimates, check against your own usage data)

Figures from the admin dashboard's unit economics (`/admin/economics`) replace these once you
have real traffic.

| Item | Assumption | Cost |
|---|---|---|
| One tutor reply on Groq `gpt-oss-120b` | ~2,500 input + ~400 output tokens at $0.15 / $0.60 per million (configured prices) | ≈ $0.0006 |
| Second looks / rewrites | ≈ 10 % of replies call the model twice | +10 % |
| A typical session | 15 replies | ≈ $0.01 |
| An active learner per month | 12 sessions | ≈ $0.12 |
| Same on the university HPC | GPU time from the university allocation | $0 cash (allocation-limited) |
| Supabase, GitHub Pages | Free tiers while small | $0 |
| IremboPay | Transaction fee per payment (confirm the rate in your merchant agreement) | % of revenue |

Today Groq's **free** tier is used, so the cash cost is $0 until its daily limits are reached;
the HPC route moves free-plan traffic off Groq entirely when a job is running.

## Willingness to pay: what to test before setting prices

1. **Value first:** run the pilot in docs/EVALUATION_PLAN.md. Price only a product that shows
   independent-problem-solving gains or strong retention.
2. **Interviews** (15–20 students, 5 lecturers/heads of department): current spend on data
   bundles and tutoring, how they pay (MTN/Airtel mobile money), what they'd stop using.
3. **Price test** with real payments in IremboPay sandbox → production: offer Pro at two or three
   price points (e.g. per week, per month, per semester) to comparable groups; measure
   conversion and renewals, not stated intent.
4. **Institutional licensing:** the organisation features (seats, roster, dashboard) support a
   per-seat price for universities; sponsorship removes the student-affordability barrier.

## Constraints

- Student affordability in Rwanda/East Africa: prefer small, frequent mobile-money payments
  (IremboPay supports them) over large monthly card subscriptions.
- Keep a useful Free plan: the learning benefit should not depend on the ability to pay.
- Set plan prices in the database (`plans` table; currency RWF for IremboPay) and the matching
  amounts in the `IREMBOPAY_PLANS` secret; they must agree.
