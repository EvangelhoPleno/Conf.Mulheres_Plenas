/* =============================================================
   ASAAS — gateway de pagamento (Pix e cartão).
   Documentação: https://docs.asaas.com/

   Ambientes (a chave precisa combinar com a URL):
     sandbox   https://api-sandbox.asaas.com/v3   chave $aact_hmlg_...
     produção  https://api.asaas.com/v3           chave $aact_prod_...

   Fluxo de uma compra:
     1. acha ou cria o cliente pelo CPF        POST /customers
     2. cria a cobrança                        POST /payments
     3. no Pix, busca o copia-e-cola           GET  /payments/{id}/pixQrCode
   ============================================================= */
const axios = require('axios');
const config = require('../../config');
const { descreverProduto } = require('../../catalogo');
const { segredoConfere } = require('../../utils/seguranca');

const cliente = axios.create({
    baseURL: config.asaas.apiUrl,
    timeout: 20000,
    headers: {
        access_token: config.asaas.apiKey,
        'Content-Type': 'application/json',
        // o Asaas pede identificação da aplicação nas chamadas
        'User-Agent': 'ConferenciaMulheresPlenas/1.0'
    }
});

/* O Asaas espera a data de vencimento em YYYY-MM-DD, no fuso de Paragominas.
   D+1 dá à compradora o resto do dia mais o dia seguinte para pagar o Pix —
   não seguramos vaga enquanto o pedido está PENDENTE, então não custa nada. */
const DIA_ISO = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Belem' });

function vencimento(dias) {
    return DIA_ISO.format(new Date(Date.now() + (dias || 0) * 86400000));
}

/* O valor no pedido está em centavos; o Asaas cobra em reais com decimais. */
function emReais(centavos) {
    return Number((centavos / 100).toFixed(2));
}

function erroNaoConfigurado() {
    const erro = new Error('ASAAS_API_KEY não configurada.');
    erro.status = 503;
    erro.publico = 'As vendas on-line ainda não estão disponíveis. Tente novamente em breve.';
    return erro;
}

/* O Asaas devolve o motivo em data.errors[].description — sem isso o log
   mostraria só "Request failed with status code 400". */
function explicar(erro, ondeFoi) {
    const lista = erro.response && erro.response.data && erro.response.data.errors;
    const detalhe = Array.isArray(lista)
        ? lista.map(function (e) { return e.description || e.code; }).join('; ')
        : erro.message;
    const novo = new Error('Asaas (' + ondeFoi + '): ' + detalhe);
    novo.status = 502;
    novo.publico = 'Não conseguimos gerar a cobrança agora. Tente de novo em alguns instantes.';
    return novo;
}

/* O Asaas recusa celular que ele considere implausível (11 dígitos iguais,
   por exemplo) com o código invalid_mobilePhone. A nossa validação só confere
   o tamanho, então um número assim passa no formulário e derrubaria a compra
   inteira num campo que para o Asaas é opcional. */
function ehErroDeTelefone(erro) {
    const lista = erro.response && erro.response.data && erro.response.data.errors;
    return Array.isArray(lista) && lista.some(function (e) {
        return /phone/i.test(String(e.code || ''));
    });
}

/* Reaproveita o cadastro quando a mesma pessoa compra de novo, em vez de
   encher a conta do Asaas de clientes repetidos com o mesmo CPF. */
async function acharOuCriarCliente(pedido) {
    const cpf = String(pedido.cpf || '').replace(/\D/g, '');

    const { data } = await cliente.get('/customers', { params: { cpfCnpj: cpf, limit: 1 } });
    if (data && Array.isArray(data.data) && data.data.length) return data.data[0].id;

    const cadastro = {
        name: pedido.nome,
        cpfCnpj: cpf,
        email: pedido.email,
        mobilePhone: String(pedido.telefone || '').replace(/\D/g, '') || undefined,
        externalReference: pedido.pedidoId,
        notificationDisabled: true   // quem avisa a compradora é o nosso e-mail
    };

    try {
        const novo = await cliente.post('/customers', cadastro);
        return novo.data.id;
    } catch (erro) {
        if (!cadastro.mobilePhone || !ehErroDeTelefone(erro)) throw erro;
        // o telefone continua na planilha; aqui ele só atrapalharia a venda
        console.warn('[asaas] telefone recusado no pedido', pedido.pedidoId, '— criando cliente sem ele');
        delete cadastro.mobilePhone;
        const novo = await cliente.post('/customers', cadastro);
        return novo.data.id;
    }
}

