import { describe, it, expect, vi } from 'vitest';
import { AuditLogger } from '../core/AuditLogger';

describe('AuditLogger', () => {
  it('insere o evento na tabela audit_log com os campos mapeados', async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const supabase = { from: vi.fn(() => ({ insert })) } as any;

    const logger = new AuditLogger(supabase);
    await logger.log({
      tenantId: 'tenant-1',
      userId: 'user-1',
      eventType: 'login_success',
      metadata: { email: 'a@b.com' },
    });

    expect(supabase.from).toHaveBeenCalledWith('audit_log');
    expect(insert).toHaveBeenCalledWith({
      tenant_id: 'tenant-1',
      user_id: 'user-1',
      event_type: 'login_success',
      metadata: { email: 'a@b.com' },
    });
  });

  it('usa null para tenantId/userId ausentes e {} para metadata ausente', async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const supabase = { from: vi.fn(() => ({ insert })) } as any;

    const logger = new AuditLogger(supabase);
    await logger.log({ eventType: 'logout' });

    expect(insert).toHaveBeenCalledWith({
      tenant_id: null,
      user_id: null,
      event_type: 'logout',
      metadata: {},
    });
  });

  it('não lança quando o insert falha — best-effort', async () => {
    const insert = vi.fn(async () => ({ error: { message: 'boom' } }));
    const supabase = { from: vi.fn(() => ({ insert })) } as any;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const logger = new AuditLogger(supabase);
    await expect(logger.log({ eventType: 'login_failed' })).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
