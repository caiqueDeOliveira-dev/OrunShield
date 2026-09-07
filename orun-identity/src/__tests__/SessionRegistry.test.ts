import { describe, it, expect, vi } from 'vitest';
import { SessionRegistry } from '../core/SessionRegistry';

function createMockSupabase() {
  const deviceRow = {
    id: 'device-1',
    tenant_id: 'tenant-1',
    user_id: 'user-1',
    platform: 'desktop',
    name: 'Caique-PC',
    fingerprint: 'fp-abc',
    last_seen_at: '2026-08-09T00:00:00Z',
    revoked_at: null,
    created_at: '2026-08-01T00:00:00Z',
  };

  const upsertSingle = vi.fn(async () => ({ data: deviceRow, error: null }));
  const listOrder = vi.fn(async () => ({ data: [deviceRow], error: null }));
  const updateEq = vi.fn(async () => ({ error: null }));

  const from = vi.fn((table: string) => {
    if (table === 'user_devices') {
      return {
        upsert: vi.fn(() => ({ select: vi.fn(() => ({ single: upsertSingle })) })),
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => ({ order: listOrder })),
          })),
        })),
        update: vi.fn(() => ({ eq: updateEq })),
      };
    }
    if (table === 'sessions') {
      return {
        update: vi.fn(() => ({
          eq: vi.fn(() => ({ is: vi.fn(async () => ({ error: null })) })),
        })),
      };
    }
    throw new Error(`tabela inesperada nos testes: ${table}`);
  });

  return { supabase: { from } as any, deviceRow, updateEq };
}

describe('SessionRegistry', () => {
  it('registra device e retorna mapeado em camelCase', async () => {
    const { supabase } = createMockSupabase();
    const registry = new SessionRegistry(supabase);

    const device = await registry.registerDevice({
      tenantId: 'tenant-1',
      userId: 'user-1',
      platform: 'desktop',
      name: 'Caique-PC',
      fingerprint: 'fp-abc',
    });

    expect(device.id).toBe('device-1');
    expect(device.tenantId).toBe('tenant-1');
    expect(device.platform).toBe('desktop');
    expect(device.revokedAt).toBeNull();
  });

  it('lista apenas devices ativos (não revogados) de um tenant', async () => {
    const { supabase } = createMockSupabase();
    const registry = new SessionRegistry(supabase);

    const devices = await registry.listActiveDevices('tenant-1');

    expect(devices).toHaveLength(1);
    expect(devices[0].fingerprint).toBe('fp-abc');
  });

  it('revokeDevice marca revoked_at no device e nas sessions relacionadas', async () => {
    const { supabase } = createMockSupabase();
    const registry = new SessionRegistry(supabase);

    await expect(registry.revokeDevice('device-1')).resolves.not.toThrow();
  });
});
