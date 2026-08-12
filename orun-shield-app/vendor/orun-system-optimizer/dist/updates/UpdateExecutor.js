"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateExecutor = void 0;
const node_child_process_1 = require("node:child_process");
/**
 * Executa a atualização de um pacote específico via o gerenciador nativo.
 * Assim como o `FirewallManager` do Shield, algumas dessas operações
 * exigem privilégios elevados (ex: `apt-get install` no Linux) — o app
 * precisa solicitar elevação (UAC/sudo/polkit) antes de chamar isso,
 * este módulo não eleva privilégios sozinho.
 */
class UpdateExecutor {
    async update(kind, packageId) {
        try {
            const output = await this.runUpdateCommand(kind, packageId);
            return { success: true, packageId, output };
        }
        catch (err) {
            return { success: false, packageId, error: err instanceof Error ? err.message : String(err) };
        }
    }
    /** Atualiza vários pacotes em sequência — uma falha não interrompe o restante do lote. */
    async updateMany(kind, packageIds) {
        const results = [];
        for (const id of packageIds) {
            results.push(await this.update(kind, id));
        }
        return results;
    }
    async runUpdateCommand(kind, packageId) {
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
                const exhaustiveCheck = kind;
                throw new Error(`Package manager desconhecido: ${exhaustiveCheck}`);
            }
        }
    }
    run(bin, args) {
        return new Promise((resolve, reject) => {
            const child = (0, node_child_process_1.spawn)(bin, args);
            let stdout = "";
            let stderr = "";
            child.stdout.on("data", (c) => (stdout += c.toString()));
            child.stderr.on("data", (c) => (stderr += c.toString()));
            child.on("error", reject);
            child.on("close", (code) => {
                if (code === 0)
                    resolve(stdout);
                else
                    reject(new Error(`${bin} finalizou com código ${code}: ${stderr || stdout}. Pode ser necessário rodar com privilégios elevados.`));
            });
        });
    }
}
exports.UpdateExecutor = UpdateExecutor;
