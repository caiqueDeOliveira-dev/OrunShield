import type { JunkCandidate, PendingDeletionEntry, CleanupActionResult } from "../types.js";
export interface CleanupManagerConfig {
    /** Pasta de espera — arquivos ficam aqui antes de serem apagados de verdade. */
    holdingDir: string;
    /** Dias que um item fica na área de espera antes de ficar elegível pra purga automática (se o app rodar isso periodicamente). Purga nunca é automática por padrão — só marca elegibilidade. */
    holdingPeriodDays?: number;
}
/**
 * Remove arquivos/pastas identificados como junk (ou escolhidos manualmente
 * pelo usuário na tela de "uso de disco") — mas nunca apaga direto.
 * Move pra uma pasta de espera primeiro, com metadados, exatamente como o
 * `QuarantineManager` do Shield faz com ameaças — a diferença é que aqui o
 * motivo é "usuário não quer mais isso", não "isso é perigoso".
 *
 * Isso importa especialmente pro caso de uso descrito: "deletar o que não
 * quero mais depois de ver onde o espaço está sendo usado" — dar ao
 * usuário uma segunda chance antes de apagar de verdade evita que um clique
 * errado apague algo importante sem volta.
 */
export declare class CleanupManager {
    private readonly holdingDir;
    private readonly metadataDir;
    private readonly holdingPeriodDays;
    constructor(config: CleanupManagerConfig);
    ensureReady(): Promise<void>;
    /** Move um candidato (vindo do `JunkFileDetector` ou escolhido manualmente na UI) pra área de espera. */
    moveToHolding(candidate: JunkCandidate | {
        path: string;
        sizeBytes: number;
    }): Promise<CleanupActionResult>;
    /** Move vários candidatos de uma vez — falhas individuais não interrompem o restante do lote. */
    moveManyToHolding(candidates: (JunkCandidate | {
        path: string;
        sizeBytes: number;
    })[]): Promise<CleanupActionResult[]>;
    list(): Promise<PendingDeletionEntry[]>;
    /** Devolve o item pro local original — usar se o usuário mudar de ideia antes da purga definitiva. */
    restore(id: string): Promise<CleanupActionResult>;
    /** Apaga definitivamente — ação irreversível. Usar só depois que o usuário confirmar de vez, ou automaticamente após `eligibleForPurgeAt` se o app tiver essa rotina configurada. */
    permanentlyDelete(id: string): Promise<CleanupActionResult>;
    /**
     * Purga tudo que já passou do prazo de espera (`eligibleForPurgeAt`).
     * NUNCA é chamado automaticamente pelo pacote — precisa ser explicitamente
     * agendado pelo app (ex: um cron diário), pra que apagar de verdade seja
     * sempre uma decisão consciente de quem integra o pacote, não um
     * comportamento oculto rodando sozinho.
     */
    purgeEligible(): Promise<CleanupActionResult[]>;
    private getEntry;
    private metadataPath;
}
