import { describe, it, expect, vi } from 'vitest';
import { PrivacyClient } from '../core/PrivacyClient';

describe('PrivacyClient', () => {
  it('exportUserData retorna os dados vindos da Edge Function', async () => {
    const invoke = vi.fn(async () => ({ data: { profile: { id: 'user-1' } }, error: null }));
    const supabase = { functions: { invoke } } as any;

    const client = new PrivacyClient(supabase);
    const result = await client.exportUserData();

    expect(invoke).toHaveBeenCalledWith('export-user-data');
    expect(result).toEqual({ profile: { id: 'user-1' } });
  });

  it('exportUserData propaga erro quando a function falha', async () => {
    const invoke = vi.fn(async () => ({ data: null, error: new Error('boom') }));
    const supabase = { functions: { invoke } } as any;

    const client = new PrivacyClient(supabase);
    await expect(client.exportUserData()).rejects.toThrow('boom');
  });

  it('requestAccountDeletion retorna blocked=false em sucesso', async () => {
    const invoke = vi.fn(async () => ({ data: { deleted: true }, error: null }));
    const supabase = { functions: { invoke } } as any;

    const client = new PrivacyClient(supabase);
    const result = await client.requestAccountDeletion();

    expect(result).toEqual({ blocked: false });
  });

  it('requestAccountDeletion retorna blocked=true com detalhes quando é sole owner', async () => {
    const fakeError = {
      context: {
        json: async () => ({
          error: 'sole_owner_of_organization',
          message: 'Transfira a titularidade antes de excluir.',
          blockedTenants: ['tenant-1'],
        }),
      },
    };
    const invoke = vi.fn(async () => ({ data: null, error: fakeError }));
    const supabase = { functions: { invoke } } as any;

    const client = new PrivacyClient(supabase);
    const result = await client.requestAccountDeletion();

    expect(result.blocked).toBe(true);
    if (result.blocked) {
      expect(result.reason).toBe('sole_owner_of_organization');
      expect(result.blockedTenants).toEqual(['tenant-1']);
    }
  });

  it('requestAccountDeletion propaga erro genérico quando não é o caso conhecido', async () => {
    const fakeError = { context: { json: async () => ({ error: 'unknown_error' }) } };
    const invoke = vi.fn(async () => ({ data: null, error: fakeError }));
    const supabase = { functions: { invoke } } as any;

    const client = new PrivacyClient(supabase);
    await expect(client.requestAccountDeletion()).rejects.toBe(fakeError);
  });
});
