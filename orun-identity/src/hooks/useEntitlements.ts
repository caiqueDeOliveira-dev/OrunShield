import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { EntitlementsResolver, type ResolvedEntitlements } from '../core/EntitlementsResolver';

const EMPTY: ResolvedEntitlements = {
  plan: null,
  subscription: null,
  isActive: false,
  features: {},
};

/**
 * Hook de conveniência para os apps decidirem paywalls sem instanciar o
 * resolver manualmente. Refaz a consulta sempre que tenantId muda (ex: troca
 * de tenant ativo, ou após checkout do Stripe completar e o app forçar refresh).
 */
export function useEntitlements(supabase: SupabaseClient, tenantId: string | null) {
  const [resolved, setResolved] = useState<ResolvedEntitlements>(EMPTY);
  const [loading, setLoading] = useState<boolean>(Boolean(tenantId));
  const [error, setError] = useState<Error | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!tenantId) {
      setResolved(EMPTY);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const resolver = new EntitlementsResolver(supabase);
    resolver
      .resolve(tenantId)
      .then((result) => {
        if (!cancelled) setResolved(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [supabase, tenantId, refreshKey]);

  return {
    ...resolved,
    loading,
    error,
    hasFeature: (featureKey: string) => EntitlementsResolver.hasFeature(resolved, featureKey),
    getLimit: (featureKey: string, fallback: number) =>
      EntitlementsResolver.getLimit(resolved, featureKey, fallback),
    /** Chamar após retorno do Stripe Checkout para forçar nova consulta. */
    refresh: () => setRefreshKey((k) => k + 1),
  };
}
