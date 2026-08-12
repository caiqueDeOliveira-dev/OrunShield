import { z } from "zod";
export interface DiskUsageNode {
    path: string;
    name: string;
    type: "file" | "directory";
    sizeBytes: number;
    /** Só presente em diretórios — filhos ordenados do maior pro menor. */
    children?: DiskUsageNode[];
}
export interface DiskUsageScanResult {
    rootPath: string;
    totalSizeBytes: number;
    tree: DiskUsageNode;
    /** Os N maiores arquivos/pastas encontrados, achatados (útil pra UI sem precisar navegar a árvore toda). */
    topconsumers: DiskUsageNode[];
    scannedAt: string;
    filesScanned: number;
    /** Caminhos que não puderam ser lidos (permissão negada, etc) — não interrompe o scan, só é reportado. */
    errors: {
        path: string;
        message: string;
    }[];
}
export declare const JunkCategorySchema: z.ZodEnum<["temp-file", "cache", "log-file", "old-installer", "empty-folder", "os-junk", "trash-recycle-bin", "old-downloads"]>;
export type JunkCategory = z.infer<typeof JunkCategorySchema>;
export interface JunkCandidate {
    path: string;
    category: JunkCategory;
    sizeBytes: number;
    reason: string;
    /** Idade do arquivo em dias desde a última modificação — relevante pra categorias como old-downloads. */
    ageDays: number;
}
export interface JunkScanResult {
    rootPath: string;
    candidates: JunkCandidate[];
    totalReclaimableBytes: number;
    scannedAt: string;
}
export interface PendingDeletionEntry {
    id: string;
    originalPath: string;
    holdingPath: string;
    category: JunkCategory | "manual";
    sizeBytes: number;
    movedAt: string;
    /** Depois dessa data, elegível pra purga automática (se o app rodar uma limpeza periódica). Nunca apagado sem essa janela. */
    eligibleForPurgeAt: string;
}
export interface CleanupActionResult {
    success: boolean;
    entry?: PendingDeletionEntry;
    error?: string;
}
export declare const PackageManagerKindSchema: z.ZodEnum<["winget", "brew", "apt"]>;
export type PackageManagerKind = z.infer<typeof PackageManagerKindSchema>;
export interface OutdatedPackage {
    id: string;
    displayName: string;
    currentVersion: string;
    availableVersion: string;
    source: PackageManagerKind;
}
export interface UpdateCheckResult {
    source: PackageManagerKind;
    outdated: OutdatedPackage[];
    checkedAt: string;
}
export interface UpdateActionResult {
    success: boolean;
    packageId: string;
    output?: string;
    error?: string;
}
