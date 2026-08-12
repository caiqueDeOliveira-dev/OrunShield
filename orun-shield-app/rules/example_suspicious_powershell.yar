/*
  Exemplo de regra customizada do Orun Shield.
  Detecta padrões comuns de scripts PowerShell ofuscados usados para
  baixar e executar payloads (técnica comum em malware/loaders).

  Isso NÃO substitui o ClamAV/VirusTotal — é um complemento para padrões
  específicos que vocês identificarem em investigações próprias.
*/

rule Suspicious_PowerShell_Download_Execute
{
    meta:
        author = "Orun Shield"
        description = "Detecta comandos PowerShell tipicamente usados para baixar e executar código remoto"
        severity = "high"

    strings:
        $encoded_cmd = "-EncodedCommand" nocase
        $bypass_policy = "-ExecutionPolicy Bypass" nocase
        $download_string = "DownloadString" nocase
        $iex = "IEX" nocase
        $invoke_expression = "Invoke-Expression" nocase
        $hidden_window = "-WindowStyle Hidden" nocase

    condition:
        2 of them
}
