# Kill Switch — Testes em VMs Reais

Este documento descreve como validar o kill switch do Orun VPN nas 3 plataformas.

## Pré-requisitos

- **VMs limpas** (snapshots para restaurar):
  - Linux: Ubuntu 22.04+ / Fedora 38+ (systemd, nftables)
  - macOS: macOS 13+ (Ventura) — pf habilitado
  - Windows: Windows 10/11 Pro/Enterprise (PowerShell 5.1+, Firewall ativo)

- **Instalar dependências**:
  ```bash
  # Linux
  sudo apt-get install wireguard wireguard-tools nftables
  
  # macOS
  brew install wireguard-tools
  
  # Windows
  # Baixar e instalar WireGuard: https://www.wireguard.com/install/
  ```

- **Node.js 20+** + dependências do projeto:
  ```bash
  cd orun-shield-app
  npm install
  ```

## Como rodar

```bash
# Linux
npx ts-node electron/test/kill-switch-test.ts linux

# macOS
npx ts-node electron/test/kill-switch-test.ts macos

# Windows (PowerShell como Admin)
npx ts-node electron/test/kill-switch-test.ts windows
```

> ⚠️ **Windows**: Execute PowerShell como **Administrador** — o firewall exige elevação.

## O que cada teste valida

| Teste | Linux (nftables) | macOS (pf) | Windows (Firewall) |
|-------|------------------|------------|-------------------|
| **Ativado** | Regra `drop` na chain `output` | `block drop out` | `DefaultOutboundAction = Block` + regras `Allow` só túnel |
| **Desativado** | Regras removidas | Regras removidas | `DefaultOutboundAction = Allow` |
| **Queda túnel** | Bloqueio mantido | Bloqueio mantido | Bloqueio mantido |
| **DHCP** | N/A | N/A | ⚠️ Pode falhar (documentado) |

## Verificações manuais adicionais

### Linux
```bash
# Ver regras nftables
sudo nft list ruleset

# Ver interface WireGuard
ip link show wg0
wg show
```

### macOS
```bash
# Ver regras pf
sudo pfctl -sr

# Ver interface
ifconfig wg0
```

### Windows
```powershell
# Ver perfis de firewall
Get-NetFirewallProfile | Select-Object Name, DefaultOutboundAction

# Ver regras Orun VPN
Get-NetFirewallRule -DisplayName "Orun VPN*" | Select-Object DisplayName, Enabled, Action, Direction

# Ver adaptador
Get-NetAdapter -Name "Orun VPN*"
```

## Critérios de aprovação

- [ ] Kill switch ativado → internet **bloqueada** (ping 8.8.8.8 falha)
- [ ] Kill switch desativado → internet **funciona** (ping 8.8.8.8 OK)
- [ ] Queda simulada do túnel → internet **continua bloqueada**
- [ ] Regras de firewall **apenas** para o túnel + DNS (10.8.0.53)
- [ ] Sem vazamento de tráfego fora do túnel (verificar com `tcpdump`/`Wireshark`)

## Limitações conhecidas

1. **Windows DHCP**: Com `DefaultOutboundAction = Block`, a renovação de lease DHCP pode falhar. Isso é documentado pela Microsoft. Mitigação: regra de allow para UDP 67/68 (não implementado ainda).

2. **DNS round-robin**: Se o servidor VPN usa múltiplos IPs DNS, só o primeiro é liberado na regra de allow.

3. **IPv6**: Kill switch atual cobre só IPv4. IPv6 pode vazar se não desabilitado no adaptador.

## Resultados esperados por plataforma

### Linux (Ubuntu 22.04)
```
[OK] nftables tem regra de drop
[OK] Internet BLOQUEADA com kill switch ativo
[OK] Internet ACESSÍVEL com kill switch desativado
[OK] Kill switch MANTÉM bloqueio após queda do túnel
```

### macOS (Ventura+)
```
[OK] pf tem regra de block drop
[OK] Internet BLOQUEADA com kill switch ativo
[OK] Internet ACESSÍVEL com kill switch desativado
[OK] Kill switch MANTÉM bloqueio após queda do túnel
```

### Windows 10/11
```
[OK] Windows Firewall DefaultOutboundAction = Block
[OK] Internet BLOQUEADA com kill switch ativo
[OK] DefaultOutboundAction restaurado para Allow
[OK] Internet ACESSÍVEL com kill switch desativado
[OK] Kill switch MANTÉM bloqueio após queda do túnel
[WARN] DHCP pode falhar com kill switch ativo (comportamento esperado)
```

## Relatar problemas

Se algum teste falhar, colete:
1. Output completo do script
2. `nft list ruleset` / `pfctl -sr` / `Get-NetFirewallRule`
3. `ip route` / `netstat -rn` / `route print`
4. Versão do OS e WireGuard

Abra issue no repositório com essas informações.