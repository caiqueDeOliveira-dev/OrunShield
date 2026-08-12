"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CleanupManager = void 0;
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
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
class CleanupManager {
    holdingDir;
    metadataDir;
    holdingPeriodDays;
    constructor(config) {
        this.holdingDir = config.holdingDir;
        this.metadataDir = (0, node_path_1.join)(config.holdingDir, ".metadata");
        this.holdingPeriodDays = config.holdingPeriodDays ?? 7;
    }
    async ensureReady() {
        await (0, promises_1.mkdir)(this.holdingDir, { recursive: true });
        await (0, promises_1.mkdir)(this.metadataDir, { recursive: true });
    }
    /** Move um candidato (vindo do `JunkFileDetector` ou escolhido manualmente na UI) pra área de espera. */
    async moveToHolding(candidate) {
        await this.ensureReady();
        try {
            const originalStat = await (0, promises_1.stat)(candidate.path).catch(() => null);
            if (!originalStat) {
                return { success: false, error: `Caminho não encontrado (pode já ter sido movido/apagado): ${candidate.path}` };
            }
            const id = (0, node_crypto_1.randomUUID)();
            const holdingPath = (0, node_path_1.join)(this.holdingDir, id);
            await (0, promises_1.rename)(candidate.path, holdingPath);
            const now = new Date();
            const eligibleAt = new Date(now.getTime() + this.holdingPeriodDays * 24 * 60 * 60 * 1000);
            const entry = {
                id,
                originalPath: candidate.path,
                holdingPath,
                category: "category" in candidate ? candidate.category : "manual",
                sizeBytes: candidate.sizeBytes,
                movedAt: now.toISOString(),
                eligibleForPurgeAt: eligibleAt.toISOString(),
            };
            await (0, promises_1.writeFile)(this.metadataPath(id), JSON.stringify(entry, null, 2), "utf-8");
            return { success: true, entry };
        }
        catch (err) {
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    }
    /** Move vários candidatos de uma vez — falhas individuais não interrompem o restante do lote. */
    async moveManyToHolding(candidates) {
        const results = [];
        for (const candidate of candidates) {
            results.push(await this.moveToHolding(candidate));
        }
        return results;
    }
    async list() {
        await this.ensureReady();
        const files = await (0, promises_1.readdir)(this.metadataDir);
        const entries = [];
        for (const file of files) {
            if (!file.endsWith(".json"))
                continue;
            const raw = await (0, promises_1.readFile)((0, node_path_1.join)(this.metadataDir, file), "utf-8");
            entries.push(JSON.parse(raw));
        }
        return entries.sort((a, b) => b.movedAt.localeCompare(a.movedAt));
    }
    /** Devolve o item pro local original — usar se o usuário mudar de ideia antes da purga definitiva. */
    async restore(id) {
        const entry = await this.getEntry(id);
        if (!entry)
            return { success: false, error: `Item não encontrado na área de espera: ${id}` };
        try {
            await (0, promises_1.mkdir)((0, node_path_1.dirname)(entry.originalPath), { recursive: true });
            await (0, promises_1.rename)(entry.holdingPath, entry.originalPath);
            await (0, promises_1.unlink)(this.metadataPath(id));
            return { success: true, entry };
        }
        catch (err) {
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    }
    /** Apaga definitivamente — ação irreversível. Usar só depois que o usuário confirmar de vez, ou automaticamente após `eligibleForPurgeAt` se o app tiver essa rotina configurada. */
    async permanentlyDelete(id) {
        const entry = await this.getEntry(id);
        if (!entry)
            return { success: false, error: `Item não encontrado na área de espera: ${id}` };
        try {
            await (0, promises_1.rm)(entry.holdingPath, { recursive: true, force: true });
            await (0, promises_1.unlink)(this.metadataPath(id));
            return { success: true, entry };
        }
        catch (err) {
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    }
    /**
     * Purga tudo que já passou do prazo de espera (`eligibleForPurgeAt`).
     * NUNCA é chamado automaticamente pelo pacote — precisa ser explicitamente
     * agendado pelo app (ex: um cron diário), pra que apagar de verdade seja
     * sempre uma decisão consciente de quem integra o pacote, não um
     * comportamento oculto rodando sozinho.
     */
    async purgeEligible() {
        const entries = await this.list();
        const now = Date.now();
        const eligible = entries.filter((e) => new Date(e.eligibleForPurgeAt).getTime() <= now);
        const results = [];
        for (const entry of eligible) {
            results.push(await this.permanentlyDelete(entry.id));
        }
        return results;
    }
    async getEntry(id) {
        try {
            const raw = await (0, promises_1.readFile)(this.metadataPath(id), "utf-8");
            return JSON.parse(raw);
        }
        catch {
            return null;
        }
    }
    metadataPath(id) {
        return (0, node_path_1.join)(this.metadataDir, `${id}.json`);
    }
}
exports.CleanupManager = CleanupManager;
