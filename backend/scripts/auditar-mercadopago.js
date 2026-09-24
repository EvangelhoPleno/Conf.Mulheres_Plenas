/* Auditoria ponta a ponta com o Mercado Pago de TESTE: o que o site pede,
   o que a API responde. Pedidos em memoria (nao toca na planilha de verdade)
   e e-mail so no console.

   Pix de teste nao tem como ser pago, entao a parte "depois do pagamento"
   passa pelo cartao: cria o pedido no cartao e paga a preferencia com um
   cartao de teste (titular APRO = aprovado), pela API. Precisa de
   MERCADOPAGO_PUBLIC_KEY, a Public Key das mesmas credenciais de teste. */
process.env.PAYMENT_PROVIDER = 'mercadopago';
process.env.GOOGLE_SHEET_ID = '';
process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = '';
process.env.GOOGLE_CREDENTIALS_FILE = 'nao-existe.json';
process.env.RESEND_API_KEY = '';
process.env.API_URL = 'http://localhost:3998';
process.env.MERCADOPAGO_WEBHOOK_SECRET = 'segredo-de-auditoria';

const crypto = require('crypto');
const axios = require('axios');
const http = require('http');
// a mesma porta de entrada que a Vercel usa
const handler = require('../../api/index.js');
const catalogo = require('../src/catalogo');
const config = require('../src/config');
const mp = require('../src/services/pagamento/mercadoPagoProvider')._cliente;

const produto = catalogo.buscarProduto('lote-1');
const janelaOriginal = produto.vendaDe;

const BASE = 'http://localhost:3998';
let falhas = 0;

function ok(condicao, descricao, detalhe) {
    console.log((condicao ? '  ok   ' : '  FALHA') + '  ' + descricao + (detalhe !== undefined ? '   [' + detalhe + ']' : ''));
    if (!condicao) falhas++;
}

async function chamar(caminho, opcoes) {
    opcoes = opcoes || {};
    const r = await fetch(BASE + caminho, {
        method: opcoes.method || 'GET',
        headers: Object.assign(opcoes.corpo ? { 'Content-Type': 'application/json' } : {}, opcoes.headers),
        body: opcoes.corpo ? JSON.stringify(opcoes.corpo) : undefined
    });
    const tipo = r.headers.get('content-type') || '';
    const corpo = tipo.includes('json') ? await r.json() : await r.arrayBuffer();
    return { status: r.status, tipo, corpo };
}

// o aviso como o Mercado Pago manda: data.id na URL e no corpo, assinado
function avisar(pagamentoId, segredo) {
    const ts = String(Math.floor(Date.now() / 1000));
    const requestId = crypto.randomUUID();
    const manifesto = 'id:' + String(pagamentoId).toLowerCase() + ';request-id:' + requestId + ';ts:' + ts + ';';
    const v1 = crypto.createHmac('sha256', segredo || config.mercadoPago.webhookSecret).update(manifesto).digest('hex');
    return chamar('/api/webhook?data.id=' + pagamentoId + '&type=payment', {
        method: 'POST',
        headers: { 'x-signature': 'ts=' + ts + ',v1=' + v1, 'x-request-id': requestId },
        corpo: { action: 'payment.updated', type: 'payment', data: { id: String(pagamentoId) } }
    });
}

const COMPRADORA = {
    produto: 'lote-1', quantidade: 2, metodo: 'pix',
    nome: 'Maria de Teste', email: 'maria.teste@exemplo.com.br',
    cpf: '249.715.637-92', telefone: '(91) 98888-7777'
};

/* Cartao de teste do Mercado Pago (Brasil). O nome do titular decide o
   resultado: APRO aprova, OTHE recusa. */
