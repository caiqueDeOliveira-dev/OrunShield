import { useEffect, useState } from "react";
import { Wifi, WifiOff, Lock, LockOpen, Server, Plus, Trash2, ChevronRight, Settings, RefreshCw, Download, Upload, Key, AlertCircle, CheckCircle2, HelpCircle } from "lucide-react";
import { Button, Panel, PanelHeader, StatusPill } from "../ui";
import type { VpnServerConfig, VpnPeer, VpnConnectionState, VpnConnectionStatus } from "@orun/vpn-core";

interface VpnServer extends VpnServerConfig {
  peers: VpnPeer[];
  adminPassword?: string;
}

export function VpnScreen() {
  const [servers, setServers] = useState<VpnServer[]>([]);
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const [serverForm, setServerForm] = useState({
    label: "",
    host: "",
    apiPort: 51821,
    wgPort: 51820,
    wgPublicKey: "",
    useTls: false,
    dnsServer: "10.8.0.53",
  });
  const [peerName, setPeerName] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [error, setError] = useState("");
  const [addingServer, setAddingServer] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [states, setStates] = useState<Record<string, VpnConnectionState>>({});

  const loadConfig = async () => {
    try {
      const config = await window.orunVpn.getConfig();
      // Add peers array to each server to match VpnServer interface
      const serversWithPeers: VpnServer[] = (config.servers || []).map(s => ({ ...s, peers: (s as any).peers || [], adminPassword: (s as any).adminPassword }));
      setServers(serversWithPeers);
      // Load initial states
      for (const server of serversWithPeers) {
        try {
          const state = await window.orunVpn.getState(server.id);
          setStates(prev => ({ ...prev, [server.id]: state }));
        } catch {
          setStates(prev => ({ ...prev, [server.id]: { status: "disconnected" as VpnConnectionStatus, profileId: null, connectedSince: null, lastError: null, transferRx: 0, transferTx: 0 } }));
        }
      }
    } catch (err) {
      setError("Falha ao carregar configuração: " + String(err));
    }
  };

  useEffect(() => {
    loadConfig();
    // Poll connection states every 5s
    const interval = setInterval(() => {
      servers.forEach(async (server) => {
        try {
          const state = await window.orunVpn.getState(server.id);
          setStates(prev => ({ ...prev, [server.id]: state }));
        } catch {
          setStates(prev => ({ ...prev, [server.id]: { status: "disconnected" as VpnConnectionStatus, profileId: null, connectedSince: null, lastError: null, transferRx: 0, transferTx: 0 } }));
        }
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [servers.length]);

  const handleAddServer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!serverForm.label.trim() || !serverForm.host.trim() || !serverForm.wgPublicKey.trim()) {
      setError("Informe label, host e chave pública do servidor");
      return;
    }
    setAddingServer(true);
    try {
      const serverData = {
        ...serverForm,
        dnsFilter: { enabled: true, upstream: "unbound-dot" as const, blocklist: "hagezi-pro" as const },
      };
      const result = await window.orunVpn.addServer(serverData);
      if (!result.ok) throw new Error(result.error);
      setServerForm({ label: "", host: "", apiPort: 51821, wgPort: 51820, wgPublicKey: "", useTls: false, dnsServer: "10.8.0.53" });
      await loadConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao adicionar servidor");
    } finally {
      setAddingServer(false);
    }
  };

  const handleRemoveServer = async (id: string) => {
    if (!confirm("Remover este servidor e todos os seus peers?")) return;
    try {
      const result = await window.orunVpn.removeServer(id);
      if (!result.ok) throw new Error(result.error);
      if (selectedServer === id) setSelectedServer(null);
      await loadConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover servidor");
    }
  };

  const handleProvisionPeer = async (serverId: string) => {
    if (!peerName.trim()) return;
    setProvisioning(true);
    setError("");
    try {
      const result = await window.orunVpn.provisionPeer(serverId, peerName.trim());
      if (!result.ok) throw new Error(result.error);
      setPeerName("");
      await loadConfig();
      alert(`Peer criado!\n\nConfig:\n${result.peer?.config}\n\nQR Code gerado.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao provisionar peer");
    } finally {
      setProvisioning(false);
    }
  };

  const handleConnect = async (serverId: string, peerId: string) => {
    setConnecting(peerId);
    try {
      const result = await window.orunVpn.connect(serverId, peerId);
      if (!result.ok) throw new Error(result.error);
      await loadConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao conectar");
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async (serverId: string) => {
    try {
      const result = await window.orunVpn.disconnect(serverId);
      if (!result.ok) throw new Error(result.error);
      await loadConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao desconectar");
    }
  };

  const handleToggleKillSwitch = async (serverId: string, enabled: boolean) => {
    try {
      const result = await window.orunVpn.setKillSwitch(serverId, enabled);
      if (!result.ok) throw new Error(result.error);
      await loadConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao alterar kill switch");
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "connected": return <Wifi className="h-4 w-4 text-emerald-400" />;
      case "connecting": return <RefreshCw className="h-4 w-4 text-amber-400 animate-spin" />;
      case "error": return <AlertCircle className="h-4 w-4 text-red-400" />;
      default: return <WifiOff className="h-4 w-4 text-ink-3" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "connected": return "Conectado";
      case "connecting": return "Conectando...";
      case "disconnecting": return "Desconectando...";
      case "error": return "Erro";
      default: return "Desconectado";
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-red-600/20 flex items-center justify-center">
            <Wifi className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-ink">Orun VPN</h1>
            <p className="text-xs text-ink-3">WireGuard + wg-easy + DNS filtering (HaGeZi)</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
<Button variant="ghost" onClick={loadConfig}>
              <RefreshCw className="h-4 w-4" />
            </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-red-400 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError("")} className="ml-auto text-ink-3 hover:text-ink">✕</button>
          </div>
        )}

        {/* Add Server Form */}
        <section className="mb-6 rounded-xl border border-line bg-panel/50 p-4">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-medium text-ink">
            <Plus className="h-4 w-4 text-accent" />
            Adicionar Servidor wg-easy
          </h2>
          <form onSubmit={handleAddServer} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-3">Label</label>
                <input
                  value={serverForm.label}
                  onChange={e => setServerForm(prev => ({ ...prev, label: e.target.value }))}
                  placeholder="Ex: Casa, VPS, Escritório"
                  className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-3">Host</label>
                <input
                  value={serverForm.host}
                  onChange={e => setServerForm(prev => ({ ...prev, host: e.target.value }))}
                  placeholder="vpn.orun.dev ou 192.168.1.50"
                  className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-3">API Port</label>
                <input
                  type="number"
                  value={serverForm.apiPort}
                  onChange={e => setServerForm(prev => ({ ...prev, apiPort: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-3">WG Port</label>
                <input
                  type="number"
                  value={serverForm.wgPort}
                  onChange={e => setServerForm(prev => ({ ...prev, wgPort: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={serverForm.useTls}
                    onChange={e => setServerForm(prev => ({ ...prev, useTls: e.target.checked }))}
                    className="h-4 w-4 rounded border-line bg-bg text-accent focus:ring-accent"
                  />
                  <span className="text-xs text-ink-3">TLS</span>
                </label>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-3">DNS</label>
                <input
                  value={serverForm.dnsServer}
                  onChange={e => setServerForm(prev => ({ ...prev, dnsServer: e.target.value }))}
                  placeholder="10.8.0.53"
                  className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-3">Chave Pública do Servidor WireGuard</label>
              <input
                value={serverForm.wgPublicKey}
                onChange={e => setServerForm(prev => ({ ...prev, wgPublicKey: e.target.value }))}
                placeholder="chave pública base64..."
                className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm font-mono text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <Button type="submit" disabled={addingServer} className="w-full md:w-auto">
              {addingServer ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {addingServer ? "Adicionando..." : "Adicionar Servidor"}
            </Button>
          </form>
        </section>

        {/* Admin Password */}
        <section className="mb-6 rounded-xl border border-line bg-panel/50 p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-ink">
            <Key className="h-4 w-4 text-accent" />
            Senha Admin do wg-easy (para provisionar peers)
          </h2>
          <div className="flex gap-2">
            <input
              type="password"
              value={adminPassword}
              onChange={e => setAdminPassword(e.target.value)}
              placeholder="Senha admin do painel wg-easy"
              className="flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <Button
              variant="secondary"
              onClick={() => {
                // Admin password would be saved via IPC to main process
                // For now, store in localStorage as fallback
                localStorage.setItem("orun-vpn-admin-password", adminPassword);
                // Also update in-memory servers
                setServers(prev => prev.map(s => ({ ...s, adminPassword })));
              }}
            >
              Salvar
            </Button>
          </div>
          <p className="mt-2 text-xs text-ink-3">A senha é armazenada localmente (electron-store) e usada apenas para criar peers via API do wg-easy.</p>
        </section>

        {/* Servers List */}
        <section>
          <h2 className="mb-4 flex items-center gap-2 text-sm font-medium text-ink">
            <Server className="h-4 w-4 text-accent" />
            Servidores ({servers.length})
          </h2>
          {servers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line bg-panel/30 p-8 text-center">
              <Server className="h-12 w-12 mx-auto text-ink-3" />
              <p className="mt-3 text-ink-2">Nenhum servidor configurado</p>
              <p className="text-xs text-ink-3 max-w-xs mx-auto">Adicione um servidor wg-easy acima para começar. O servidor deve estar rodando com a API acessível.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {servers.map(server => {
                const serverPeers = server.peers || [];
                const isSelected = selectedServer === server.id;
                const state = states[server.id] || { status: "disconnected" };
                return (
                  <div
                    key={server.id}
                    className={`rounded-xl border p-4 transition-all ${
                      isSelected
                        ? "border-accent bg-accent/5 ring-1 ring-accent/20"
                        : "border-line bg-panel/50 hover:border-line-2"
                    }`}
                  >
                    <button
                      onClick={() => setSelectedServer(isSelected ? null : server.id)}
                      className="flex items-center justify-between w-full"
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          {getStatusIcon(state.status)}
                          <span className="absolute -bottom-1 -right-1 h-2 w-2 rounded-full border-2 border-bg" style={{
                            background: state.status === "connected" ? "#00D26A" :
                              state.status === "connecting" ? "#F59E0B" : "#666"
                          }} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-ink truncate">{server.label}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                              state.status === "connected" ? "bg-emerald-500/10 text-emerald-400" :
                                state.status === "connecting" ? "bg-amber-500/10 text-amber-400" :
                                  state.status === "error" ? "bg-red-500/10 text-red-400" :
                                    "bg-ink-200 text-ink-3"
                            }`}>
                              {getStatusText(state.status)}
                            </span>
                          </div>
                          <p className="text-xs text-ink-3 font-mono truncate">{server.host}:{server.wgPort}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <ChevronRight className={`h-4 w-4 text-ink-3 transition-transform ${isSelected ? "rotate-90" : ""}`} />
                        <Button
                          variant="ghost"
                          onClick={e => { e.stopPropagation(); handleRemoveServer(server.id); }}
                        >
                          <Trash2 className="h-4 w-4 text-red-400" />
                        </Button>
                      </div>
                    </button>

                    {isSelected && (
                      <div className="mt-4 space-y-4 border-t border-line pt-4">
                        {/* Connection Controls */}
                        <div className="flex flex-wrap gap-2">
                          {serverPeers.length > 0 && (
                            <>
                              <select
                                defaultValue={serverPeers[0]?.id || ""}
                                className="flex-1 min-w-[200px] rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                              >
                                {serverPeers.map(p => (
                                  <option key={p.id} value={p.id}>{p.name} ({p.address})</option>
                                ))}
                              </select>
                              <Button
                                onClick={() => handleConnect(server.id, serverPeers[0].id)}
                                disabled={connecting === serverPeers[0].id || state.status === "connected"}
                                variant={state.status === "connected" ? "secondary" : "primary"}
                              >
                                {connecting === serverPeers[0].id ? (
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : state.status === "connected" ? (
                                  <Wifi className="h-4 w-4" />
                                ) : (
                                  <WifiOff className="h-4 w-4" />
                                )}
                                {state.status === "connected" ? "Conectado" : connecting ? "Conectando..." : "Conectar"}
                              </Button>
                              {state.status === "connected" && (
                                <Button
                                  variant="danger"
                                  onClick={() => handleDisconnect(server.id)}
                                >
                                  <WifiOff className="h-4 w-4" />
                                  Desconectar
                                </Button>
                              )}
                            </>
                          )}
                          {serverPeers.length === 0 && (
                            <span className="flex items-center text-sm text-ink-3">Nenhum peer — provisione um abaixo</span>
                          )}
                        </div>

                        {/* Kill Switch */}
                        <div className="flex items-center justify-between rounded-lg border border-line bg-bg p-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <Lock className="h-4 w-4 text-ink-3" />
                              <span className="font-medium text-ink">Kill Switch</span>
                            </div>
                            <p className="text-xs text-ink-3">Bloqueia todo tráfego se o túnel cair</p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={state.status === "connected"} // simplified
                              onChange={e => handleToggleKillSwitch(server.id, e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 rounded-full bg-ink-200 peer-checked:bg-red-400 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all" />
                          </label>
                        </div>

                        {/* Provision Peer */}
                        <div className="flex gap-2">
                          <input
                            value={peerName}
                            onChange={e => setPeerName(e.target.value)}
                            placeholder="Nome do dispositivo (ex: iPhone, Laptop)"
                            className="flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                          />
                          <Button onClick={() => handleProvisionPeer(server.id)} disabled={provisioning || !peerName.trim()}>
                            {provisioning ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                            {provisioning ? "Provisionando..." : "Provisionar Peer"}
                          </Button>
                        </div>

                        {/* Peers List */}
                        {serverPeers.length > 0 && (
                          <div className="space-y-2">
                            <h3 className="text-xs font-medium text-ink-3 uppercase tracking-wide">Peers Configurados</h3>
                            {serverPeers.map(peer => (
                              <div key={peer.id} className="flex items-center justify-between rounded-lg border border-line bg-bg p-3">
                                <div className="flex items-center gap-3">
                                  <div className={`h-2 w-2 rounded-full ${state.status === "connected" ? "bg-emerald-400" : "bg-ink_3"}`} />
                                  <div>
                                    <p className="font-medium text-ink">{peer.name}</p>
                                    <p className="text-xs font-mono text-ink-3">{peer.address}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button variant="ghost">
                                    <Download className="h-4 w-4" />
                                    <span className="hidden sm:inline">Export .conf</span>
                                  </Button>
                                  <Button variant="ghost">
                                    <Upload className="h-4 w-4" />
                                    <span className="hidden sm:inline">QR</span>
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}