/* Status do Asaas -> os seis status da planilha.
   Lista em https://docs.asaas.com/reference/status-de-uma-cobranca */
function mapearStatus(statusAsaas) {
    const s = String(statusAsaas || '').toUpperCase();
    if (['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED'].includes(s)) return 'PAGO';
    if (['PENDING', 'AWAITING_RISK_ANALYSIS', 'AWAITING_CHARGEBACK_REVERSAL', 'DUNNING_REQUESTED'].includes(s)) return 'PENDENTE';
    if (['OVERDUE'].includes(s)) return 'EXPIRADO';
    if (['DELETED'].includes(s)) return 'CANCELADO';
    if (['REFUNDED', 'REFUND_REQUESTED', 'REFUND_IN_PROGRESS', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE'].includes(s)) return 'REEMBOLSADO';
    return null;
}

module.exports = {
    nome: 'asaas',
    simulado: false,
    metodos: ['pix', 'cartao'],

    async criarCobranca({ pedido, produto, metodo }) {
        if (!config.asaas.apiKey) throw erroNaoConfigurado();

        let clienteId;
        try {
            clienteId = await acharOuCriarCliente(pedido);
        } catch (erro) {
            throw explicar(erro, 'cliente');
        }

        let cobranca;
        try {
            const resposta = await cliente.post('/payments', {
                customer: clienteId,
                billingType: metodo === 'cartao' ? 'CREDIT_CARD' : 'PIX',
                value: emReais(pedido.valorTotal),
                dueDate: vencimento(1),
                description: descreverProduto(produto) + ' x' + pedido.quantidade,
                externalReference: pedido.pedidoId
            });
            cobranca = resposta.data;
        } catch (erro) {
            throw explicar(erro, 'cobrança');
        }

        /* No cartão, invoiceUrl é a página de pagamento do Asaas: os dados do
           cartão nunca passam pelo nosso servidor. */
        if (metodo === 'cartao') {
            return { transacaoId: String(cobranca.id), linkPagamento: cobranca.invoiceUrl || null };
        }

        let qr = {};
        try {
            const resposta = await cliente.get('/payments/' + encodeURIComponent(cobranca.id) + '/pixQrCode');
            qr = resposta.data || {};
        } catch (erro) {
            // sem o copia-e-cola a tela de pagamento ainda oferece o invoiceUrl
            console.error('[asaas] cobrança', cobranca.id, 'criada, mas o QR do Pix falhou:',
                explicar(erro, 'pixQrCode').message);
        }

        return {
            transacaoId: String(cobranca.id),
            pix: qr.payload ? { copiaECola: qr.payload, expiraEm: qr.expirationDate || null } : null,
            linkPagamento: cobranca.invoiceUrl || null
        };
    },

    async consultarStatus(transacaoId) {
        if (!config.asaas.apiKey) return null;
        try {
            const { data } = await cliente.get('/payments/' + encodeURIComponent(transacaoId));
            return mapearStatus(data.status);
        } catch (erro) {
            if (erro.response && erro.response.status === 404) return null;
            throw explicar(erro, 'consulta');
        }
    },

    /* O Asaas manda o token cadastrado no webhook no cabeçalho
       asaas-access-token. Mesmo validado, processarNotificacao() reconsulta o
       status na API antes de liberar o ingresso — o corpo nunca é a verdade. */
    validarWebhook(req) {
        return segredoConfere(req.get('asaas-access-token'), config.asaas.webhookToken);
    },

    lerWebhook(req) {
        const corpo = req.body || {};
        const id = corpo.payment && corpo.payment.id;
        return id ? { transacaoId: String(id) } : null;
    },

    _mapearStatus: mapearStatus,
    _ehErroDeTelefone: ehErroDeTelefone,
    _emReais: emReais
};
