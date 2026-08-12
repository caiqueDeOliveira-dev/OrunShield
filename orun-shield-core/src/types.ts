import { z } from "zod";

/** Nível de severidade unificado usado em todo o Shield */
export const ThreatSeveritySchema = z.enum(["info", "low", "medium", "high", "critical"]);
export type ThreatSeverity = z.infer<typeof ThreatSeveritySchema>;

/** Origem da detecção — de qual subsistema veio o alerta */
export const DetectionSourceSchema = z.enum([
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
export type DetectionSource = z.infer<typeof DetectionSourceSchema>;

export const ThreatFindingSchema = z.object({
  id: z.string(),
  source: DetectionSourceSchema,
  severity: ThreatSeveritySchema,
  title: z.string(),
  description: z.string(),
  filePath: z.string().optional(),
  processName: z.string().optional(),
  pid: z.number().optional(),
  remoteAddress: z.string().optional(),
  sha256: z.string().optional(),
  ruleName: z.string().optional(),
  detectedAt: z.string(), // ISO timestamp
  raw: z.unknown().optional(), // payload bruto da engine, para debug/auditoria
});
export type ThreatFinding = z.infer<typeof ThreatFindingSchema>;

export const ScanTargetSchema = z.object({
  path: z.string(),
  recursive: z.boolean().default(true),
});
export type ScanTarget = z.infer<typeof ScanTargetSchema>;

export const ScanResultSchema = z.object({
  target: z.string(),
  filesScanned: z.number(),
  findings: z.array(ThreatFindingSchema),
  startedAt: z.string(),
  finishedAt: z.string(),
  engine: DetectionSourceSchema,
});
export type ScanResult = z.infer<typeof ScanResultSchema>;

export interface ShieldEventMap {
  [event: string]: unknown;
  "threat:detected": ThreatFinding;
  "scan:started": { target: string; engine: DetectionSource };
  "scan:finished": ScanResult;
  "sentinel:process-alert": ThreatFinding;
  "sentinel:network-alert": ThreatFinding;
  "sentinel:fs-alert": ThreatFinding;
  "ransomware:alert": ThreatFinding;
  "firewall:rule-changed": { action: "add" | "remove"; rule: string };
  "integrity:violation": ThreatFinding;
  error: { source: DetectionSource | "orchestrator"; message: string };
}
