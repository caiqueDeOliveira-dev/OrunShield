"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.YaraEngine = void 0;
const node_child_process_1 = require("node:child_process");
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const TypedEmitter_js_1 = require("../utils/TypedEmitter.js");
/**
 * Wrapper sobre o binário `yara`. Diferente do ClamAV (assinaturas prontas)
 * e da VirusTotal (terceiros), aqui as regras são escritas pelo próprio
 * time do Orun — é o único ponto da detecção 100% autoral, para padrões
 * específicos que vocês identificarem (ex: comportamento de malware visto
 * em incidentes reais, ou heurísticas para os próprios formatos do Orun).
 *
 * Pré-requisito do host: `yara` instalado (`apt install yara` /
 * `brew install yara` / build oficial no Windows).
 */
class YaraEngine extends TypedEmitter_js_1.TypedEmitter {
    binaryPath;
    rulesDir;
    constructor(config) {
        super();
        this.binaryPath = config.binaryPath ?? "yara";
        this.rulesDir = config.rulesDir;
    }
    async listRuleFiles() {
        const entries = await (0, promises_1.readdir)(this.rulesDir, { withFileTypes: true });
        return entries
            .filter((e) => e.isFile() && (e.name.endsWith(".yar") || e.name.endsWith(".yara")))
            .map((e) => (0, node_path_1.join)(this.rulesDir, e.name));
    }
    async scan(targetPath, recursive = true) {
        this.emit("scan:started", { target: targetPath, engine: "yara" });
        const ruleFiles = await this.listRuleFiles();
        if (ruleFiles.length === 0) {
            return [];
        }
        const findings = [];
        for (const ruleFile of ruleFiles) {
            const args = ["-w"]; // -w: suprime warnings de compilação de regra
            if (recursive)
                args.push("-r");
            args.push(ruleFile, targetPath);
            const output = await this.run(args);
            findings.push(...this.parseOutput(output));
        }
        for (const finding of findings)
            this.emit("threat:detected", finding);
        return findings;
    }
    /** Formato de saída do yara: `RuleName /caminho/arquivo` por linha. */
    parseOutput(output) {
        return output
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
            .map((line) => {
            const [ruleName, ...pathParts] = line.split(/\s+/);
            const filePath = pathParts.join(" ");
            return {
                id: (0, node_crypto_1.randomUUID)(),
                source: "yara",
                severity: "medium",
                title: `Regra YARA "${ruleName}" disparada`,
                description: `O arquivo ${filePath} corresponde ao padrão definido na regra customizada "${ruleName}".`,
                filePath,
                ruleName,
                detectedAt: new Date().toISOString(),
            };
        });
    }
    run(args) {
        return new Promise((resolve, reject) => {
            const child = (0, node_child_process_1.spawn)(this.binaryPath, args);
            let stdout = "";
            let stderr = "";
            child.stdout.on("data", (c) => (stdout += c.toString()));
            child.stderr.on("data", (c) => (stderr += c.toString()));
            child.on("error", reject);
            child.on("close", (code) => {
                // yara retorna 0 mesmo sem matches; só falha em erro de sintaxe/arquivo.
                if (code === 0)
                    resolve(stdout);
                else
                    reject(new Error(`yara finalizou com código ${code}: ${stderr}`));
            });
        });
    }
}
exports.YaraEngine = YaraEngine;
