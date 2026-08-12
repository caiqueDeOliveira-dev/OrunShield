import { z } from "zod";
/** Nível de severidade unificado usado em todo o Shield */
export declare const ThreatSeveritySchema: z.ZodEnum<["info", "low", "medium", "high", "critical"]>;
export type ThreatSeverity = z.infer<typeof ThreatSeveritySchema>;
/** Origem da detecção — de qual subsistema veio o alerta */
export declare const DetectionSourceSchema: z.ZodEnum<["clamav", "virustotal", "yara", "sentinel-process", "sentinel-network", "sentinel-fs", "integrity", "ransomware-heuristic", "windows-defender"]>;
export type DetectionSource = z.infer<typeof DetectionSourceSchema>;
export declare const ThreatFindingSchema: z.ZodObject<{
    id: z.ZodString;
    source: z.ZodEnum<["clamav", "virustotal", "yara", "sentinel-process", "sentinel-network", "sentinel-fs", "integrity", "ransomware-heuristic", "windows-defender"]>;
    severity: z.ZodEnum<["info", "low", "medium", "high", "critical"]>;
    title: z.ZodString;
    description: z.ZodString;
    filePath: z.ZodOptional<z.ZodString>;
    processName: z.ZodOptional<z.ZodString>;
    pid: z.ZodOptional<z.ZodNumber>;
    remoteAddress: z.ZodOptional<z.ZodString>;
    sha256: z.ZodOptional<z.ZodString>;
    ruleName: z.ZodOptional<z.ZodString>;
    detectedAt: z.ZodString;
    raw: z.ZodOptional<z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    id?: string;
    source?: "clamav" | "virustotal" | "yara" | "sentinel-process" | "sentinel-network" | "sentinel-fs" | "integrity" | "ransomware-heuristic" | "windows-defender";
    severity?: "info" | "low" | "medium" | "high" | "critical";
    title?: string;
    description?: string;
    filePath?: string;
    processName?: string;
    pid?: number;
    remoteAddress?: string;
    sha256?: string;
    ruleName?: string;
    detectedAt?: string;
    raw?: unknown;
}, {
    id?: string;
    source?: "clamav" | "virustotal" | "yara" | "sentinel-process" | "sentinel-network" | "sentinel-fs" | "integrity" | "ransomware-heuristic" | "windows-defender";
    severity?: "info" | "low" | "medium" | "high" | "critical";
    title?: string;
    description?: string;
    filePath?: string;
    processName?: string;
    pid?: number;
    remoteAddress?: string;
    sha256?: string;
    ruleName?: string;
    detectedAt?: string;
    raw?: unknown;
}>;
export type ThreatFinding = z.infer<typeof ThreatFindingSchema>;
export declare const ScanTargetSchema: z.ZodObject<{
    path: z.ZodString;
    recursive: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    path?: string;
    recursive?: boolean;
}, {
    path?: string;
    recursive?: boolean;
}>;
export type ScanTarget = z.infer<typeof ScanTargetSchema>;
export declare const ScanResultSchema: z.ZodObject<{
    target: z.ZodString;
    filesScanned: z.ZodNumber;
    findings: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        source: z.ZodEnum<["clamav", "virustotal", "yara", "sentinel-process", "sentinel-network", "sentinel-fs", "integrity", "ransomware-heuristic", "windows-defender"]>;
        severity: z.ZodEnum<["info", "low", "medium", "high", "critical"]>;
        title: z.ZodString;
        description: z.ZodString;
        filePath: z.ZodOptional<z.ZodString>;
        processName: z.ZodOptional<z.ZodString>;
        pid: z.ZodOptional<z.ZodNumber>;
        remoteAddress: z.ZodOptional<z.ZodString>;
        sha256: z.ZodOptional<z.ZodString>;
        ruleName: z.ZodOptional<z.ZodString>;
        detectedAt: z.ZodString;
        raw: z.ZodOptional<z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        id?: string;
        source?: "clamav" | "virustotal" | "yara" | "sentinel-process" | "sentinel-network" | "sentinel-fs" | "integrity" | "ransomware-heuristic" | "windows-defender";
        severity?: "info" | "low" | "medium" | "high" | "critical";
        title?: string;
        description?: string;
        filePath?: string;
        processName?: string;
        pid?: number;
        remoteAddress?: string;
        sha256?: string;
        ruleName?: string;
        detectedAt?: string;
        raw?: unknown;
    }, {
        id?: string;
        source?: "clamav" | "virustotal" | "yara" | "sentinel-process" | "sentinel-network" | "sentinel-fs" | "integrity" | "ransomware-heuristic" | "windows-defender";
        severity?: "info" | "low" | "medium" | "high" | "critical";
        title?: string;
        description?: string;
        filePath?: string;
        processName?: string;
        pid?: number;
        remoteAddress?: string;
        sha256?: string;
        ruleName?: string;
        detectedAt?: string;
        raw?: unknown;
    }>, "many">;
    startedAt: z.ZodString;
    finishedAt: z.ZodString;
    engine: z.ZodEnum<["clamav", "virustotal", "yara", "sentinel-process", "sentinel-network", "sentinel-fs", "integrity", "ransomware-heuristic", "windows-defender"]>;
}, "strip", z.ZodTypeAny, {
    target?: string;
    filesScanned?: number;
    findings?: {
        id?: string;
        source?: "clamav" | "virustotal" | "yara" | "sentinel-process" | "sentinel-network" | "sentinel-fs" | "integrity" | "ransomware-heuristic" | "windows-defender";
        severity?: "info" | "low" | "medium" | "high" | "critical";
        title?: string;
        description?: string;
        filePath?: string;
        processName?: string;
        pid?: number;
        remoteAddress?: string;
        sha256?: string;
        ruleName?: string;
        detectedAt?: string;
        raw?: unknown;
    }[];
    startedAt?: string;
    finishedAt?: string;
    engine?: "clamav" | "virustotal" | "yara" | "sentinel-process" | "sentinel-network" | "sentinel-fs" | "integrity" | "ransomware-heuristic" | "windows-defender";
}, {
    target?: string;
    filesScanned?: number;
    findings?: {
        id?: string;
        source?: "clamav" | "virustotal" | "yara" | "sentinel-process" | "sentinel-network" | "sentinel-fs" | "integrity" | "ransomware-heuristic" | "windows-defender";
        severity?: "info" | "low" | "medium" | "high" | "critical";
        title?: string;
        description?: string;
        filePath?: string;
        processName?: string;
        pid?: number;
        remoteAddress?: string;
        sha256?: string;
        ruleName?: string;
        detectedAt?: string;
        raw?: unknown;
    }[];
    startedAt?: string;
    finishedAt?: string;
    engine?: "clamav" | "virustotal" | "yara" | "sentinel-process" | "sentinel-network" | "sentinel-fs" | "integrity" | "ransomware-heuristic" | "windows-defender";
}>;
export type ScanResult = z.infer<typeof ScanResultSchema>;
export interface ShieldEventMap {
    [event: string]: unknown;
    "threat:detected": ThreatFinding;
    "scan:started": {
        target: string;
        engine: DetectionSource;
    };
    "scan:finished": ScanResult;
    "sentinel:process-alert": ThreatFinding;
    "sentinel:network-alert": ThreatFinding;
    "sentinel:fs-alert": ThreatFinding;
    "ransomware:alert": ThreatFinding;
    "firewall:rule-changed": {
        action: "add" | "remove";
        rule: string;
    };
    "integrity:violation": ThreatFinding;
    error: {
        source: DetectionSource | "orchestrator";
        message: string;
    };
}
