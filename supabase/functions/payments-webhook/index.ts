import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyWebhook, EventName, type PaddleEnv } from '../_shared/paddle.ts';

// Credits-per-price mapping. Keep in sync with frontend Pricing page.
const SUBSCRIPTION_CREDITS: Record<string, number> = {
  math_pro_monthly: 50,
};
const TRIAL_CREDITS = 10; // granted when subscription starts in `trialing` status
const TOPUP_CREDITS: Record<string, number> = {
  credit_topup_25: 25,
  credit_topup_75: 75,
};

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
  }
  return _supabase;
}

async function upsertSubscription(data: any, env: PaddleEnv) {
  const { id, customerId, items, status, currentBillingPeriod, customData, scheduledChange } = data;
  const userId = customData?.userId;
  if (!userId) {
    console.error('No userId in customData');
    return null;
  }
  const item = items[0];
  const priceId = item.price?.importMeta?.externalId;
  const productId = item.product?.importMeta?.externalId;
  if (!priceId || !productId) {
    console.warn('Skipping subscription: missing importMeta.externalId');
    return null;
  }
  const sb = getSupabase();
  const { data: existing } = await sb
    .from('subscriptions')
    .select('last_granted_period_start')
    .eq('paddle_subscription_id', id)
    .maybeSingle();

  await sb.from('subscriptions').upsert({
    user_id: userId,
    paddle_subscription_id: id,
    paddle_customer_id: customerId,
    product_id: productId,
    price_id: priceId,
    status,
    current_period_start: currentBillingPeriod?.startsAt,
    current_period_end: currentBillingPeriod?.endsAt,
    cancel_at_period_end: scheduledChange?.action === 'cancel',
    environment: env,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'paddle_subscription_id' });

  return { userId, priceId, status, currentBillingPeriod, lastGranted: existing?.last_granted_period_start ?? null };
}

async function maybeGrantPeriodCredits(args: {
  userId: string;
  priceId: string;
  status: string;
  paddleSubscriptionId: string;
  periodStart?: string;
  periodEnd?: string;
  lastGranted: string | null;
}) {
  const { userId, priceId, status, paddleSubscriptionId, periodStart, periodEnd, lastGranted } = args;
  if (!periodStart || !periodEnd) return;
  if (lastGranted && new Date(lastGranted).getTime() >= new Date(periodStart).getTime()) {
    return; // already granted for this period
  }
  const amount =
    status === 'trialing' ? TRIAL_CREDITS : (SUBSCRIPTION_CREDITS[priceId] ?? 0);
  if (amount <= 0) return;

  const sb = getSupabase();
  const { error } = await sb.rpc('grant_subscription_credits', {
    _user_id: userId,
    _amount: amount,
    _expires_at: periodEnd,
  });
  if (error) {
    console.error('grant_subscription_credits failed', error);
    return;
  }
  await sb
    .from('subscriptions')
    .update({ last_granted_period_start: periodStart })
    .eq('paddle_subscription_id', paddleSubscriptionId);
}

async function handleSubscriptionEvent(data: any, env: PaddleEnv) {
  const result = await upsertSubscription(data, env);
  if (!result) return;
  await maybeGrantPeriodCredits({
    userId: result.userId,
    priceId: result.priceId,
    status: result.status,
    paddleSubscriptionId: data.id,
    periodStart: result.currentBillingPeriod?.startsAt,
    periodEnd: result.currentBillingPeriod?.endsAt,
    lastGranted: result.lastGranted,
  });
}

async function handleSubscriptionCanceled(data: any, env: PaddleEnv) {
  const sb = getSupabase();
  await sb.from('subscriptions')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('paddle_subscription_id', data.id)
    .eq('environment', env);

  // If canceled with no grace period (period already ended), expire credits now.
  const endsAt = data.currentBillingPeriod?.endsAt;
  if (!endsAt || new Date(endsAt).getTime() <= Date.now()) {
    const userId = data.customData?.userId;
    if (userId) {
      await sb.rpc('expire_all_credits', { _user_id: userId });
    }
  }
}

async function handleTransactionCompleted(data: any, env: PaddleEnv) {
  // Top-up purchases come through transaction.completed. Subscription renewal
  // transactions also fire this, but those credits are granted via the
  // subscription event. We only act on one-time top-up prices.
  const userId = data.customData?.userId;
  if (!userId) return;
  const sb = getSupabase();

  for (const item of data.items ?? []) {
    const priceId = item.price?.importMeta?.externalId;
    if (!priceId) continue;
    const credits = TOPUP_CREDITS[priceId];
    if (!credits) continue;
    const qty = item.quantity ?? 1;
    await sb.rpc('grant_topup_credits', {
      _user_id: userId,
      _amount: credits * qty,
      _metadata: { price_id: priceId, transaction_id: data.id, environment: env },
    });
  }
}

async function handleWebhook(req: Request, env: PaddleEnv) {
  const event = await verifyWebhook(req, env);
  console.log('Paddle event:', event.eventType, 'env:', env);

  // Idempotency: Paddle retries failed webhooks for up to 3 days.
  // We use event.eventId (stable per delivered notification) so duplicates
  // never re-grant credits or re-process state changes.
  const eventId = (event as any).eventId as string | undefined;
  if (eventId) {
    const sb = getSupabase();
    const { error } = await sb
      .from('processed_paddle_events')
      .insert({ event_id: eventId, event_type: event.eventType, environment: env });
    if (error) {
      // 23505 = unique_violation → already processed, ack 200.
      if ((error as any).code === '23505') {
        console.log('Duplicate event, skipping:', eventId);
        return;
      }
      throw error;
    }
  }

  switch (event.eventType) {
    case EventName.SubscriptionCreated:
    case EventName.SubscriptionUpdated:
      await handleSubscriptionEvent(event.data, env);
      break;
    case EventName.SubscriptionCanceled:
      await handleSubscriptionCanceled(event.data, env);
      break;
    case EventName.TransactionCompleted:
      await handleTransactionCompleted(event.data, env);
      break;
    default:
      console.log('Unhandled event:', event.eventType);
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  const url = new URL(req.url);
  const env = (url.searchParams.get('env') || 'sandbox') as PaddleEnv;
  try {
    await handleWebhook(req, env);
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('Webhook error:', e);
    return new Response('Webhook error', { status: 400 });
  }
});