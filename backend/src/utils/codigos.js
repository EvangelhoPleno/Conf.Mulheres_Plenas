const crypto = require('crypto');

// sem 0/O, 1/I/L: o código também é digitado na portaria
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// ID público do pedido: vai na URL das páginas de pagamento e confirmação,
// então precisa ser impossível de adivinhar
function novoPedidoId() {
    return 'MP' + crypto.randomBytes(12).toString('base64url');
}

/* Os códigos do pedido são DERIVADOS do Pedido_ID, não sorteados.

   O webhook do Asaas e a consulta da página de pagamento podem chegar juntos e
   cair em instâncias diferentes da Vercel. Se as duas lerem o pedido ainda
   PENDENTE, as duas emitem: com sorteio, cada uma gerava um par diferente, o
   e-mail saía com o da primeira (a idempotência do Resend segura o segundo) e a
   planilha ficava com o da segunda — a portaria não conferia. Derivando do
   Pedido_ID, as duas chegam ao mesmo resultado e a corrida deixa de importar.

   Não precisa de segredo: o próprio Pedido_ID já é imprevisível (12 bytes
   aleatórios) e quem o conhece já vê os códigos na tela de confirmação. */
function codigosDoPedido(pedidoId, quantidade) {
    const codigos = [];
    for (let i = 0; i < quantidade; i++) {
        codigos.push('MP26-' + derivar(pedidoId + '#' + i, 4) + '-' + derivar(pedidoId + '#' + i + '@', 4));
    }
    return codigos;
}

/* Amostra o alfabeto sem viés: 31 não divide 256, então os bytes a partir de
   248 são descartados em vez de dobrados em cima das primeiras letras. */
function derivar(semente, tamanho) {
    const limite = 256 - (256 % ALFABETO.length);
    let saida = '';
    let rodada = 0;
    while (saida.length < tamanho) {
        const bytes = crypto.createHash('sha256').update(semente + '|' + rodada).digest();
        for (let i = 0; i < bytes.length && saida.length < tamanho; i++) {
            if (bytes[i] < limite) saida += ALFABETO[bytes[i] % ALFABETO.length];
        }
        rodada++;
    }
    return saida;
}

const PADRAO_INGRESSO = /^MP26-[A-Z2-9]{4}-[A-Z2-9]{4}$/;
const PADRAO_PEDIDO = /^MP[A-Za-z0-9_-]{16}$/;

module.exports = { novoPedidoId, codigosDoPedido, PADRAO_INGRESSO, PADRAO_PEDIDO };
