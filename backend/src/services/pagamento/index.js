/* =============================================================
   Escolhe o gateway de pagamento pela variável PAYMENT_PROVIDER.
   Para plugar outro banco/gateway (Sipag, Mercado Pago, Asaas, Efí...),
   crie um arquivo nesta pasta com a mesma interface do mockProvider.js
   e registre abaixo. Nada fora desta pasta precisa mudar.

   Interface de um provedor:
     nome                     string
     metodos                  ['pix', 'cartao']
     criarCobranca(dados)     -> { transacaoId, pix?: { copiaECola, expiraEm }, linkPagamento? }
     consultarStatus(id)      -> 'PENDENTE' | 'PAGO' | 'RECUSADO' | 'EXPIRADO' | 'CANCELADO' | 'REEMBOLSADO' | null
     validarWebhook(req)      -> boolean (assinatura/token do gateway)
     lerWebhook(req)          -> { transacaoId } | null
   ============================================================= */
const config = require('../../config');

const PROVEDORES = {
    mock: function () { return require('./mockProvider'); },
    sipag: function () { return require('./sipagProvider'); }
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
