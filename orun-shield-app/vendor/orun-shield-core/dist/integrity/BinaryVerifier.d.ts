import { TypedEmitter } from "../utils/TypedEmitter.js";
import type { ShieldEventMap, ThreatFinding } from "../types.js";
interface Manifest {
    generatedAt: string;
    entries: Record<string, string>;
}
/**
 * Protege o próprio Orun OS/Hampton: gera um manifesto de hashes SHA-256
 * dos binários/arquivos críticos da instalação e verifica no boot (ou
 * sob demanda) se algo foi alterado — detecta tanto malware que injeta
 * código nos próprios binários do Orun quanto builds corrompidos/adulterados.
 *
 * Fluxo recomendado:
 *  1. No pipeline de build/release (CI), gerar o manifesto com `generateManifest`
 *     e assiná-lo/publicá-lo junto do instalador.
 *  2. No app rodando, chamar `verify` no startup e comparar contra o manifesto
 *     baixado (não o gerado localmente — senão um binário adulterado poderia
 *     gerar seu próprio manifesto "válido").
 */
export declare class BinaryVerifier extends TypedEmitter<ShieldEventMap> {
    generateManifest(rootDir: string, extensions?: string[]): Promise<Manifest>;
    saveManifest(manifest: Manifest, outputPath: string): Promise<void>;
    loadManifest(manifestPath: string): Promise<Manifest>;
    /**
     * Compara o estado atual do diretório contra um manifesto de referência
     * (idealmente baixado de uma fonte confiável, não gerado localmente).
     */
    verify(rootDir: string, referenceManifest: Manifest): Promise<ThreatFinding[]>;
    private toFinding;
    private walk;
}
export {};
