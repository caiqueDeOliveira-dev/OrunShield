import type { SupabaseClient } from '@supabase/supabase-js';

export interface AccountDeletionBlockedResult {
  blocked: true;
  reason: 'sole_owner_of_organization';
  message: string;
  blockedTenants: string[];
}

export type AccountDeletionResult = { blocked: false } | AccountDeletionBlockedResult;

/**
 * Wrappers finos para as Edge Functions de LGPD (`export-user-data`,
 * `delete-account`). A lógica sensível — juntar dados de todas as tabelas,
 * decidir se pode apagar um owner de organização — vive só no servidor;
 * aqui é só a chamada e o tratamento de erro esperado.
 */
export class PrivacyClient {
  constructor(private readonly supabase: SupabaseClient) {}

  /** Retorna o JSON completo com os dados do usuário autenticado (portabilidade, LGPD art. 18 V). */
  async exportUserData(): Promise<Record<string, unknown>> {
    const { data, error } = await this.supabase.functions.invoke('export-user-data');
    if (error) throw error;
    return data as Record<string, unknown>;
  }

  /**
   * Solicita a exclusão da conta (direito ao esquecimento, LGPD art. 18 VI).
   * Pode retornar `blocked: true` se o usuário for o único owner de uma
   * organização — nesse caso a conta não foi apagada, e a UI deve orientar
   * a transferir titularidade primeiro.
   */
  async requestAccountDeletion(): Promise<AccountDeletionResult> {
    const { data, error } = await this.supabase.functions.invoke('delete-account');

    if (error) {
      // supabase-js expõe o corpo de respostas non-2xx via error.context, quando disponível.
      const context = (error as { context?: { json?: () => Promise<unknown> } }).context;
      if (context?.json) {
        const body = (await context.json()) as { error?: string; message?: string; blockedTenants?: string[] };
        if (body.error === 'sole_owner_of_organization') {
          return {
            blocked: true,
            reason: 'sole_owner_of_organization',
            message: body.message ?? 'Transfira a titularidade da organização antes de excluir sua conta.',
            blockedTenants: body.blockedTenants ?? [],
          };
        }
      }
      throw error;
    }

    void data;
    return { blocked: false };
  }
}
