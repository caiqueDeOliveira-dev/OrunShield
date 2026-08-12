"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirewallManager = void 0;
const node_child_process_1 = require("node:child_process");
const node_os_1 = require("node:os");
const TypedEmitter_js_1 = require("../utils/TypedEmitter.js");
/**
 * Orquestra o firewall nativo do SO — não reimplementa um firewall,
 * pois isso exigiria driver de kernel assinado e certificação. Em vez
 * disso, chama `netsh advfirewall` no Windows e `iptables`/`nftables`
 * no Linux para aplicar regras vindas de detecções do Shield
 * (ex: bloquear IP após alerta crítico do Sentinel).
 *
 * Nota: requer privilégios de administrador/root para executar.
 * No Orun OS próprio (quando existir kernel dedicado), esta camada
 * seria substituída por controle nativo direto — ver README.
 */
class FirewallManager extends TypedEmitter_js_1.TypedEmitter {
    os;
    constructor() {
        super();
        this.os = this.detectOS();
    }
    detectOS() {
        const p = (0, node_os_1.platform)();
        if (p === "win32")
            return "windows";
        if (p === "linux")
            return "linux";
        if (p === "darwin")
            return "macos";
        return "unsupported";
    }
    async addRule(rule) {
        switch (this.os) {
            case "windows":
                await this.addRuleWindows(rule);
                break;
            case "linux":
                await this.addRuleLinux(rule);
                break;
            case "macos":
                throw new Error("macOS usa PF (Packet Filter) via /etc/pf.conf — requer edição de arquivo de config, não é exposto via CLI simples. Implementação futura.");
            default:
                throw new Error("Sistema operacional não suportado pelo FirewallManager.");
        }
        this.emit("firewall:rule-changed", { action: "add", rule: rule.name });
    }
    async removeRule(ruleName) {
        switch (this.os) {
            case "windows":
                await this.run("netsh", ["advfirewall", "firewall", "delete", "rule", `name=${ruleName}`]);
                break;
            case "linux":
                // No Linux identificamos a regra pelo comentário (--comment) e removemos por número de linha reverso.
                await this.removeRuleLinuxByComment(ruleName);
                break;
            default:
                throw new Error("Sistema operacional não suportado pelo FirewallManager.");
        }
        this.emit("firewall:rule-changed", { action: "remove", rule: ruleName });
    }
    /** Atalho de alto nível: bloqueia um IP inteiro (usado após alerta crítico do NetworkMonitor). */
    async blockIP(ip, ruleName = `orun-shield-block-${ip}`) {
        await this.addRule({
            name: ruleName,
            direction: "out",
            protocol: "any",
            remoteAddress: ip,
            action: "block",
        });
    }
    async addRuleWindows(rule) {
        const dir = rule.direction === "in" ? "in" : "out";
        const action = rule.action === "block" ? "block" : "allow";
        const args = [
            "advfirewall",
            "firewall",
            "add",
            "rule",
            `name=${rule.name}`,
            `dir=${dir}`,
            `action=${action}`,
            `protocol=${rule.protocol === "any" ? "any" : rule.protocol.toUpperCase()}`,
        ];
        if (rule.remoteAddress)
            args.push(`remoteip=${rule.remoteAddress}`);
        if (rule.localPort)
            args.push(`localport=${rule.localPort}`);
        await this.run("netsh", args);
    }
    async addRuleLinux(rule) {
        const chain = rule.direction === "in" ? "INPUT" : "OUTPUT";
        const target = rule.action === "block" ? "DROP" : "ACCEPT";
        const args = ["-A", chain];
        if (rule.protocol !== "any")
            args.push("-p", rule.protocol);
        if (rule.remoteAddress)
            args.push(rule.direction === "in" ? "-s" : "-d", rule.remoteAddress);
        if (rule.localPort)
            args.push("--dport", String(rule.localPort));
        args.push("-m", "comment", "--comment", rule.name, "-j", target);
        await this.run("iptables", args);
    }
    /**
     * `iptables -L -n --line-numbers` (sem especificar chain) lista TODAS as
     * chains (INPUT, FORWARD, OUTPUT) numa saída só, com um cabeçalho
     * "Chain NOME (policy ...)" antes de cada bloco e numeração de linha
     * reiniciando a cada chain. Achar o comentário sem rastrear em qual
     * chain ele está é o bug que existia aqui antes: `blockIP` adiciona a
     * regra na chain OUTPUT, mas a remoção só tentava apagar da INPUT —
     * ou seja, bloqueios feitos via `blockIP` nunca eram removidos de verdade.
     */
    async removeRuleLinuxByComment(ruleName) {
        const output = await this.run("iptables", ["-L", "-n", "--line-numbers"]);
        const matches = this.findRuleLinesByChain(output, ruleName);
        if (matches.length === 0)
            return;
        // Remove da última linha pra primeira (dentro de cada chain) pra não bagunçar a numeração das seguintes.
        const sorted = [...matches].sort((a, b) => b.lineNumber - a.lineNumber);
        for (const { chain, lineNumber } of sorted) {
            await this.run("iptables", ["-D", chain, String(lineNumber)]).catch(() => {
                // Regra pode já ter sido removida por outra chamada concorrente — não bloqueia o restante.
            });
        }
    }
    /** Parser puro (sem I/O) da saída do `iptables -L -n --line-numbers` — extraído à parte para ser testável sem precisar rodar iptables de verdade. */
    findRuleLinesByChain(iptablesOutput, ruleName) {
        const results = [];
        let currentChain = null;
        for (const line of iptablesOutput.split("\n")) {
            const chainHeaderMatch = line.match(/^Chain (\S+)/);
            if (chainHeaderMatch) {
                currentChain = chainHeaderMatch[1] ?? null;
                continue;
            }
            if (!currentChain || !line.includes(ruleName))
                continue;
            const lineNumberMatch = line.trim().match(/^(\d+)\s/);
            if (lineNumberMatch?.[1]) {
                results.push({ chain: currentChain, lineNumber: Number(lineNumberMatch[1]) });
            }
        }
        return results;
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
                    reject(new Error(`${bin} finalizou com código ${code}: ${stderr}. Requer privilégios de administrador/root.`));
            });
        });
    }
}
exports.FirewallManager = FirewallManager;
