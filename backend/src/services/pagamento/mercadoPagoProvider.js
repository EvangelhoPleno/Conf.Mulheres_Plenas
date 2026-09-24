/* =============================================================
   MERCADO PAGO — gateway de pagamento (Pix e cartão).
   Documentação: https://www.mercadopago.com.br/developers/pt/reference

   Uma URL só (https://api.mercadopago.com); o ambiente é a credencial:
     teste     Access Token TEST-...      (ou de um usuário de teste)
     produção  Access Token APP_USR-...   (credenciais de produção da conta)

   Fluxo de uma compra:
     Pix     POST /v1/payments  (payment_method_id: pix) -> copia-e-cola na hora
     cartão  POST /checkout/preferences (Checkout Pro)  -> link da página do
             Mercado Pago; o pagamento só nasce quando ela paga

   Por isso o elo entre pedido e pagamento é o external_reference (= Pedido_ID),
   e não o ID da transação: no cartão, o ID do pagamento só aparece depois,
   e ela pode ter tentado mais de um cartão.
   ============================================================= */
const crypto = require('crypto');
const axios = require('axios');
const config = require('../../config');
const { descreverProduto } = require('../../catalogo');
const { segredoConfere } = require('../../utils/seguranca');

const cliente = axios.create({
    baseURL: 'https://api.mercadopago.com',
    timeout: 20000,
    headers: {
        Authorization: 'Bearer ' + config.mercadoPago.accessToken,
        'Content-Type': 'application/json'
    }
});

// o que vai para a fatura do cartão (o Mercado Pago aceita até 22 caracteres)
const DESCRITOR = 'MULHERES PLENAS';

// prefixo do transacaoId de uma compra no cartão: é o ID da preferência, não de um pagamento
const PREFERENCIA = 'pref_';

/* O valor no pedido está em centavos; o Mercado Pago cobra em reais. */
function emReais(centavos) {
    return Number((centavos / 100).toFixed(2));
}

/* O Pix vale até o fim do dia seguinte, no fuso de Paragominas (UTC-3 fixo).
   Não seguramos vaga enquanto o pedido está PENDENTE, então não custa nada.
   Formato exigido: 2026-09-28T23:59:59.000-03:00 */
function expiracaoDoPix(agora) {
    const emBelem = new Date((agora || Date.now()) - 3 * 3600000);
    emBelem.setUTCDate(emBelem.getUTCDate() + 1);
    return emBelem.toISOString().slice(0, 10) + 'T23:59:59.000-03:00';
}

function separarNome(nome) {
    const partes = String(nome || '').trim().split(/\s+/);
    return { first_name: partes[0] || '', last_name: partes.slice(1).join(' ') || partes[0] || '' };
}

function comprador(pedido) {
    return Object.assign(separarNome(pedido.nome), {
        email: pedido.email,
        identification: { type: 'CPF', number: String(pedido.cpf || '').replace(/\D/g, '') }
    });
}

function erroNaoConfigurado() {
    const erro = new Error('MERCADOPAGO_ACCESS_TOKEN não configurado.');
    erro.status = 503;
    erro.publico = 'As vendas on-line ainda não estão disponíveis. Tente novamente em breve.';
    return erro;
}

/* O Mercado Pago devolve o motivo em message e cause[].description — sem isso
   o log mostraria só "Request failed with status code 400". */
function explicar(erro, ondeFoi) {
    const dados = erro.response && erro.response.data;
    const causas = dados && Array.isArray(dados.cause)
        ? dados.cause.map(function (c) { return c.description || c.code; }).filter(Boolean)
        : [];
    const detalhe = [dados && dados.message].concat(causas).filter(Boolean).join('; ') || erro.message;
    const novo = new Error('Mercado Pago (' + ondeFoi + '): ' + detalhe);
    novo.status = 502;
    novo.publico = 'Não conseguimos gerar a cobrança agora. Tente de novo em alguns instantes.';
    return novo;
}

