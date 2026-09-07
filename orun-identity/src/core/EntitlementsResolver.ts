import type { SupabaseClient } from '@supabase/supabase-js';
import type { Entitlement, Subscription, SubscriptionStatus } from '../types';

export interface Plan {
  id: string;
  key: string;
  name: string;
  stripePriceId: string | null;
  maxDevices: number;
}

export interface ResolvedEntitlements {
  plan: Plan | null;
  subscription: Subscription | null;
  /** true para status que devem liberar acesso: 'active' e 'trialing'. */
  isActive: boolean;
  features: Record<string, unknown>;
}

const ACTIVE_STATUSES: SubscriptionStatus[] = ['active', 'trialing'];

/**
 * Resolve o que um tenant tem direito a usar, combinando subscriptions +
 * plans + entitlements. Os apps consultam isto para decidir mostrar
 * paywall ou liberar uma feature — nunca hardcodam limites no client.
 *
 * Fail-safe: se não houver subscription ativa, retorna isActive = false e
 * features vazio — os apps devem tratar isso como "plano free/sem acesso",
 * nunca assumir acesso liberado por omissão.
 */
export class EntitlementsResolver {
  constructor(private readonly supabase: SupabaseClient) {}

  async resolve(tenantId: string): Promise<ResolvedEntitlements> {
    const { data: subRow, error: subError } = await this.supabase
      .from('subscriptions')
      .select('*, plans(*)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subError) throw subError;

    if (!subRow) {
      return { plan: null, subscription: null, isActive: false, features: {} };
    }

    const subscription: Subscription = {
      id: subRow.id,
      tenantId: subRow.tenant_id,
      planId: subRow.plan_id,
      status: subRow.status,
      currentPeriodEnd: subRow.current_period_end,
      cancelAtPeriodEnd: subRow.cancel_at_period_end,
    };

    const plan: Plan = {
      id: subRow.plans.id,
      key: subRow.plans.key,
      name: subRow.plans.name,
      stripePriceId: subRow.plans.stripe_price_id,
      maxDevices: subRow.plans.max_devices,
    };

    const isActive = ACTIVE_STATUSES.includes(subscription.status);

    const { data: entitlementRows, error: entError } = await this.supabase
      .from('entitlements')
      .select('feature_key, value')
      .eq('plan_id', plan.id);

    if (entError) throw entError;

    const features: Record<string, unknown> = {};
    for (const row of entitlementRows as Array<Pick<Entitlement, 'featureKey'> & { feature_key: string; value: unknown }>) {
      features[row.feature_key] = row.value;
    }

    return { plan, subscription, isActive, features };
  }

  /** Atalho para checagens booleanas simples, ex: hasFeature(resolved, 'ai_agents_unlimited'). */
  static hasFeature(resolved: ResolvedEntitlements, featureKey: string): boolean {
    if (!resolved.isActive) return false;
    return Boolean(resolved.features[featureKey]);
  }

  /** Atalho para limites numéricos, ex: getLimit(resolved, 'iptv_streams_max', 1). */
  static getLimit(resolved: ResolvedEntitlements, featureKey: string, fallback: number): number {
    if (!resolved.isActive) return fallback;
    const value = resolved.features[featureKey];
    return typeof value === 'number' ? value : fallback;
  }
}
