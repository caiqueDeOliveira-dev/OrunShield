"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuarantineManager = void 0;
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const TypedEmitter_js_1 = require("../utils/TypedEmitter.js");
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
class QuarantineManager extends TypedEmitter_js_1.TypedEmitter {
    quarantineDir;
    metadataDir;
    constructor(config) {
        super();
        this.quarantineDir = config.quarantineDir;
        this.metadataDir = (0, node_path_1.join)(config.quarantineDir, ".metadata");
    }
    async ensureReady() {
        await (0, promises_1.mkdir)(this.quarantineDir, { recursive: true });
        await (0, promises_1.mkdir)(this.metadataDir, { recursive: true });
    }
    /**
     * Move o arquivo referenciado pelo finding para a quarentena.
     * Falha graciosamente (não lança exceção) se o arquivo já não existir
     * mais, se o finding não tiver `filePath`, ou se a operação de mover
     * falhar por permissão — quem chama decide o que fazer com `success: false`.
     */
    async quarantine(finding) {
        if (!finding.filePath) {
            return { success: false, error: "Finding não tem filePath associado — nada para colocar em quarentena." };
        }
        await this.ensureReady();
        try {
            const originalPath = finding.filePath;
            const originalStat = await (0, promises_1.stat)(originalPath).catch(() => null);
            if (!originalStat) {
                return { success: false, error: `Arquivo não encontrado (pode já ter sido movido/apagado): ${originalPath}` };
            }
            const sha256 = (0, node_crypto_1.createHash)("sha256").update(await (0, promises_1.readFile)(originalPath)).digest("hex");
            const id = (0, node_crypto_1.randomUUID)();
            const quarantinedPath = (0, node_path_1.join)(this.quarantineDir, id);
            await (0, promises_1.rename)(originalPath, quarantinedPath);
            // Remove todas as permissões de execução/escrita — só leitura pro dono, e mesmo assim só pra restauração.
            // No Windows o chmod não é POSIX: 0o400 seta o atributo READONLY, que impediria modificação de teste E o
            // unlink do permanentlyDelete (deixaria o arquivo órfão). Então no Windows a proteção fica por conta da
            // ACL da pasta de quarentena, não do atributo do arquivo.
            if (process.platform !== "win32") {
                await (0, promises_1.chmod)(quarantinedPath, 0o400).catch(() => {
                    // Falha de chmod é best-effort (ex: filesystem sem suporte a permissões).
                });
            }
            const entry = {
                id,
                originalPath,
                quarantinedPath,
                sha256AtQuarantine: sha256,
                finding,
                quarantinedAt: new Date().toISOString(),
            };
            await (0, promises_1.writeFile)(this.metadataPath(id), JSON.stringify(entry, null, 2), "utf-8");
            return { success: true, entry };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.emit("error", { source: "orchestrator", message: `Falha ao colocar em quarentena: ${message}` });
            return { success: false, error: message };
        }
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
        return entries.sort((a, b) => b.quarantinedAt.localeCompare(a.quarantinedAt));
    }
    /**
     * Devolve o arquivo pro local original — usar só quando o usuário tem
     * certeza de que foi falso positivo. Verifica a integridade do hash
     * antes de restaurar (garante que o arquivo em quarentena não foi
     * adulterado enquanto estava lá).
     */
    async restore(id) {
        const entry = await this.getEntry(id);
        if (!entry)
            return { success: false, error: `Entrada de quarentena não encontrada: ${id}` };
        try {
            const currentHash = (0, node_crypto_1.createHash)("sha256").update(await (0, promises_1.readFile)(entry.quarantinedPath)).digest("hex");
            if (currentHash !== entry.sha256AtQuarantine) {
                return {
                    success: false,
                    error: "Integridade do arquivo em quarentena não bate com o hash original — restauração bloqueada por segurança.",
                };
            }
            await (0, promises_1.mkdir)((0, node_path_1.dirname)(entry.originalPath), { recursive: true });
            await (0, promises_1.chmod)(entry.quarantinedPath, 0o644).catch(() => { });
            await (0, promises_1.rename)(entry.quarantinedPath, entry.originalPath);
            await (0, promises_1.unlink)(this.metadataPath(id));
            return { success: true, entry };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, error: message };
        }
    }
    /** Apaga definitivamente o arquivo em quarentena e seus metadados. Ação irreversível. */
    async permanentlyDelete(id) {
        const entry = await this.getEntry(id);
        if (!entry)
            return { success: false, error: `Entrada de quarentena não encontrada: ${id}` };
        try {
            // Limpa READONLY (atributo setado por chmod em Windows, se o arquivo tiver vindo de versão anterior) —
            // sem isso o unlink falha com EPERM e o arquivo fica órfão.
            await (0, promises_1.chmod)(entry.quarantinedPath, 0o644).catch(() => { });
            await (0, promises_1.unlink)(entry.quarantinedPath).catch(() => {
                // Já pode ter sido removido manualmente — não bloqueia a limpeza dos metadados.
            });
            await (0, promises_1.unlink)(this.metadataPath(id));
            return { success: true, entry };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, error: message };
        }
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
exports.QuarantineManager = QuarantineManager;
