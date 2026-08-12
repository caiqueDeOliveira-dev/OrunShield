import { spawn } from "node:child_process";
import type { OutdatedPackage, UpdateCheckResult, PackageManagerKind } from "../types.js";

/**
 * Verifica atualizações disponíveis usando o gerenciador de pacotes nativo
 * de cada SO — não reimplementa detecção de versão nem baixa nada por
 * conta própria. Isso é o mesmo princípio usado no Shield com o ClamAV:
 * orquestrar ferramentas maduras em vez de reinventar.
 *
 *  - Windows: winget (Windows Package Manager, nativo desde Win 10 1809+)
 *  - macOS: Homebrew (`brew outdated --json=v2`, saída estruturada e confiável)
 *  - Linux: apt (`apt list --upgradable`, requer `apt-get update` ter rodado antes pra lista estar atual)
 *
 * Nem todo software instalado passa por esses gerenciadores (apps
 * instalados manualmente, Windows Store, etc não aparecem) — isso é uma
 * limitação real do approach, documentada no README.
 */
export class UpdateChecker {
  async checkWinget(): Promise<UpdateCheckResult> {
    const output = await this.run("winget", [
      "upgrade",
      "--include-unknown",
      "--accept-source-agreements",
    ]).catch(() => "");
    return {
      source: "winget",
      outdated: this.parseWingetOutput(output),
      checkedAt: new Date().toISOString(),
    };
  }

  async checkBrew(): Promise<UpdateCheckResult> {
    const output = await this.run("brew", ["outdated", "--json=v2"]).catch(() => "");
    return {
      source: "brew",
      outdated: this.parseBrewOutput(output),
      checkedAt: new Date().toISOString(),
    };
  }

  async checkApt(): Promise<UpdateCheckResult> {
    const output = await this.run("apt", ["list", "--upgradable"]).catch(() => "");
    return {
      source: "apt",
      outdated: this.parseAptOutput(output),
      checkedAt: new Date().toISOString(),
    };
  }

  async checkAvailable(kind: PackageManagerKind): Promise<boolean> {
    const binary = kind; // winget/brew/apt são também os nomes dos binários
    try {
      await this.run(binary, ["--version"]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * winget imprime uma tabela alinhada por espaços (não há um modo JSON
   * universal em todas as versões). Parsing por colunas de largura fixa é
   * frágil a mudanças de localização/idioma do Windows — documentado como
   * limitação conhecida no README.
   */
  private parseWingetOutput(output: string): OutdatedPackage[] {
    const lines = output.split("\n").map((l) => l.trimEnd());
    const headerIndex = lines.findIndex((l) => /^Name\s+Id\s+Version\s+Available/i.test(l.trim()));
    if (headerIndex === -1) return [];

    const results: OutdatedPackage[] = [];
    for (let i = headerIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || /^-+$/.test(line.trim())) continue;
      if (/upgrades available|no applicable update/i.test(line)) break;

      // Colunas separadas por 2+ espaços.
      const columns = line.trim().split(/\s{2,}/);
      if (columns.length < 4) continue;
      const [displayName, id, currentVersion, availableVersion] = columns;
      if (!displayName || !id || !currentVersion || !availableVersion) continue;

      results.push({ id, displayName, currentVersion, availableVersion, source: "winget" });
    }
    return results;
  }

  private parseBrewOutput(output: string): OutdatedPackage[] {
    if (!output.trim()) return [];
    try {
      const parsed = JSON.parse(output) as {
        formulae?: { name: string; installed_versions: string[]; current_version: string }[];
        casks?: { name: string[]; installed_versions: string; current_version: string }[];
      };

      const fromFormulae: OutdatedPackage[] = (parsed.formulae ?? []).map((f) => ({
        id: f.name,
        displayName: f.name,
        currentVersion: f.installed_versions[f.installed_versions.length - 1] ?? "?",
        availableVersion: f.current_version,
        source: "brew" as const,
      }));

      const fromCasks: OutdatedPackage[] = (parsed.casks ?? []).map((c) => ({
        id: c.name[0] ?? "?",
        displayName: c.name.join(", "),
        currentVersion: c.installed_versions,
        availableVersion: c.current_version,
        source: "brew" as const,
      }));

      return [...fromFormulae, ...fromCasks];
    } catch {
      return [];
    }
  }

  /** Formato de linha: `pacote/repo versão-nova arch [upgradable from: versão-atual]` */
  private parseAptOutput(output: string): OutdatedPackage[] {
    const results: OutdatedPackage[] = [];
    for (const line of output.split("\n")) {
      const match = line.match(/^([^/\s]+)\/\S+\s+(\S+)\s+\S+\s+\[upgradable from:\s*([^\]]+)\]/);
      if (!match) continue;
      const [, name, availableVersion, currentVersion] = match;
      if (!name || !availableVersion || !currentVersion) continue;
      results.push({
        id: name,
        displayName: name,
        currentVersion: currentVersion.trim(),
        availableVersion,
        source: "apt",
      });
    }
    return results;
  }

  private run(bin: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args);
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (c) => (stdout += c.toString()));
      child.stderr.on("data", (c) => (stderr += c.toString()));
      child.on("error", reject);
      child.on("close", (code) => {
        // apt "list --upgradable" retorna 0 mesmo com avisos no stderr (ex: "apt does not have a stable CLI").
        if (code === 0) resolve(stdout);
        else reject(new Error(`${bin} finalizou com código ${code}: ${stderr || stdout}`));
      });
    });
  }
}
