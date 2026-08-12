"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TypedEmitter = void 0;
const node_events_1 = require("node:events");
/**
 * Wrapper tipado sobre o EventEmitter nativo do Node.
 * Garante que cada evento emitido pelo Shield tenha payload correto,
 * evitando o `any` implícito do EventEmitter padrão.
 */
class TypedEmitter {
    emitter = new node_events_1.EventEmitter();
    constructor() {
        // "error" é um nome de evento reservado no EventEmitter nativo do Node:
        // se emitido sem NENHUM listener registrado, o Node lança a exceção em vez
        // de só notificar (diferente de qualquer outro evento). Sem este no-op,
        // um consumidor do Shield que esquecer de fazer `.on("error", ...)` teria
        // a aplicação derrubada de forma confusa na primeira falha de scan/monitor.
        // Este listener não interfere em nada: se o consumidor registrar seu
        // próprio `.on("error", ...)`, ambos são chamados normalmente.
        this.emitter.on("error", () => { });
    }
    on(event, listener) {
        this.emitter.on(event, listener);
    }
    off(event, listener) {
        this.emitter.off(event, listener);
    }
    once(event, listener) {
        this.emitter.once(event, listener);
    }
    emit(event, payload) {
        this.emitter.emit(event, payload);
    }
}
exports.TypedEmitter = TypedEmitter;
