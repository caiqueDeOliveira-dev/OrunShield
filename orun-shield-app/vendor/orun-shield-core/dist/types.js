"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScanResultSchema = exports.ScanTargetSchema = exports.ThreatFindingSchema = exports.DetectionSourceSchema = exports.ThreatSeveritySchema = void 0;
const zod_1 = require("zod");
/** Nível de severidade unificado usado em todo o Shield */
exports.ThreatSeveritySchema = zod_1.z.enum(["info", "low", "medium", "high", "critical"]);
/** Origem da detecção — de qual subsistema veio o alerta */
exports.DetectionSourceSchema = zod_1.z.enum([
    "clamav",
    "virustotal",
    "yara",
    "sentinel-process",
    "sentinel-network",
    "sentinel-fs",
    "integrity",
    "ransomware-heuristic",
    "windows-defender",
]);
exports.ThreatFindingSchema = zod_1.z.object({
    id: zod_1.z.string(),
    source: exports.DetectionSourceSchema,
    severity: exports.ThreatSeveritySchema,
    title: zod_1.z.string(),
    description: zod_1.z.string(),
    filePath: zod_1.z.string().optional(),
    processName: zod_1.z.string().optional(),
    pid: zod_1.z.number().optional(),
    remoteAddress: zod_1.z.string().optional(),
    sha256: zod_1.z.string().optional(),
    ruleName: zod_1.z.string().optional(),
    detectedAt: zod_1.z.string(), // ISO timestamp
    raw: zod_1.z.unknown().optional(), // payload bruto da engine, para debug/auditoria
});
exports.ScanTargetSchema = zod_1.z.object({
    path: zod_1.z.string(),
    recursive: zod_1.z.boolean().default(true),
});
exports.ScanResultSchema = zod_1.z.object({
    target: zod_1.z.string(),
    filesScanned: zod_1.z.number(),
    findings: zod_1.z.array(exports.ThreatFindingSchema),
    startedAt: zod_1.z.string(),
    finishedAt: zod_1.z.string(),
    engine: exports.DetectionSourceSchema,
});