/* Status de UM pagamento -> os status da planilha.
   Lista em https://www.mercadopago.com.br/developers/pt/reference/payments/_payments_id/get
   "authorized" é cartão reservado mas não capturado: ainda não é dinheiro.
   "in_mediation" é disputa de um pagamento que já foi aprovado: o pedido
   continua PAGO até virar charged_back ou refunded. */
function mapearStatus(pagamento) {
    const s = String((pagamento && pagamento.status) || '').toLowerCase();
    if (s === 'approved') return 'PAGO';
    if (['pending', 'in_process', 'authorized', 'in_mediation'].includes(s)) return 'PENDENTE';
    if (s === 'rejected') return 'RECUSADO';
    // o Pix que ninguém pagou vira cancelled com status_detail "expired"
    if (s === 'cancelled') return pagamento.status_detail === 'expired' ? 'EXPIRADO' : 'CANCELADO';
    if (['refunded', 'charged_back'].includes(s)) return 'REEMBOLSADO';
    return null;
}

/* Várias tentativas no mesmo pedido (cartão recusado e depois outro aprovado)
   viram um status só. Uma aprovada basta; um estorno pesa mais que uma
   tentativa recusada; e enquanto houver tentativa em andamento, a recusa de
   outra não encerra o pedido. */
const PRIORIDADE = ['PAGO', 'REEMBOLSADO', 'PENDENTE', 'RECUSADO', 'EXPIRADO', 'CANCELADO'];

function resumirTentativas(pagamentos) {
    let melhor = null;
    (pagamentos || []).forEach(function (p) {
        const status = mapearStatus(p);
        if (status && (melhor === null || PRIORIDADE.indexOf(status) < PRIORIDADE.indexOf(melhor))) melhor = status;
    });
    return melhor;
}

async function criarPix(pedido, produto) {
    const { data } = await cliente.post('/v1/payments', {
        transaction_amount: emReais(pedido.valorTotal),
        description: descreverProduto(produto) + ' x' + pedido.quantidade,
        payment_method_id: 'pix',
        payer: comprador(pedido),
        external_reference: pedido.pedidoId,
        date_of_expiration: expiracaoDoPix()
    }, {
        // obrigatório no /v1/payments: repetir a chamada não cria um segundo Pix
        headers: { 'X-Idempotency-Key': pedido.pedidoId }
    });

    const qr = (data.point_of_interaction && data.point_of_interaction.transaction_data) || {};
    return {
        transacaoId: String(data.id),
        pix: qr.qr_code ? { copiaECola: qr.qr_code, expiraEm: data.date_of_expiration || null } : null,
        // a página do Mercado Pago com o mesmo QR: o plano B da tela de pagamento
        linkPagamento: qr.ticket_url || null
    };
}

/* Checkout Pro: os dados do cartão são digitados na página do Mercado Pago e
   nunca passam pelo nosso servidor. Só cartão — boleto compensaria em dias,
   e o Pix já tem o fluxo próprio, com o QR na nossa página. */
async function criarLinkDoCartao(pedido, produto, urls) {
    const retorno = (urls && urls.retorno) || config.siteUrl;
    const preferencia = {
        items: [{
            id: produto.id,
            title: descreverProduto(produto),
            quantity: pedido.quantidade,
            unit_price: emReais(produto.precoUnitario),
            currency_id: 'BRL'
        }],
        payer: comprador(pedido),
        external_reference: pedido.pedidoId,
        statement_descriptor: DESCRITOR,
        back_urls: { success: retorno, pending: retorno, failure: retorno },
        payment_methods: {
            excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }, { id: 'bank_transfer' }],
            installments: config.mercadoPago.parcelasMax
        }
    };
    // o Mercado Pago só volta sozinho para endereço https (no computador não há)
    if (/^https:\/\//.test(retorno)) preferencia.auto_return = 'approved';

    const { data } = await cliente.post('/checkout/preferences', preferencia);
    return {
        transacaoId: PREFERENCIA + data.id,
        linkPagamento: config.mercadoPago.ambiente === 'teste'
            ? (data.sandbox_init_point || data.init_point)
            : data.init_point
    };
}

async function buscarPagamento(id) {
    try {
        const { data } = await cliente.get('/v1/payments/' + encodeURIComponent(id));
        return data;
    } catch (erro) {
        if (erro.response && erro.response.status === 404) return null;
        throw explicar(erro, 'consulta');
    }
}

