import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useEntitlements } from '../hooks/useEntitlements';

function createMockSupabase(subRow: any, entitlementRows: any[] = []) {
  const from = vi.fn((table: string) => {
    if (table === 'subscriptions') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({ data: subRow, error: null })),
      };
    }
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn(async () => ({ data: entitlementRows, error: null })),
    };
  });
  return { from } as any;
}

describe('useEntitlements', () => {
  it('retorna isActive=false imediatamente quando tenantId é null', () => {
    const supabase = createMockSupabase(null);
    const { result } = renderHook(() => useEntitlements(supabase, null));

    expect(result.current.isActive).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it('resolve entitlements quando tenantId é fornecido', async () => {
    const supabase = createMockSupabase(
      {
        id: 'sub-1',
        tenant_id: 'tenant-1',
        plan_id: 'plan-1',
        status: 'active',
        current_period_end: null,
        cancel_at_period_end: false,
        plans: { id: 'plan-1', key: 'pro', name: 'Pro', stripe_price_id: 'price_1', max_devices: 3 },
      },
      [{ feature_key: 'ai_agents_max', value: 15 }]
    );

    const { result } = renderHook(() => useEntitlements(supabase, 'tenant-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isActive).toBe(true);
    expect(result.current.hasFeature('ai_agents_max')).toBe(true);
    expect(result.current.getLimit('ai_agents_max', 1)).toBe(15);
  });

  it('refresh() força nova consulta', async () => {
    const supabase = createMockSupabase(null);
    const { result } = renderHook(() => useEntitlements(supabase, 'tenant-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    const callsBefore = (supabase.from as any).mock.calls.length;

    act(() => result.current.refresh());

    await waitFor(() => expect((supabase.from as any).mock.calls.length).toBeGreaterThan(callsBefore));
  });
});
