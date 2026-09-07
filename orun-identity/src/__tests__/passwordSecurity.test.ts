// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { checkPasswordPwned } from '../core/passwordSecurity';

describe('checkPasswordPwned', () => {
  it('retorna isPwned=true quando o sufixo do hash aparece na resposta da API', async () => {
    // SHA-1('password') = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
    // prefix = 5BAA6, suffix = 1E4C9B93F3F0682250B6CF8331B7EE68FD8
    const fakeFetch = vi.fn(async () =>
      new Response('1E4C9B93F3F0682250B6CF8331B7EE68FD8:3861493\nOUTRO:12\n', { status: 200 })
    ) as unknown as typeof fetch;

    const result = await checkPasswordPwned('password', webcrypto.subtle as unknown as SubtleCrypto, fakeFetch);

    expect(result.checkFailed).toBe(false);
    expect(result.isPwned).toBe(true);
    expect(result.occurrences).toBe(3861493);
  });

  it('retorna isPwned=false quando o sufixo não é encontrado', async () => {
    const fakeFetch = vi.fn(async () => new Response('AAAA:1\nBBBB:2\n', { status: 200 })) as unknown as typeof fetch;

    const result = await checkPasswordPwned('uma-senha-bem-forte-e-unica', webcrypto.subtle as unknown as SubtleCrypto, fakeFetch);

    expect(result.isPwned).toBe(false);
    expect(result.checkFailed).toBe(false);
  });

  it('fail-open: retorna checkFailed=true e isPwned=false quando a API falha', async () => {
    const fakeFetch = vi.fn(async () => new Response('', { status: 500 })) as unknown as typeof fetch;

    const result = await checkPasswordPwned('qualquer-coisa', webcrypto.subtle as unknown as SubtleCrypto, fakeFetch);

    expect(result.checkFailed).toBe(true);
    expect(result.isPwned).toBe(false);
  });

  it('fail-open: retorna checkFailed=true quando fetch lança (sem rede)', async () => {
    const fakeFetch = vi.fn(async () => {
      throw new Error('network unreachable');
    }) as unknown as typeof fetch;

    const result = await checkPasswordPwned('qualquer-coisa', webcrypto.subtle as unknown as SubtleCrypto, fakeFetch);

    expect(result.checkFailed).toBe(true);
    expect(result.isPwned).toBe(false);
  });

  it('nunca envia a senha em texto puro — só o prefixo de 5 chars do hash vai na URL', async () => {
    const fakeFetch = vi.fn(async () => new Response('', { status: 200 })) as unknown as typeof fetch;

    await checkPasswordPwned('minha-senha-secreta', webcrypto.subtle as unknown as SubtleCrypto, fakeFetch);

    const calledUrl = (fakeFetch as any).mock.calls[0][0] as string;
    expect(calledUrl).toMatch(/^https:\/\/api\.pwnedpasswords\.com\/range\/[0-9A-F]{5}$/);
    expect(calledUrl).not.toContain('minha-senha-secreta');
  });
});
