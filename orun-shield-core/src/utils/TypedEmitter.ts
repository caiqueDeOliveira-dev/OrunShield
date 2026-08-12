import { EventEmitter } from "node:events";

/**
 * Wrapper tipado sobre o EventEmitter nativo do Node.
 * Garante que cada evento emitido pelo Shield tenha payload correto,
 * evitando o `any` implícito do EventEmitter padrão.
 */
export class TypedEmitter<Events extends Record<string, unknown> = Record<string, unknown>> {
  private emitter = new EventEmitter();

  constructor() {
    // "error" é um nome de evento reservado no EventEmitter nativo do Node:
    // se emitido sem NENHUM listener registrado, o Node lança a exceção em vez
    // de só notificar (diferente de qualquer outro evento). Sem este no-op,
    // um consumidor do Shield que esquecer de fazer `.on("error", ...)` teria
    // a aplicação derrubada de forma confusa na primeira falha de scan/monitor.
    // Este listener não interfere em nada: se o consumidor registrar seu
    // próprio `.on("error", ...)`, ambos são chamados normalmente.
    this.emitter.on("error", () => {});
  }

  on<K extends keyof Events & string>(event: K, listener: (payload: Events[K]) => void): void {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
  }

  off<K extends keyof Events & string>(event: K, listener: (payload: Events[K]) => void): void {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
  }

  once<K extends keyof Events & string>(event: K, listener: (payload: Events[K]) => void): void {
    this.emitter.once(event, listener as (...args: unknown[]) => void);
  }

  protected emit<K extends keyof Events & string>(event: K, payload: Events[K]): void {
    this.emitter.emit(event, payload);
  }
}