async function pagamentosDoPedido(pedidoId) {
    try {
        const { data } = await cliente.get('/v1/payments/search', {
            params: { external_reference: pedidoId, sort: 'date_created', criteria: 'desc', limit: 30 }
        });
        return (data && data.results) || [];
    } catch (erro) {
        throw explicar(erro, 'busca');
    }
}

/* Assinatura do webhook (x-signature: "ts=...,v1=..."), conforme
   https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
   O manifesto é id:<data.id da URL>;request-id:<x-request-id>;ts:<ts>; —
   com o id em minúsculas, e cada parte omitida se não vier. */
function assinaturaConfere(req, segredo) {
    if (!segredo) return false;
    const partes = {};
    String(req.get('x-signature') || '').split(',').forEach(function (par) {
        const i = par.indexOf('=');
        if (i > 0) partes[par.slice(0, i).trim()] = par.slice(i + 1).trim();
    });
    if (!partes.ts || !partes.v1) return false;

    const query = req.query || {};
    const dataId = query['data.id'] || (query.data && query.data.id) || '';
    const requestId = req.get('x-request-id') || '';

    let manifesto = '';
    if (dataId) manifesto += 'id:' + String(dataId).toLowerCase() + ';';
    if (requestId) manifesto += 'request-id:' + requestId + ';';
    manifesto += 'ts:' + partes.ts + ';';

    const esperado = crypto.createHmac('sha256', segredo).update(manifesto).digest('hex');
    return segredoConfere(partes.v1.toLowerCase(), esperado);
}

module.exports = {
    nome: 'mercadopago',
    simulado: false,
    metodos: ['pix', 'cartao'],

    async criarCobranca({ pedido, produto, metodo, urls }) {
        if (!config.mercadoPago.accessToken) throw erroNaoConfigurado();
        try {
            return metodo === 'cartao'
                ? await criarLinkDoCartao(pedido, produto, urls)
                : await criarPix(pedido, produto);
        } catch (erro) {
            throw explicar(erro, metodo === 'cartao' ? 'preferência do cartão' : 'Pix');
        }
    },

    /* No Pix, o transacaoId é o próprio pagamento. No cartão é a preferência,
       que não tem status: o que vale são os pagamentos com o Pedido_ID. */
    async consultarStatus(transacaoId, pedido) {
        if (!config.mercadoPago.accessToken) return null;
        const id = String(transacaoId || '');
        if (id.startsWith(PREFERENCIA)) {
            if (!pedido || !pedido.pedidoId) return null;
            return resumirTentativas(await pagamentosDoPedido(pedido.pedidoId));
        }
        return mapearStatus(await buscarPagamento(id));
    },

    validarWebhook(req) {
        return assinaturaConfere(req, config.mercadoPago.webhookSecret);
    },

    /* O aviso só traz o ID do pagamento. Buscamos o pagamento na API para
       descobrir de qual pedido ele é (external_reference) — é assim que um
       pagamento de cartão, que o pedido ainda não conhecia, acha o dono.
       Mesmo assim processarNotificacao() reconsulta o status antes de liberar
       o ingresso: o corpo nunca é a verdade. */
    async lerWebhook(req) {
        const corpo = req.body || {};
        const query = req.query || {};
        const tipo = corpo.type || query.type || corpo.topic || query.topic;
        if (tipo && tipo !== 'payment') return null;

        const id = (corpo.data && corpo.data.id) || query['data.id'] || (query.data && query.data.id);
        if (!id) return null;

        const pagamento = await buscarPagamento(id);
        // o botão "simular" do painel manda um ID que não existe
        if (!pagamento) return null;
        return { transacaoId: String(pagamento.id), pedidoId: pagamento.external_reference || null };
    },

    _cliente: cliente,
    _mapearStatus: mapearStatus,
    _resumirTentativas: resumirTentativas,
    _assinaturaConfere: assinaturaConfere,
    _expiracaoDoPix: expiracaoDoPix,
    _emReais: emReais
};
