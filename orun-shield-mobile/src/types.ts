import { z } from "zod";

export const LinkVerdictSchema = z.enum(["safe", "suspicious", "malicious", "unknown"]);
export type LinkVerdict = z.infer<typeof LinkVerdictSchema>;

export interface LinkCheckResult {
  url: string;
  verdict: LinkVerdict;
  threatTypes: string[]; // ex: ["MALWARE", "SOCIAL_ENGINEERING"] no vocabulário do Safe Browsing
  checkedAt: string;
  source: "google-safe-browsing" | "cache" | "error-fallback";
}

export interface DeviceIntegrityResult {
  isCompromised: boolean;
  isRooted: boolean; // Android
  isJailbroken: boolean; // iOS
  isDebuggedMode: boolean; // apps de debug/dev instalados, mock locations etc
  isOnExternalStorage: boolean; // Android: app rodando de SD card, mais fácil de adulterar
  hookDetected: boolean; // Frida/Xposed/similares
  checkedAt: string;
  raw?: Record<string, unknown>;
}

export interface FileHashCheckResult {
  fileName: string;
  sha256: string;
  verdict: LinkVerdict;
  positives?: number;
  totalEngines?: number;
  checkedAt: string;
}
