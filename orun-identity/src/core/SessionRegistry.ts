import type { SupabaseClient } from '@supabase/supabase-js';
import type { Device, DevicePlatform } from '../types';

/**
 * Gerencia o registro de dispositivos/sessões ativas por tenant — a base
 * tanto para a tela "dispositivos conectados" quanto para o enforcement de
 * limite de devices por plano (ver plans.max_devices no schema).
 */
export class SessionRegistry {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Registra (ou atualiza last_seen_at de) o dispositivo atual. `fingerprint`
   * deve ser estável entre reinícios do app na mesma máquina/instalação.
   */
  async registerDevice(params: {
    tenantId: string;
    userId: string;
    platform: DevicePlatform;
    name: string;
    fingerprint: string;
  }): Promise<Device> {
    const { data, error } = await this.supabase
      .from('user_devices')
      .upsert(
        {
          tenant_id: params.tenantId,
          user_id: params.userId,
          platform: params.platform,
          name: params.name,
          fingerprint: params.fingerprint,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,fingerprint' }
      )
      .select('*')
      .single();

    if (error) throw error;
    return this.mapDevice(data);
  }

  async listActiveDevices(tenantId: string): Promise<Device[]> {
    const { data, error } = await this.supabase
      .from('user_devices')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('revoked_at', null)
      .order('last_seen_at', { ascending: false });

    if (error) throw error;
    return data.map(this.mapDevice);
  }

  /** Revoga um device remotamente — a sessão correspondente deve ser invalidada no próximo refresh. */
  async revokeDevice(deviceId: string): Promise<void> {
    const { error } = await this.supabase
      .from('user_devices')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', deviceId);
    if (error) throw error;

    await this.supabase
      .from('sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('device_id', deviceId)
      .is('revoked_at', null);
  }

  private mapDevice(row: Record<string, unknown>): Device {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      userId: row.user_id as string,
      platform: row.platform as DevicePlatform,
      name: row.name as string,
      fingerprint: row.fingerprint as string,
      lastSeenAt: row.last_seen_at as string,
      revokedAt: (row.revoked_at as string) ?? null,
      createdAt: row.created_at as string,
    };
  }
}
