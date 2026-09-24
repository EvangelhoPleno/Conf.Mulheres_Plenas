/* =============================================================
   Escolhe o gateway de pagamento pela variável PAYMENT_PROVIDER:
     mercadopago   Mercado Pago, o gateway da venda (Pix e cartão)
     mock          pagamento simulado, para testes e desenvolvimento

   Interface de um provedor:
     nome                     string
     metodos                  ['pix', 'cartao']
     criarCobranca(dados)     -> { transacaoId, pix?: { copiaECola, expiraEm }, linkPagamento? }
     consultarStatus(id, pedido) -> 'PENDENTE' | 'PAGO' | 'RECUSADO' | 'EXPIRADO' | 'CANCELADO' | 'REEMBOLSADO' | null
     validarWebhook(req)      -> boolean (assinatura/token do gateway)
     lerWebhook(req)          -> { transacaoId, pedidoId? } | null   (pode ser async)
   ============================================================= */
const config = require('../../config');

const PROVEDORES = {
    mock: function () { return require('./mockProvider'); },
    mercadopago: function () { return require('./mercadoPagoProvider'); }
};

let provedor = null;

function pagamento() {
    if (!provedor) {
        const carregar = PROVEDORES[config.pagamento.provedor];
        if (!carregar) {
            throw new Error('PAYMENT_PROVIDER inválido: "' + config.pagamento.provedor + '". Use: ' + Object.keys(PROVEDORES).join(', '));
        }
        provedor = carregar();
    }
    return provedor;
}

module.exports = { pagamento };
