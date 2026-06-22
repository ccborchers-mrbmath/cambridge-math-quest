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

## VIP tier (owner-granted, off-menu)

Not publicly listed. Granted manually by admin (`ccborchers@gmail.com`) to a small number of trusted colleagues.

### Mechanism (preferred: combined)
1. **`vip` role** on `user_roles` (alongside `student`, `admin`).
2. **Credit multiplier**: VIPs burn **0.2 credits** per AI action (mark or hint) instead of 1 — so 50 credits ≈ 250 AI marks.
   - Implemented server-side in the credit-deduction logic of the AI edge functions. Multiplier read from a single config (e.g. `vip_credit_multiplier` constant or `profiles.credit_multiplier` column) so it can be tuned without code changes.
3. **Stripe/Paddle coupon** (once payments are live): permanent discount on the R50 plan for VIP accounts (e.g. 80% off → R10/month, or 100% off → free). Handles the cash side cleanly via the payment provider.

### Admin UX
- Toggle "VIP" on a user from the admin dashboard (grants the `vip` role).
- Optional per-user multiplier override on `profiles` for one-off arrangements.

### Rules
- VIP status does not bypass credit accounting entirely (unlike admin) — usage is still tracked for visibility.
- VIP does not grant access to `/admin` pages.
- Revoking the role reverts the user to standard 1-credit-per-action rates immediately.