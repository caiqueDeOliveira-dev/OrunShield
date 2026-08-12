import { spawn } from "node:child_process";
import type { UpdateActionResult, PackageManagerKind } from "../types.js";

/**
 * Executa a atualização de um pacote específico via o gerenciador nativo.
 * Assim como o `FirewallManager` do Shield, algumas dessas operações
 * exigem privilégios elevados (ex: `apt-get install` no Linux) — o app
 * precisa solicitar elevação (UAC/sudo/polkit) antes de chamar isso,
 * este módulo não eleva privilégios sozinho.
 */
export class UpdateExecutor {
  async update(kind: PackageManagerKind, packageId: string): Promise<UpdateActionResult> {
    try {
      const output = await this.runUpdateCommand(kind, packageId);
      return { success: true, packageId, output };
    } catch (err) {
      return { success: false, packageId, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Atualiza vários pacotes em sequência — uma falha não interrompe o restante do lote. */
  async updateMany(kind: PackageManagerKind, packageIds: string[]): Promise<UpdateActionResult[]> {
    const results: UpdateActionResult[] = [];
    for (const id of packageIds) {
      results.push(await this.update(kind, id));
    }
    return results;
  }

  private async runUpdateCommand(kind: PackageManagerKind, packageId: string): Promise<string> {
    switch (kind) {
      case "winget":
        return this.run("winget", [
          "upgrade",
          "--id",
          packageId,
          "--silent",
          "--accept-package-agreements",
          "--accept-source-agreements",
        ]);
      case "brew":
        return this.run("brew", ["upgrade", packageId]);
      case "apt":
        // --only-upgrade garante que isso nunca instala um pacote novo, só atualiza um já instalado.
        return this.run("apt-get", ["install", "--only-upgrade", "-y", packageId]);
      default: {
        const exhaustiveCheck: never = kind;
        throw new Error(`Package manager desconhecido: ${exhaustiveCheck}`);
      }
    }
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
        if (code === 0) resolve(stdout);
        else reject(new Error(`${bin} finalizou com código ${code}: ${stderr || stdout}. Pode ser necessário rodar com privilégios elevados.`));
      });
    });
  }
}
