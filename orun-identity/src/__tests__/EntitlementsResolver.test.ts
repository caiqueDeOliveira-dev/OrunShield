import { describe, it, expect, vi } from 'vitest';
import { EntitlementsResolver } from '../core/EntitlementsResolver';

function createMockSupabase(opts: {
  subRow?: any;
  entitlementRows?: any[];
}) {
  const from = vi.fn((table: string) => {
    if (table === 'subscriptions') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({ data: opts.subRow ?? null, error: null })),
      };
    }
    if (table === 'entitlements') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn(async () => ({ data: opts.entitlementRows ?? [], error: null })),
      };
    }
    throw new Error(`tabela inesperada: ${table}`);
  });
  return { from } as any;
}

const activeSubRow = {
  id: 'sub-1',
  tenant_id: 'tenant-1',
  plan_id: 'plan-1',
  status: 'active',
  current_period_end: '2026-09-01T00:00:00Z',
  cancel_at_period_end: false,
  plans: {
    id: 'plan-1',
    key: 'desktop_pro',
    name: 'Desktop Pro',
    stripe_price_id: 'price_123',
    max_devices: 3,
  },
};

describe('EntitlementsResolver', () => {
  it('retorna isActive=false e features vazias quando não há subscription', async () => {
    const supabase = createMockSupabase({ subRow: null });
    const resolver = new EntitlementsResolver(supabase);

    const result = await resolver.resolve('tenant-1');

    expect(result.isActive).toBe(false);
    expect(result.plan).toBeNull();
    expect(result.features).toEqual({});
  });

  it('resolve plan + subscription + entitlements para tenant com plano ativo', async () => {
    const supabase = createMockSupabase({
      subRow: activeSubRow,
      entitlementRows: [
        { feature_key: 'ai_agents_max', value: 15 },
        { feature_key: 'iptv_unlimited', value: true },
      ],
    });
    const resolver = new EntitlementsResolver(supabase);

    const result = await resolver.resolve('tenant-1');

    expect(result.isActive).toBe(true);
    expect(result.plan?.key).toBe('desktop_pro');
    expect(result.features.ai_agents_max).toBe(15);
    expect(result.features.iptv_unlimited).toBe(true);
  });

  it('trata status "trialing" como ativo', async () => {
    const supabase = createMockSupabase({
      subRow: { ...activeSubRow, status: 'trialing' },
      entitlementRows: [],
    });
    const resolver = new EntitlementsResolver(supabase);

    const result = await resolver.resolve('tenant-1');
    expect(result.isActive).toBe(true);
  });

  it('trata status "past_due" e "canceled" como inativo', async () => {
    for (const status of ['past_due', 'canceled']) {
      const supabase = createMockSupabase({
        subRow: { ...activeSubRow, status },
        entitlementRows: [],
      });
      const resolver = new EntitlementsResolver(supabase);
      const result = await resolver.resolve('tenant-1');
      expect(result.isActive).toBe(false);
    }
  });

  describe('hasFeature / getLimit (estáticos)', () => {
    it('hasFeature retorna false se subscription não está ativa, mesmo com feature presente', () => {
      const resolved = {
        plan: null,
        subscription: null,
        isActive: false,
        features: { ai_agents_max: 15 },
      };
      expect(EntitlementsResolver.hasFeature(resolved, 'ai_agents_max')).toBe(false);
    });

    it('hasFeature retorna true para feature booleana ativa', () => {
      const resolved = {
        plan: null,
        subscription: null,
        isActive: true,
        features: { iptv_unlimited: true },
      };
      expect(EntitlementsResolver.hasFeature(resolved, 'iptv_unlimited')).toBe(true);
    });

    it('getLimit retorna fallback quando inativo ou feature ausente', () => {
      const inactive = { plan: null, subscription: null, isActive: false, features: { x: 10 } };
      expect(EntitlementsResolver.getLimit(inactive, 'x', 1)).toBe(1);

      const activeNoFeature = { plan: null, subscription: null, isActive: true, features: {} };
      expect(EntitlementsResolver.getLimit(activeNoFeature, 'x', 1)).toBe(1);
    });

    it('getLimit retorna o valor numérico do plano quando ativo', () => {
      const resolved = { plan: null, subscription: null, isActive: true, features: { iptv_streams_max: 5 } };
      expect(EntitlementsResolver.getLimit(resolved, 'iptv_streams_max', 1)).toBe(5);
    });
  });
});
