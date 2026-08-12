import type { UpdateCheckResult, PackageManagerKind } from "../types.js";
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
export declare class UpdateChecker {
    checkWinget(): Promise<UpdateCheckResult>;
    checkBrew(): Promise<UpdateCheckResult>;
    checkApt(): Promise<UpdateCheckResult>;
    checkAvailable(kind: PackageManagerKind): Promise<boolean>;
    /**
     * winget imprime uma tabela alinhada por espaços (não há um modo JSON
     * universal em todas as versões). Parsing por colunas de largura fixa é
     * frágil a mudanças de localização/idioma do Windows — documentado como
     * limitação conhecida no README.
     */
    private parseWingetOutput;
    private parseBrewOutput;
    /** Formato de linha: `pacote/repo versão-nova arch [upgradable from: versão-atual]` */
    private parseAptOutput;
    private run;
}
