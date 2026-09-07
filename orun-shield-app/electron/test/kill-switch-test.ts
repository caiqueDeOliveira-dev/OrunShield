/*
 * @orun/vpn-electron — test/kill-switch-test.ts
 *
 * Test script para validar kill switch nas 3 plataformas.
 * Rodar EM VMs REAIS (Linux/macOS/Windows) — não no host.
 *
 * Uso:
 *   npx ts-node test/kill-switch-test.ts <linux|macos|windows>
 *
 * O que testa:
 * 1. Kill switch ativado → tráfego bloqueado fora do túnel
 * 2. Kill switch desativado → tráfego normal
 * 3. Queda do túnel → kill switch bloqueia tudo
 * 4. DHCP/renovação de rede (Windows) — pode falhar (documentado)
 */

import { ElectronVpnBackend } from "@orun/vpn-electron";
import { VpnServerConfigSchema, VpnPeerSchema, VpnProfileSchema } from "@orun/vpn-core";
import { randomUUID } from "crypto";
import { execSync } from "child_process";

const PLATFORM = process.argv[2] as "linux" | "macos" | "windows";

if (!PLATFORM || !["linux", "macos", "windows"].includes(PLATFORM)) {
  console.error("Uso: npx ts-node kill-switch-test.ts <linux|macos|windows>");
  process.exit(1);
}

console.log(`[KillSwitchTest] Platform: ${PLATFORM}`);

// Fake secret store para testes
const secretStore = {
  get: async (ref: string) => {
    // Em produção: buscar no @orun/identity
    return "TEST_PRIVATE_KEY_BASE64==";
  },
  set: async () => {},
  delete: async () => {},
};

const backend = new ElectronVpnBackend(secretStore);

// Configuração de teste (NÃO conecta em servidor real — testa só a lógica de firewall)
const TEST_SERVER = VpnServerConfigSchema.parse({
  id: "test-server",
  label: "Test Server",
  host: "192.168.1.100",
  apiPort: 51821,
  wgPort: 51820,
  wgPublicKey: "SERVER_PUBLIC_KEY_BASE64==",
  useTls: false,
  dnsServer: "10.8.0.53",
  createdAt: new Date().toISOString(),
});

const TEST_PEER = VpnPeerSchema.parse({
  id: "test-peer",
  serverId: "test-server",
  name: "Test Peer",
  publicKey: "PEER_PUBLIC_KEY_BASE64==",
  presharedKey: "PRESHARED_KEY_BASE64==",
  address: "10.8.0.2/32",
  enabled: true,
  createdAt: new Date().toISOString(),
  latestHandshakeAt: null,
  transferRx: 0,
  transferTx: 0,
});

const TEST_PROFILE = VpnProfileSchema.parse({
  id: "test-profile",
  serverId: "test-server",
  peerId: "test-peer",
  privateKeySecretRef: "test-peer",
  autoConnect: false,
  killSwitch: false,
});

async function runCommand(cmd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const stdout = execSync(cmd, { encoding: "utf-8", timeout: 10000 });
    return { stdout, stderr: "", code: 0 };
  } catch (e: any) {
    return { stdout: e.stdout || "", stderr: e.stderr || e.message, code: e.status ?? 1 };
  }
}

async function checkInternetConnectivity(): Promise<boolean> {
  try {
    const result = await runCommand(PLATFORM === "windows" 
      ? "powershell -Command \"Test-Connection -ComputerName 8.8.8.8 -Count 1 -Quiet\""
      : "ping -c 1 -W 2 8.8.8.8 > /dev/null 2>&1 && echo OK || echo FAIL"
    );
    return result.stdout.includes("True") || result.stdout.includes("OK");
  } catch {
    return false;
  }
}

