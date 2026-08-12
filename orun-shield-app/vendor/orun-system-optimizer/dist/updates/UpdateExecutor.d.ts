import type { UpdateActionResult, PackageManagerKind } from "../types.js";
/**
 * Executa a atualização de um pacote específico via o gerenciador nativo.
 * Assim como o `FirewallManager` do Shield, algumas dessas operações
 * exigem privilégios elevados (ex: `apt-get install` no Linux) — o app
 * precisa solicitar elevação (UAC/sudo/polkit) antes de chamar isso,
 * este módulo não eleva privilégios sozinho.
 */
export declare class UpdateExecutor {
    update(kind: PackageManagerKind, packageId: string): Promise<UpdateActionResult>;
    /** Atualiza vários pacotes em sequência — uma falha não interrompe o restante do lote. */
    updateMany(kind: PackageManagerKind, packageIds: string[]): Promise<UpdateActionResult[]>;
    private runUpdateCommand;
    private run;
}