async function pagarNoCartao(pedidoId, valorEmReais) {
    const { data: token } = await axios.post('https://api.mercadopago.com/v1/card_tokens', {
        card_number: '4235647728025682',
        expiration_month: 11,
        expiration_year: 2030,
        security_code: '123',
        cardholder: { name: 'APRO', identification: { type: 'CPF', number: '12345678909' } }
    }, { params: { public_key: config.mercadoPago.publicKey }, timeout: 20000 });

    const { data } = await mp.post('/v1/payments', {
        transaction_amount: valorEmReais,
        token: token.id,
        installments: 1,
        payment_method_id: 'visa',
        // tem que ser uma conta de COMPRADOR de teste que exista; e-mail inventado dá 401
        payer: { email: process.env.MERCADOPAGO_EMAIL_COMPRADOR_TESTE, identification: { type: 'CPF', number: '12345678909' } },
        external_reference: pedidoId,
        description: 'Auditoria'
    }, { headers: { 'X-Idempotency-Key': 'auditoria-' + pedidoId } });
    return data;
}

async function main() {
    if (!config.mercadoPago.accessToken) throw new Error('MERCADOPAGO_ACCESS_TOKEN vazio no backend/.env');
    const { data: conta } = await mp.get('/users/me');
    const deTeste = config.mercadoPago.ambiente === 'teste' || (conta.tags || []).includes('test_user');
    if (!deTeste) throw new Error('credencial de PRODUCAO: a auditoria cria pagamentos, rode so com a de teste');

    console.log('\n=== 1. A janela de venda fechada devolve 409 ===');
    const fechado = await chamar('/api/checkout', { method: 'POST', corpo: COMPRADORA });
    if (catalogo.situacaoDoLote(produto) === 'espera') {
        ok(fechado.status === 409, 'checkout antes da abertura e recusado', 'HTTP ' + fechado.status);
    } else {
        console.log('  nota  o 1o lote ja esta aberto; pulando');
    }
    produto.vendaDe = '2026-01-01';

    console.log('\n=== 2. /api/saude ===');
    const saude = await chamar('/api/saude');
    ok(saude.corpo.pagamento === 'mercadopago', 'provedor e o mercadopago', saude.corpo.pagamento);
    ok(saude.corpo.simulado === false, 'simulado = false');
    ok(saude.corpo.ok === true, 'ok = true (credencial e assinatura presentes)');

    console.log('\n=== 3. Compra no Pix ===');
    /* Usuario de teste do Mercado Pago nao tem Pix: o checkout volta 502
       ("Unauthorized use of live credentials"). O Pix se prova em producao. */
    let pixId = null;
    const compra = await chamar('/api/checkout', { method: 'POST', corpo: COMPRADORA });
    if (compra.status === 502) {
        console.log('  nota  usuario de teste nao tem Pix (502 esperado); o Pix se prova com a credencial de producao');
        ok(String(compra.corpo.erro).length > 10, 'a compradora recebe mensagem, nao um erro cru', compra.corpo.erro);
    } else {
        ok(compra.status === 201, 'POST /api/checkout responde 201', 'HTTP ' + compra.status + ' ' + JSON.stringify(compra.corpo).slice(0, 200));
        if (compra.status !== 201) throw new Error('sem pedido, nao da para seguir');
        const pedidoPix = compra.corpo;
        ok(pedidoPix.valorTotal === 11000, 'valor de 2 ingressos = R$ 110,00', pedidoPix.valorTotal);
        ok(Boolean(pedidoPix.pix && pedidoPix.pix.copiaECola), 'pix.copiaECola presente (sem ele: conta sem chave Pix)');
        ok(Boolean(pedidoPix.pix && String(pedidoPix.pix.qrCode || '').startsWith('data:image/png')), 'pix.qrCode e uma imagem pronta');
        ok(Boolean(pedidoPix.linkPagamento), 'linkPagamento, o plano B se o QR falhar');
        const consulta = await chamar('/api/pedidos/' + pedidoPix.pedidoId);
        ok(consulta.corpo.status === 'PENDENTE', 'consulta ao Mercado Pago: ainda PENDENTE', consulta.corpo.status);

        const busca = await mp.get('/v1/payments/search', { params: { external_reference: pedidoPix.pedidoId } });
        pixId = busca.data.results[0] && busca.data.results[0].id;
        ok(Boolean(pixId), 'o Pix no Mercado Pago carrega o Pedido_ID em external_reference', pixId);
    }

    console.log('\n=== 4. Webhook ===');
    const qualquerId = pixId || 12345;
    const semAssinatura = await chamar('/api/webhook?data.id=' + qualquerId, { method: 'POST', corpo: { type: 'payment', data: { id: String(qualquerId) } } });
    ok(semAssinatura.status === 401, 'sem assinatura e recusado com 401', 'HTTP ' + semAssinatura.status);
    ok((await avisar(qualquerId, 'segredo-errado')).status === 401, 'assinado com outro segredo tambem');
    if (pixId) ok((await avisar(pixId)).status === 200, 'aviso legitimo de Pix pendente devolve 200');
    ok((await avisar(99999999999)).status === 200, 'pagamento inexistente (o "simular" do painel) devolve 200');

    console.log('\n=== 5. Compra no cartao, paga com cartao de teste ===');
    const noCartao = await chamar('/api/checkout', { method: 'POST', corpo: Object.assign({}, COMPRADORA, { metodo: 'cartao' }) });
    ok(noCartao.status === 201, 'checkout no cartao responde 201', 'HTTP ' + noCartao.status);
    const pedidoCartao = noCartao.corpo;
    ok(/mercadopago/.test(String(pedidoCartao.linkPagamento)), 'link do Checkout Pro', pedidoCartao.linkPagamento);

    if (!config.mercadoPago.publicKey || !process.env.MERCADOPAGO_EMAIL_COMPRADOR_TESTE) {
        console.log('  nota  sem MERCADOPAGO_PUBLIC_KEY ou MERCADOPAGO_EMAIL_COMPRADOR_TESTE: pulando o pagamento no cartao');
    } else {
        let pago;
        try {
            pago = await pagarNoCartao(pedidoCartao.pedidoId, 110);
        } catch (e) {
            const motivo = JSON.stringify((e.response && e.response.data) || e.message);
            if (!/live credentials/i.test(motivo)) throw e;
            // credencial de teste so aceita pagamento feito na pagina do Mercado Pago
            console.log('  nota  o Mercado Pago nao aceita pagamento pela API com esta credencial de teste;');
            console.log('        o pagamento no cartao se prova com: npm run mercadopago:ensaio-cartao');
            return;
        }
        ok(pago.status === 'approved', 'cartao de teste APRO aprovado', pago.status + ' / ' + pago.status_detail);
        ok((await avisar(pago.id)).status === 200, 'webhook do pagamento que o pedido nao conhecia devolve 200');

        const depois = await chamar('/api/pedidos/' + pedidoCartao.pedidoId);
        ok(depois.corpo.status === 'PAGO', 'pedido virou PAGO', depois.corpo.status);
        ok(depois.corpo.ingressos.length === 2, '2 ingressos gerados', depois.corpo.ingressos.length);
        const codigos = depois.corpo.ingressos.map(function (i) { return i.codigo; }).join(',');

        ok((await avisar(pago.id)).status === 200, 'aviso repetido devolve 200');
        const denovo = await chamar('/api/pedidos/' + pedidoCartao.pedidoId);
        ok(denovo.corpo.ingressos.map(function (i) { return i.codigo; }).join(',') === codigos, 'os codigos continuam os mesmos');
    }

    console.log('\n=== limpando ===');
    if (pixId) await mp.put('/v1/payments/' + pixId, { status: 'cancelled' }).then(
        function () { console.log('  Pix ' + pixId + ' cancelado'); },
        function (e) { console.log('  nao cancelou: ' + e.message); });
    produto.vendaDe = janelaOriginal;
}

const servidor = http.createServer(handler).listen(3998, async function () {
    try {
        await main();
    } catch (e) {
        console.error('\nINTERROMPIDO:', e.message);
        if (e.response) console.error(JSON.stringify(e.response.data));
        falhas++;
    }
    console.log('\n' + (falhas ? falhas + ' FALHA(S)' : 'tudo passou'));
    servidor.close();
    process.exit(falhas ? 1 : 0);
});
