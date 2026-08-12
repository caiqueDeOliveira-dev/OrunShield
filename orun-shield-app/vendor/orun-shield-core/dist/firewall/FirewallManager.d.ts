import { TypedEmitter } from "../utils/TypedEmitter.js";
import type { ShieldEventMap } from "../types.js";
export type FirewallDirection = "in" | "out";
export type FirewallProtocol = "tcp" | "udp" | "any";
export interface FirewallRule {
    name: string;
    direction: FirewallDirection;
    protocol: FirewallProtocol;
    remoteAddress?: string;
    localPort?: number;
    action: "block" | "allow";
}
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
export declare class FirewallManager extends TypedEmitter<ShieldEventMap> {
    private readonly os;
    constructor();
    private detectOS;
    addRule(rule: FirewallRule): Promise<void>;
    removeRule(ruleName: string): Promise<void>;
    /** Atalho de alto nível: bloqueia um IP inteiro (usado após alerta crítico do NetworkMonitor). */
    blockIP(ip: string, ruleName?: string): Promise<void>;
    private addRuleWindows;
    private addRuleLinux;
    /**
     * `iptables -L -n --line-numbers` (sem especificar chain) lista TODAS as
     * chains (INPUT, FORWARD, OUTPUT) numa saída só, com um cabeçalho
     * "Chain NOME (policy ...)" antes de cada bloco e numeração de linha
     * reiniciando a cada chain. Achar o comentário sem rastrear em qual
     * chain ele está é o bug que existia aqui antes: `blockIP` adiciona a
     * regra na chain OUTPUT, mas a remoção só tentava apagar da INPUT —
     * ou seja, bloqueios feitos via `blockIP` nunca eram removidos de verdade.
     */
    private removeRuleLinuxByComment;
    /** Parser puro (sem I/O) da saída do `iptables -L -n --line-numbers` — extraído à parte para ser testável sem precisar rodar iptables de verdade. */
    private findRuleLinesByChain;
    private run;
}
