/* =============================================================
   SIPAG (Sicoob) — ESQUELETO, ainda não homologado.
   A conta ainda não foi definida e as APIs bancárias mudam os nomes
   dos campos, então os pontos marcados com "CONFIRMAR" precisam ser
   ajustados com o payload exato da documentação da Sipag.
   Enquanto INTEGRACAO_REVISADA for false, o checkout responde
   "vendas indisponíveis" em vez de mandar uma requisição inventada.
   ============================================================= */
const axios = require('axios');
const config = require('../../config');
const { descreverProduto } = require('../../catalogo');
const { segredoConfere } = require('../../utils/seguranca');

const INTEGRACAO_REVISADA = false;

const cliente = axios.create({ baseURL: config.sipag.apiUrl, timeout: 15000 });

let token = { valor: null, expiraEm: 0 };

// CONFIRMAR: rota e formato do OAuth2 (client_credentials é o mais comum)
async function autenticar() {
    if (token.valor && Date.now() < token.expiraEm - 60000) return token.valor;

    const resposta = await cliente.post('/oauth/token', new URLSearchParams({ grant_type: 'client_credentials' }), {
        auth: { username: config.sipag.clientId, password: config.sipag.clientSecret },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    token = {
        valor: resposta.data.access_token,
        expiraEm: Date.now() + (Number(resposta.data.expires_in) || 300) * 1000
    };
    return token.valor;
}

// CONFIRMAR: nomes dos campos da cobrança
function montarPayload({ pedido, produto, metodo, urls }) {
    return {
        referencia: pedido.pedidoId,
        valor: pedido.valorTotal,  // centavos — conferir se a Sipag espera reais (150.00)
        descricao: descreverProduto(produto) + ' x' + pedido.quantidade,
        formaPagamento: metodo === 'pix' ? 'PIX' : 'CARTAO_CREDITO',
        cliente: { nome: pedido.nome, email: pedido.email, documento: pedido.cpf },
        urlRetorno: urls.retorno,
        urlNotificacao: urls.webhook
    };
}

// CONFIRMAR: todos os status que a Sipag devolve
function mapearStatus(statusSipag) {
    const s = String(statusSipag || '').toUpperCase();
    if (['PAGO', 'APPROVED', 'APROVADO', 'CAPTURED', 'CONFIRMED', 'PAID'].includes(s)) return 'PAGO';
    if (['PENDENTE', 'PENDING', 'WAITING', 'CREATED', 'AUTHORIZED'].includes(s)) return 'PENDENTE';
    if (['RECUSADO', 'DENIED', 'DECLINED', 'REJECTED', 'FAILED'].includes(s)) return 'RECUSADO';
    if (['EXPIRADO', 'EXPIRED'].includes(s)) return 'EXPIRADO';
    if (['CANCELADO', 'CANCELED', 'CANCELLED', 'VOIDED'].includes(s)) return 'CANCELADO';
    if (['ESTORNADO', 'REFUNDED', 'CHARGEBACK'].includes(s)) return 'REEMBOLSADO';
    return null;
}

function erroNaoConfigurado() {
    const erro = new Error('Integração Sipag ainda não configurada.');
    erro.status = 503;
    erro.publico = 'As vendas on-line ainda não estão disponíveis. Tente novamente em breve.';
    return erro;
}

module.exports = {
    nome: 'sipag',
    simulado: false,
    metodos: ['pix', 'cartao'],

    async criarCobranca(dados) {
        if (!INTEGRACAO_REVISADA || !config.sipag.clientId || !config.sipag.clientSecret) throw erroNaoConfigurado();

        const acesso = await autenticar();
        // CONFIRMAR: rota de criação da cobrança/link
        const { data } = await cliente.post('/cobrancas', montarPayload(dados), {
            headers: { Authorization: 'Bearer ' + acesso }
        });

        // CONFIRMAR: onde vêm o ID, o Pix copia-e-cola e o link de pagamento
        return {
            transacaoId: String(data.id),
            pix: data.pix ? { copiaECola: data.pix.qrcode || data.pix.copiaECola, expiraEm: data.pix.expiracao || null } : null,
            linkPagamento: data.linkPagamento || data.url || null
        };
    },

    async consultarStatus(transacaoId) {
        if (!INTEGRACAO_REVISADA) return null;
        const acesso = await autenticar();
        // CONFIRMAR: rota de consulta
        const { data } = await cliente.get('/cobrancas/' + encodeURIComponent(transacaoId), {
            headers: { Authorization: 'Bearer ' + acesso }
        });
        return mapearStatus(data.status);
    },

    // CONFIRMAR: como a Sipag assina o webhook. Enquanto não souber, aceita o
    // segredo no cabeçalho x-webhook-secret ou em ?token= na URL cadastrada.
    // Mesmo aprovado aqui, o status é sempre reconsultado na API antes de liberar o ingresso.
    validarWebhook(req) {
        const recebido = req.get('x-webhook-secret') || req.query.token;
        return segredoConfere(recebido, config.sipag.webhookSecret);
    },

    lerWebhook(req) {
        const corpo = req.body || {};
        const id = corpo.id || corpo.transacaoId || corpo.transactionId || (corpo.data && corpo.data.id);
        return id ? { transacaoId: String(id) } : null;
    },

    _mapearStatus: mapearStatus
};
