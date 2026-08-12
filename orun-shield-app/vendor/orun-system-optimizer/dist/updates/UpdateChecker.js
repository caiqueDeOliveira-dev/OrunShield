"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateChecker = void 0;
const node_child_process_1 = require("node:child_process");
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
class UpdateChecker {
    async checkWinget() {
        const output = await this.run("winget", [
            "upgrade",
            "--include-unknown",
            "--accept-source-agreements",
        ], { timeoutMs: 3 * 60 * 1000 }).catch(() => "");
        return {
            source: "winget",
            outdated: this.parseWingetOutput(output),
            checkedAt: new Date().toISOString(),
        };
    }
    async checkBrew() {
        const output = await this.run("brew", ["outdated", "--json=v2"]).catch(() => "");
        return {
            source: "brew",
            outdated: this.parseBrewOutput(output),
            checkedAt: new Date().toISOString(),
        };
    }
    async checkApt() {
        const output = await this.run("apt", ["list", "--upgradable"]).catch(() => "");
        return {
            source: "apt",
            outdated: this.parseAptOutput(output),
            checkedAt: new Date().toISOString(),
        };
    }
    async checkAvailable(kind) {
        const binary = kind; // winget/brew/apt são também os nomes dos binários
        try {
            await this.run(binary, ["--version"]);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * winget imprime uma tabela alinhada por colunas (não há um modo JSON
     * universal em todas as versões). O parsing por offsets de coluna (posição
     * de cada cabeçalho na linha do header) é robusto a nomes/IDs com espaços
     * internos — a abordagem de separar por "2+ espaços" quebra quando o valor
     * de uma coluna termina exatamente na borda e o próximo começa com 1 espaço.
     * A saída é normalizada (strip de BOM UTF-8 e CR de CRLF) porque o BOM
     * desloca os offsets do header em 1 caractere.
     */
    parseWingetOutput(output) {
        const lines = output.replace(/^\ufeff/, "").replace(/\r/g, "").split("\n").map((l) => l.trimEnd());
        const headerIndex = lines.findIndex((l) => /^Name\s+Id\s+Version\s+Available/i.test(l.trim()));
        if (headerIndex === -1)
            return [];
        const header = lines[headerIndex];
        const colName = header.indexOf("Name");
        const colId = header.indexOf("Id");
        const colVersion = header.indexOf("Version");
        const colAvailable = header.indexOf("Available");
        if (colName < 0 || colId < 0 || colVersion < 0 || colAvailable < 0)
            return [];
        const results = [];
        for (let i = headerIndex + 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line || /^-+$/.test(line.trim()))
                continue;
            if (/upgrades available|no applicable update/i.test(line))
                break;
            const displayName = line.slice(colName, colId).trim();
            const id = line.slice(colId, colVersion).trim();
            const currentVersion = line.slice(colVersion, colAvailable).trim();
            const availableVersion = line.slice(colAvailable).trim().split(/\s+/)[0] ?? "";
            if (!displayName || !id || !currentVersion || !availableVersion)
                continue;
            results.push({ id, displayName, currentVersion, availableVersion, source: "winget" });
        }
        return results;
    }
    parseBrewOutput(output) {
        if (!output.trim())
            return [];
        try {
            const parsed = JSON.parse(output);
            const fromFormulae = (parsed.formulae ?? []).map((f) => ({
                id: f.name,
                displayName: f.name,
                currentVersion: f.installed_versions[f.installed_versions.length - 1] ?? "?",
                availableVersion: f.current_version,
                source: "brew",
            }));
            const fromCasks = (parsed.casks ?? []).map((c) => ({
                id: c.name[0] ?? "?",
                displayName: c.name.join(", "),
                currentVersion: c.installed_versions,
                availableVersion: c.current_version,
                source: "brew",
            }));
            return [...fromFormulae, ...fromCasks];
        }
        catch {
            return [];
        }
    }
    /** Formato de linha: `pacote/repo versão-nova arch [upgradable from: versão-atual]` */
    parseAptOutput(output) {
        const results = [];
        for (const line of output.split("\n")) {
            const match = line.match(/^([^/\s]+)\/\S+\s+(\S+)\s+\S+\s+\[upgradable from:\s*([^\]]+)\]/);
            if (!match)
                continue;
            const [, name, availableVersion, currentVersion] = match;
            if (!name || !availableVersion || !currentVersion)
                continue;
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
    run(bin, args, { timeoutMs = 5 * 60 * 1000 } = {}) {
        return new Promise((resolve, reject) => {
            const child = (0, node_child_process_1.spawn)(bin, args, { windowsHide: true });
            let stdout = "";
            let stderr = "";
            let settled = false;
            const finish = (fn, value) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                fn(value);
            };
            const killTree = () => {
                try {
                    if (process.platform === "win32")
                        (0, node_child_process_1.spawn)("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
                    else
                        child.kill("SIGKILL");
                }
                catch { /* best-effort */ }
            };
            const timer = setTimeout(() => {
                killTree();
                finish(reject, new Error(`${bin} excedeu o tempo limite de ${Math.round(timeoutMs / 60000)} min e foi encerrado.`));
            }, timeoutMs);
            child.stdout.on("data", (c) => (stdout += c.toString()));
            child.stderr.on("data", (c) => (stderr += c.toString()));
            child.on("error", (err) => finish(reject, err));
            child.on("close", (code) => {
                // apt "list --upgradable" retorna 0 mesmo com avisos no stderr (ex: "apt does not have a stable CLI").
                if (code === 0)
                    finish(resolve, stdout);
                else
                    finish(reject, new Error(`${bin} finalizou com código ${code}: ${stderr || stdout}`));
            });
        });
    }
}
exports.UpdateChecker = UpdateChecker;
