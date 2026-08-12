import { TypedEmitter } from "../utils/TypedEmitter.js";
import type { ShieldEventMap, ThreatFinding } from "../types.js";
export interface QuarantineManagerConfig {
    /** Pasta onde os arquivos isolados ficam guardados. Deve estar fora de qualquer pasta monitorada/sincronizada. */
    quarantineDir: string;
}
export interface QuarantineEntry {
    id: string;
    originalPath: string;
    quarantinedPath: string;
    sha256AtQuarantine: string;
    finding: ThreatFinding;
    quarantinedAt: string;
}
export interface QuarantineActionResult {
    success: boolean;
    entry?: QuarantineEntry;
    error?: string;
}
/**
 * Isola arquivos identificados como ameaça — a diferença entre um sistema
 * que só "avisa" e um antivírus de verdade. O arquivo NUNCA é apagado
 * automaticamente: é movido para uma pasta isolada, com permissões
 * revogadas (não pode ser executado nem lido por outros processos), e
 * fica lá até o usuário decidir restaurar ou apagar permanentemente.
 *
 * Isso é intencional: falsos positivos acontecem (mesmo com ClamAV/VT),
 * e apagar automaticamente um arquivo legítimo do usuário seria pior do
 * que deixar uma ameaça real momentaneamente isolada esperando decisão.
 */
export declare class QuarantineManager extends TypedEmitter<ShieldEventMap> {
    private readonly quarantineDir;
    private readonly metadataDir;
    constructor(config: QuarantineManagerConfig);
    ensureReady(): Promise<void>;
    /**
     * Move o arquivo referenciado pelo finding para a quarentena.
     * Falha graciosamente (não lança exceção) se o arquivo já não existir
     * mais, se o finding não tiver `filePath`, ou se a operação de mover
     * falhar por permissão — quem chama decide o que fazer com `success: false`.
     */
    quarantine(finding: ThreatFinding): Promise<QuarantineActionResult>;
    list(): Promise<QuarantineEntry[]>;
    /**
     * Devolve o arquivo pro local original — usar só quando o usuário tem
     * certeza de que foi falso positivo. Verifica a integridade do hash
     * antes de restaurar (garante que o arquivo em quarentena não foi
     * adulterado enquanto estava lá).
     */
    restore(id: string): Promise<QuarantineActionResult>;
    /** Apaga definitivamente o arquivo em quarentena e seus metadados. Ação irreversível. */
    permanentlyDelete(id: string): Promise<QuarantineActionResult>;
    private getEntry;
    private metadataPath;
}