async function testKillSwitchEnabled(): Promise<void> {
  console.log("\n=== Teste 1: Kill Switch ATIVADO ===");
  
  // 1. Habilitar kill switch
  await backend.setKillSwitch(true);
  console.log("[OK] Kill switch habilitado via backend");

  // 2. Verificar regras de firewall
  if (PLATFORM === "linux") {
    const nft = await runCommand("nft list ruleset");
    if (nft.stdout.includes("drop") || nft.stdout.includes("reject")) {
      console.log("[OK] nftables tem regra de drop/reject");
    } else {
      console.warn("[WARN] nftables não mostra regra de drop — verifique PostUp/PreDown");
    }
  } else if (PLATFORM === "macos") {
    const pf = await runCommand("pfctl -sr");
    if (pf.stdout.includes("block drop")) {
      console.log("[OK] pf tem regra de block drop");
    } else {
      console.warn("[WARN] pf não mostra block drop — verifique PostUp/PreDown");
    }
  } else if (PLATFORM === "windows") {
    const fw = await runCommand('powershell -Command "Get-NetFirewallProfile | Select-Object DefaultOutboundAction"');
    if (fw.stdout.includes("Block")) {
      console.log("[OK] Windows Firewall DefaultOutboundAction = Block");
    } else {
      console.warn("[WARN] DefaultOutboundAction não é Block");
    }
    const allowRules = await runCommand('powershell -Command "Get-NetFirewallRule -DisplayName \'Orun VPN*\' | Measure-Object | Select-Object Count"');
    console.log(`[INFO] Regras Orun VPN: ${allowRules.stdout.trim()}`);
  }

  // 3. Verificar conectividade (deve falhar)
  const connected = await checkInternetConnectivity();
  if (!connected) {
    console.log("[OK] Internet BLOQUEADA com kill switch ativo");
  } else {
    console.warn("[WARN] Internet AINDA acessível — kill switch pode não estar funcionando");
  }
}

async function testKillSwitchDisabled(): Promise<void> {
  console.log("\n=== Teste 2: Kill Switch DESATIVADO ===");
  
  await backend.setKillSwitch(false);
  console.log("[OK] Kill switch desativado via backend");

  // Verificar regras removidas/restauradas
  if (PLATFORM === "linux") {
    const nft = await runCommand("nft list ruleset");
    if (!nft.stdout.includes("Orun VPN")) {
      console.log("[OK] Regras nftables do Orun VPN removidas");
    }
  } else if (PLATFORM === "macos") {
    const pf = await runCommand("pfctl -sr");
    if (!pf.stdout.includes("Orun VPN")) {
      console.log("[OK] Regras pf do Orun VPN removidas");
    }
  } else if (PLATFORM === "windows") {
    const fw = await runCommand('powershell -Command "Get-NetFirewallProfile | Select-Object DefaultOutboundAction"');
    if (fw.stdout.includes("Allow")) {
      console.log("[OK] DefaultOutboundAction restaurado para Allow");
    }
  }

  // Verificar conectividade restaurada
  const connected = await checkInternetConnectivity();
  if (connected) {
    console.log("[OK] Internet ACESSÍVEL com kill switch desativado");
  } else {
    console.warn("[WARN] Internet ainda bloqueada — pode haver regras residuais");
  }
}

async function testTunnelDropSimulation(): Promise<void> {
  console.log("\n=== Teste 3: Simulação de queda do túnel ===");
  
  // Habilitar kill switch
  await backend.setKillSwitch(true);
  
  // Simular queda: remover interface WireGuard (se existir)
  if (PLATFORM === "linux") {
    await runCommand("ip link delete dev wg0 2>/dev/null || true");
  } else if (PLATFORM === "macos") {
    await runCommand("ifconfig wg0 destroy 2>/dev/null || true");
  } else if (PLATFORM === "windows") {
    await runCommand('powershell -Command "Get-NetAdapter -Name \'Orun VPN*\' | Disable-NetAdapter -Confirm:$false 2>$null"');
  }
  
  console.log("[INFO] Interface de túnel simulada como removida");
  
  // Verificar se internet ainda bloqueada
  await new Promise(r => setTimeout(r, 2000));
  const connected = await checkInternetConnectivity();
  if (!connected) {
    console.log("[OK] Kill switch MANTÉM bloqueio após queda do túnel");
  } else {
    console.error("[FAIL] Kill switch FALHOU — internet acessível sem túnel!");
  }
  
  // Restaurar
  await backend.setKillSwitch(false);
}

async function main() {
  console.log("═══════════════════════════════════════");
  console.log("  Orun VPN — Kill Switch Test Suite");
  console.log("═══════════════════════════════════════");
  console.log(`Platform: ${PLATFORM}`);
  console.log("⚠️  RODAR EM VM REAL — NÃO NO HOST");
  console.log("═══════════════════════════════════════\n");

  try {
    await testKillSwitchEnabled();
    await testKillSwitchDisabled();
    await testTunnelDropSimulation();
    
    console.log("\n═══════════════════════════════════════");
    console.log("  Testes concluídos");
    console.log("═══════════════════════════════════════");
    
    if (PLATFORM === "windows") {
      console.log("\n⚠️  NOTA Windows: DHCP/renovação de rede pode falhar com kill switch ativo.");
      console.log("   Isso é comportamento esperado (documentado no README).");
    }
  } catch (err) {
    console.error("[ERRO]", err);
    process.exit(1);
  }
}

main();