/**
 * Verifica se uma senha aparece em vazamentos conhecidos, usando o modelo
 * k-anonymity da API pública do Have I Been Pwned: só os 5 primeiros
 * caracteres do hash SHA-1 são enviados, nunca a senha nem o hash completo.
 * https://haveibeenpwned.com/API/v3#PwnedPasswords
 */
export interface PwnedCheckResult {
  isPwned: boolean;
  /** Quantas vezes essa senha apareceu em vazamentos conhecidos. 0 se não encontrada ou se a checagem falhou. */
  occurrences: number;
  /** true se a checagem não pôde ser completada (ex: sem rede) — não bloquear o usuário nesse caso. */
  checkFailed: boolean;
}

async function sha1Hex(text: string, subtle: SubtleCrypto): Promise<string> {
  const encoded = new TextEncoder().encode(text);
  const digest = await subtle.digest('SHA-1', encoded);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/**
 * Fail-open por design: se a API estiver fora do ar, retorna checkFailed=true
 * e isPwned=false — nunca bloquear um cadastro/troca de senha só porque o
 * serviço de terceiro está indisponível.
 */
export async function checkPasswordPwned(
  password: string,
  subtle: SubtleCrypto = crypto.subtle,
  fetchImpl: typeof fetch = fetch
): Promise<PwnedCheckResult> {
  try {
    const hash = await sha1Hex(password, subtle);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    const response = await fetchImpl(`https://api.pwnedpasswords.com/range/${prefix}`);
    if (!response.ok) {
      return { isPwned: false, occurrences: 0, checkFailed: true };
    }

    const body = await response.text();
    const match = body
      .split('\n')
      .map((line) => line.trim().split(':'))
      .find(([lineSuffix]) => lineSuffix === suffix);

    if (!match) {
      return { isPwned: false, occurrences: 0, checkFailed: false };
    }

    return { isPwned: true, occurrences: Number(match[1] ?? 0), checkFailed: false };
  } catch {
    return { isPwned: false, occurrences: 0, checkFailed: true };
  }
}
