const crypto = require('crypto');

// sem 0/O, 1/I/L: o código também é digitado na portaria
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function aleatorio(tamanho) {
    let saida = '';
    for (let i = 0; i < tamanho; i++) saida += ALFABETO[crypto.randomInt(ALFABETO.length)];
    return saida;
}

// ID público do pedido: vai na URL das páginas de pagamento e confirmação,
// então precisa ser impossível de adivinhar
function novoPedidoId() {
    return 'MP' + crypto.randomBytes(12).toString('base64url');
}

function novoCodigoIngresso() {
    return 'MP26-' + aleatorio(4) + '-' + aleatorio(4);
}

const PADRAO_INGRESSO = /^MP26-[A-Z2-9]{4}-[A-Z2-9]{4}$/;
const PADRAO_PEDIDO = /^MP[A-Za-z0-9_-]{16}$/;

module.exports = { novoPedidoId, novoCodigoIngresso, PADRAO_INGRESSO, PADRAO_PEDIDO };
