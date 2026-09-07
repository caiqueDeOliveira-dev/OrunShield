// Supabase Edge Function (Deno runtime).
// Deploy: supabase functions deploy stripe-webhook --no-verify-jwt
// Configurar STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY
// como secrets da function (supabase secrets set).
//
// Este código roda fora do pacote @orun/identity (que é client-side) porque
// mexe com a secret key do Stripe e com service_role do Supabase — nunca
// deve rodar no Desktop/Mobile/TV diretamente.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@16?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature!, webhookSecret);
  } catch (err) {
    console.error('[stripe-webhook] assinatura inválida', err);
    return new Response('Invalid signature', { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed':
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      await syncSubscription(subscription);
      break;
    }
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      await supabase
        .from('subscriptions')
        .update({ status: 'canceled', updated_at: new Date().toISOString() })
        .eq('stripe_subscription_id', subscription.id);
      break;
    }
    default:
      // Eventos não tratados são ignorados intencionalmente — não falhar o webhook por isso.
      break;
  }

  return new Response('ok', { status: 200 });
});

async function syncSubscription(subscription: Stripe.Subscription) {
  // O tenant_id deve estar em subscription.metadata.tenant_id — setado no
  // momento da criação do Checkout Session (ver README, seção "Checkout").
  const tenantId = subscription.metadata?.tenant_id;
  if (!tenantId) {
    console.error('[stripe-webhook] subscription sem tenant_id em metadata', subscription.id);
    return;
  }

  const priceId = subscription.items.data[0]?.price.id;
  const { data: plan, error: planError } = await supabase
    .from('plans')
    .select('id')
    .eq('stripe_price_id', priceId)
    .single();

  if (planError || !plan) {
    console.error('[stripe-webhook] nenhum plan encontrado para price_id', priceId);
    return;
  }

  const statusMap: Record<string, string> = {
    trialing: 'trialing',
    active: 'active',
    past_due: 'past_due',
    canceled: 'canceled',
    incomplete: 'incomplete',
    incomplete_expired: 'canceled',
    unpaid: 'past_due',
  };

  await supabase.from('subscriptions').upsert(
    {
      tenant_id: tenantId,
      plan_id: plan.id,
      stripe_subscription_id: subscription.id,
      status: statusMap[subscription.status] ?? 'incomplete',
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'stripe_subscription_id' }
  );
}
