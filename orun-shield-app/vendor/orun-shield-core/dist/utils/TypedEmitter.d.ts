/**
 * Wrapper tipado sobre o EventEmitter nativo do Node.
 * Garante que cada evento emitido pelo Shield tenha payload correto,
 * evitando o `any` implícito do EventEmitter padrão.
 */
export declare class TypedEmitter<Events extends Record<string, unknown> = Record<string, unknown>> {
    private emitter;
    constructor();
    on<K extends keyof Events & string>(event: K, listener: (payload: Events[K]) => void): void;
    off<K extends keyof Events & string>(event: K, listener: (payload: Events[K]) => void): void;
    once<K extends keyof Events & string>(event: K, listener: (payload: Events[K]) => void): void;
    protected emit<K extends keyof Events & string>(event: K, payload: Events[K]): void;
}
