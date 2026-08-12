"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BinaryVerifier = void 0;
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const node_crypto_2 = require("node:crypto");
const TypedEmitter_js_1 = require("../utils/TypedEmitter.js");
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
class BinaryVerifier extends TypedEmitter_js_1.TypedEmitter {
    async generateManifest(rootDir, extensions = [".exe", ".dll", ".node", ".asar"]) {
        const entries = {};
        await this.walk(rootDir, rootDir, extensions, entries);
        return { generatedAt: new Date().toISOString(), entries };
    }
    async saveManifest(manifest, outputPath) {
        await (0, promises_1.writeFile)(outputPath, JSON.stringify(manifest, null, 2), "utf-8");
    }
    async loadManifest(manifestPath) {
        const raw = await (0, promises_1.readFile)(manifestPath, "utf-8");
        return JSON.parse(raw);
    }
    /**
     * Compara o estado atual do diretório contra um manifesto de referência
     * (idealmente baixado de uma fonte confiável, não gerado localmente).
     */
    async verify(rootDir, referenceManifest) {
        const findings = [];
        const currentEntries = {};
        const extensions = Array.from(new Set(Object.keys(referenceManifest.entries).map((p) => p.slice(p.lastIndexOf(".")))));
        await this.walk(rootDir, rootDir, extensions, currentEntries);
        for (const [relPath, expectedHash] of Object.entries(referenceManifest.entries)) {
            const actualHash = currentEntries[relPath];
            if (!actualHash) {
                findings.push(this.toFinding("critical", `Arquivo crítico ausente: ${relPath}`, relPath));
                continue;
            }
            if (actualHash !== expectedHash) {
                findings.push(this.toFinding("critical", `Arquivo crítico modificado: ${relPath}. Hash esperado ${expectedHash.slice(0, 12)}..., encontrado ${actualHash.slice(0, 12)}...`, relPath));
            }
        }
        // Arquivos novos não previstos no manifesto também merecem atenção (menos crítico).
        for (const relPath of Object.keys(currentEntries)) {
            if (!(relPath in referenceManifest.entries)) {
                findings.push(this.toFinding("medium", `Arquivo não previsto no manifesto: ${relPath}`, relPath));
            }
        }
        for (const finding of findings) {
            this.emit("integrity:violation", finding);
            this.emit("threat:detected", finding);
        }
        return findings;
    }
    toFinding(severity, title, filePath) {
        return {
            id: (0, node_crypto_2.randomUUID)(),
            source: "integrity",
            severity,
            title,
            description: title,
            filePath,
            detectedAt: new Date().toISOString(),
        };
    }
    async walk(root, dir, extensions, out) {
        const entries = await (0, promises_1.readdir)(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = (0, node_path_1.join)(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === "node_modules" || entry.name.startsWith("."))
                    continue;
                await this.walk(root, fullPath, extensions, out);
            }
            else if (extensions.some((ext) => entry.name.endsWith(ext))) {
                const buffer = await (0, promises_1.readFile)(fullPath);
                const hash = (0, node_crypto_1.createHash)("sha256").update(buffer).digest("hex");
                const relPath = fullPath.slice(root.length + 1).replace(/\\/g, "/");
                out[relPath] = hash;
            }
        }
    }
}
exports.BinaryVerifier = BinaryVerifier;
