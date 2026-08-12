"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VirusTotalClient = void 0;
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const node_crypto_2 = require("node:crypto");
const node_fetch_1 = __importDefault(require("node-fetch"));
const TypedEmitter_js_1 = require("../utils/TypedEmitter.js");
const VT_BASE_URL = "https://www.virustotal.com/api/v3";
/** Upload direto só é permitido até 32MB; acima disso é preciso pedir uma upload_url dedicada. */
const DIRECT_UPLOAD_LIMIT_BYTES = 32 * 1024 * 1024;
/**
 * Cliente para a VirusTotal API v3. Usado como segunda opinião: consulta
 * o hash de um arquivo contra 70+ engines antes de decidir se algo
 * suspeito (ex: sinalizado pelo Sentinel) é de fato malicioso.
 *
 * Requer uma API key gratuita ou paga (https://www.virustotal.com/gui/join-us).
 * O tier gratuito tem rate limit de ~4 req/min — o client já trata 429.
 */
class VirusTotalClient extends TypedEmitter_js_1.TypedEmitter {
    apiKey;
    minPositivesToFlag;
    constructor(config) {
        super();
        this.apiKey = config.apiKey;
        this.minPositivesToFlag = config.minPositivesToFlag ?? 2;
    }
    /** Calcula o SHA-256 de um arquivo local. */
    async hashFile(filePath) {
        const buffer = await (0, promises_1.readFile)(filePath);
        return (0, node_crypto_1.createHash)("sha256").update(buffer).digest("hex");
    }
    /**
     * Consulta um hash já conhecido pela VT (não sobe o arquivo).
     * Retorna null se o hash nunca foi visto pela VirusTotal.
     */
    async lookupHash(sha256) {
        const res = await this.request(`/files/${sha256}`);
        if (res.status === 404)
            return null;
        if (!res.ok)
            throw new Error(`VirusTotal respondeu ${res.status} ao consultar hash`);
        const body = (await res.json());
        const stats = body.data.attributes.last_analysis_stats;
        return this.evaluateStats(stats, sha256, body.data.attributes.meaningful_name);
    }
    /**
     * Fluxo completo: hashea o arquivo local, consulta o hash e, só se a VT
     * nunca viu esse arquivo, faz upload para análise (mais lento, minutos).
     */
    async scanFile(filePath) {
        const sha256 = await this.hashFile(filePath);
        const known = await this.lookupHash(sha256);
        if (known)
            return known;
        const analysisId = await this.uploadFile(filePath);
        return this.pollAnalysis(analysisId, filePath, sha256);
    }
    async uploadFile(filePath) {
        const { size } = await (0, promises_1.stat)(filePath);
        const buffer = await (0, promises_1.readFile)(filePath);
        let uploadUrl = `${VT_BASE_URL}/files`;
        if (size > DIRECT_UPLOAD_LIMIT_BYTES) {
            const res = await this.request("/files/upload_url");
            const body = (await res.json());
            uploadUrl = body.data;
        }
        const form = new FormData();
        form.append("file", new Blob([buffer]), filePath.split(/[/\\]/).pop() ?? "sample");
        const res = await (0, node_fetch_1.default)(uploadUrl, {
            method: "POST",
            headers: { "x-apikey": this.apiKey },
            // node-fetch aceita FormData/Blob em runtime; tipagem do pacote diverge do lib.dom.
            body: form,
        });
        if (!res.ok)
            throw new Error(`Falha no upload para VirusTotal: ${res.status}`);
        const body = (await res.json());
        return body.data.id;
    }
    async pollAnalysis(analysisId, filePath, sha256, attempts = 10, intervalMs = 15_000) {
        for (let i = 0; i < attempts; i++) {
            const res = await this.request(`/analyses/${analysisId}`);
            const body = (await res.json());
            if (body.data.attributes.status === "completed") {
                const finding = this.evaluateStats(body.data.attributes.stats, sha256);
                if (finding)
                    finding.filePath = filePath;
                return finding;
            }
            await new Promise((r) => setTimeout(r, intervalMs));
        }
        // Análise não terminou a tempo — não bloqueia o fluxo, apenas não confirma.
        return null;
    }
    evaluateStats(stats, sha256, name) {
        if (stats.malicious < this.minPositivesToFlag)
            return null;
        const total = stats.malicious + stats.suspicious + stats.undetected + stats.harmless;
        const finding = {
            id: (0, node_crypto_2.randomUUID)(),
            source: "virustotal",
            severity: stats.malicious >= 10 ? "critical" : stats.malicious >= 5 ? "high" : "medium",
            title: `Arquivo sinalizado por ${stats.malicious}/${total} engines`,
            description: `VirusTotal: ${stats.malicious} engines de segurança marcaram ${name ?? sha256} como malicioso, ${stats.suspicious} como suspeito.`,
            sha256,
            detectedAt: new Date().toISOString(),
            raw: stats,
        };
        return finding;
    }
    async request(path) {
        const res = await (0, node_fetch_1.default)(`${VT_BASE_URL}${path}`, {
            headers: { "x-apikey": this.apiKey },
        });
        if (res.status === 429) {
            // Rate limit do tier gratuito — espera e tenta uma vez mais.
            await new Promise((r) => setTimeout(r, 60_000));
            return this.request(path);
        }
        return res;
    }
}
exports.VirusTotalClient = VirusTotalClient;
