/* Pagamento SIMULADO: não cobra ninguém. Serve para testar o site, a
   planilha e o e-mail enquanto a conta do gateway não está definida.
   O pagamento é aprovado pelo botão "simular aprovação" da página de
   pagamento, que chama POST /api/dev/simular-pagamento. */
const crypto = require('crypto');
const config = require('../../config');

const status = new Map();

module.exports = {
    nome: 'mock',
    simulado: true,
    metodos: ['pix', 'cartao'],

    async criarCobranca({ pedido, metodo }) {
        const transacaoId = 'mock_' + crypto.randomBytes(8).toString('hex');
        status.set(transacaoId, 'PENDENTE');

        if (metodo === 'cartao') {
            // um gateway real devolveria a URL do checkout dele
            return {
                transacaoId,
                linkPagamento: config.siteUrl + '/pagamento.html?pedido=' + encodeURIComponent(pedido.pedidoId) + '&simulado=cartao'
            };
        }

        return {
            transacaoId,
            pix: {
                copiaECola: '00020101021226860014BR.GOV.BCB.PIX2564pix.exemplo.com/TESTE-MULHERES-PLENAS-' + transacaoId + '5204000053039865406' + (pedido.valorTotal / 100).toFixed(2) + '5802BR5925IGREJA EVANGELHO PLENO6011PARAGOMINAS6304ABCD',
                expiraEm: new Date(Date.now() + 30 * 60 * 1000).toISOString()
            }
        };
    },

    async consultarStatus(transacaoId) {
        return status.get(transacaoId) || null;
    },

    validarWebhook() {
        return true;
    },

    lerWebhook(req) {
        const id = req.body && req.body.transacaoId;
        return id ? { transacaoId: String(id) } : null;
    },

    // só existe no simulado
    marcarComoPago(transacaoId) {
        status.set(transacaoId, 'PAGO');
    }
};
