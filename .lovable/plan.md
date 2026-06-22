# Pricing & Subscription Plan (pending payment provider integration)

Single source of truth for the monetisation model. Implementation is blocked on Stripe/Paddle setup (user awaiting ID verification).

## Tiers

### Free tier (no account required beyond sign-in)
- Full searchable question archive across all six 9709 modules (P1, P2, P3, S1, S2, M1)
- View question images and associated mark scheme images
- "Show me another" navigation
- No AI features (no marking, no hints, no AI feedback)
- Cost to us: effectively zero per user

### Paid tier — "Practice+"
- **R50 / month = 50 credits/month**
- **7-day free trial** with **10 free credits** (no card required to start trial; card required to convert)
- Unlocks:
  - AI marking of uploaded/drawn answers (1 credit each)
  - AI hints (1 credit each)
  - Test Maker — **free to generate and print** (draw-card feature; revenue comes from marking the completed printed tests)
  - Saving worked answers
- **Top-ups**: R25 = 25 credits (1:1 with subscription rate; keeps pricing transparent)
- **Credit rollover**: unused credits roll over for **one month** only
- **Cancellation**: credits remain usable for **one month** after cancellation, then expire
- **Inactivity policy**:
  - 30 days no AI use → reminder email
  - 60 days no AI use → auto-pause subscription (no further charges) until user reactivates

## Credit costs (per action)
| Action | Credits |
|---|---|
| AI mark a single question (uploaded or drawn answer) | 1 |
| AI hint on a single question | 1 |
| Test Maker — generate/print a test | 0 (free) |
| Test Maker — AI mark each question on completed test | 1 per question |
| Search / view questions / view mark schemes | 0 (free tier) |

## Admin
- `ccborchers@gmail.com` is the sole admin
- Admin bypasses all credit checks and tier gating
- All other accounts default to free user role

## Implementation blockers
- Payment provider (Stripe or Paddle) — requires user's ID verification
- Until then: no `subscriptions` table, no credit ledger, no paywall enforcement

## Implementation order (once payments unblocked)
1. `credits` ledger table + `subscriptions` table (RLS, GRANTs, has_role checks)
2. Server-side credit deduction in the AI marking and hint edge functions
3. Paywall UI on AI features for free users
4. Stripe/Paddle webhook → grant credits on successful payment
5. Trial flow (7 days, 10 credits, no card)
6. Top-up purchase flow
7. Inactivity cron (30/60 day reminders + auto-pause)
8. Storage refactor: move base64 student work out of `student_attempts.image_url` into `student-work` bucket before scaling past pilot

## Open items
- Currency display (ZAR only vs. multi-currency)
- Whether hints cost 1 credit or a fractional amount (currently 1)
- Annual plan discount (deferred)