/* Provedor Mercado Pago: regras, assinatura do webhook e o fluxo inteiro
   pela API, com o Mercado Pago simulado dentro do processo (o get/post do
   cliente HTTP trocados por respostas do formato real). O que fala com a
   API de verdade é o npm run mercadopago:testar. Rode com: npm test */
process.env.NODE_ENV = 'test';
process.env.PAYMENT_PROVIDER = 'mercadopago';
process.env.MERCADOPAGO_ACCESS_TOKEN = 'TEST-token-de-teste';
process.env.MERCADOPAGO_WEBHOOK_SECRET = 'segredo-do-webhook';
process.env.GOOGLE_SHEET_ID = '';
process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = '';
process.env.GOOGLE_CREDENTIALS_FILE = 'nao-existe.json';
process.env.RESEND_API_KEY = '';
process.env.SITE_URL = 'https://evangelhoplenoparagominas.com.br';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const mp = require('../src/services/pagamento/mercadoPagoProvider');
const catalogo = require('../src/catalogo');
const { criarApp } = require('../src/app');

test('a interface do provedor está completa', function () {
    ['criarCobranca', 'consultarStatus', 'validarWebhook', 'lerWebhook'].forEach(function (metodo) {
        assert.equal(typeof mp[metodo], 'function', 'falta ' + metodo);
    });
    assert.equal(mp.nome, 'mercadopago');
    assert.equal(mp.simulado, false, 'nunca pode ser simulado: cobra de verdade');
    assert.deepEqual(mp.metodos, ['pix', 'cartao']);
});

test('valor vai em reais, não em centavos', function () {
    assert.equal(mp._emReais(5500), 55);
    assert.equal(mp._emReais(11050), 110.5);
    assert.equal(typeof mp._emReais(5500), 'number');
});

test('o Pix vence no fim do dia seguinte, no fuso de Paragominas', function () {
    // 26/09 às 22:30 em Paragominas = 27/09 01:30 UTC; o dia de lá ainda é 26
    assert.equal(mp._expiracaoDoPix(Date.UTC(2026, 8, 27, 1, 30)), '2026-09-27T23:59:59.000-03:00');
    assert.equal(mp._expiracaoDoPix(Date.UTC(2026, 8, 30, 12, 0)), '2026-10-01T23:59:59.000-03:00', 'virada de mês');
});

test('status do Mercado Pago viram os status da planilha', function () {
    assert.equal(mp._mapearStatus({ status: 'approved' }), 'PAGO');
    ['pending', 'in_process', 'authorized', 'in_mediation'].forEach(function (s) {
        assert.equal(mp._mapearStatus({ status: s }), 'PENDENTE', s);
    });
    assert.equal(mp._mapearStatus({ status: 'rejected' }), 'RECUSADO');
    assert.equal(mp._mapearStatus({ status: 'cancelled', status_detail: 'expired' }), 'EXPIRADO', 'Pix vencido');
    assert.equal(mp._mapearStatus({ status: 'cancelled', status_detail: 'by_collector' }), 'CANCELADO');
    assert.equal(mp._mapearStatus({ status: 'refunded' }), 'REEMBOLSADO');
    assert.equal(mp._mapearStatus({ status: 'charged_back' }), 'REEMBOLSADO');
});

test('status desconhecido não vira PAGO por engano', function () {
    [null, undefined, {}, { status: '' }, { status: 'novidade' }].forEach(function (p) {
        assert.equal(mp._mapearStatus(p), null, JSON.stringify(p));
    });
});

test('várias tentativas no cartão viram um status só', function () {
    const r = mp._resumirTentativas;
    assert.equal(r([]), null, 'ainda não pagou: não mexe no pedido');
    assert.equal(r([{ status: 'rejected' }, { status: 'approved' }]), 'PAGO', 'errou o cartão e acertou no outro');
    assert.equal(r([{ status: 'rejected' }, { status: 'in_process' }]), 'PENDENTE', 'recusa não encerra tentativa em andamento');
    assert.equal(r([{ status: 'rejected' }]), 'RECUSADO');
    assert.equal(r([{ status: 'refunded' }, { status: 'rejected' }]), 'REEMBOLSADO');
});

/* ---------- assinatura do webhook ---------- */
function assinar(dataId, requestId, ts, segredo) {
    const manifesto = 'id:' + String(dataId).toLowerCase() + ';request-id:' + requestId + ';ts:' + ts + ';';
    return 'ts=' + ts + ',v1=' + crypto.createHmac('sha256', segredo).update(manifesto).digest('hex');
}

function requisicao(cabecalhos, query, corpo) {
    return {
        get: function (nome) { return cabecalhos[nome.toLowerCase()]; },
        query: query || {},
        body: corpo || {}
    };
}

test('webhook só passa com a assinatura certa', function () {
    const ok = requisicao({ 'x-signature': assinar('123', 'req-1', '1700000000', 'segredo-do-webhook'), 'x-request-id': 'req-1' }, { 'data.id': '123' });
    assert.equal(mp.validarWebhook(ok), true);

    assert.equal(mp.validarWebhook(requisicao({}, { 'data.id': '123' })), false, 'sem cabeçalho');
    const segredoErrado = requisicao({ 'x-signature': assinar('123', 'req-1', '1700000000', 'outro'), 'x-request-id': 'req-1' }, { 'data.id': '123' });
    assert.equal(mp.validarWebhook(segredoErrado), false, 'assinado com outro segredo');
    const idTrocado = requisicao({ 'x-signature': assinar('123', 'req-1', '1700000000', 'segredo-do-webhook'), 'x-request-id': 'req-1' }, { 'data.id': '999' });
    assert.equal(mp.validarWebhook(idTrocado), false, 'assinatura de um pagamento usada para outro');
});

test('segredo vazio nunca autoriza', function () {
    const req = requisicao({ 'x-signature': assinar('1', 'r', '1', ''), 'x-request-id': 'r' }, { 'data.id': '1' });
    assert.equal(mp._assinaturaConfere(req, ''), false, 'senão um webhook forjado passaria');
});

/* ---------- o Mercado Pago de mentira ---------- */
const falso = { pagamentos: new Map(), preferencias: [], chamadas: [] };
let proximoId = 1000;

function erroHttp(status) {
    const e = new Error('HTTP ' + status);
    e.response = { status, data: { message: 'not found' } };
    return e;
}

const originais = { get: mp._cliente.get, post: mp._cliente.post };

async function postFalso(url, corpo, opcoes) {
    falso.chamadas.push({ url, corpo, opcoes });
    if (url === '/v1/payments') {
        const id = proximoId++;
        const pagamento = {
            id, status: 'pending', external_reference: corpo.external_reference,
            date_of_expiration: corpo.date_of_expiration,
            point_of_interaction: { transaction_data: { qr_code: '00020126PIX-FALSO-' + id, ticket_url: 'https://mp.test/pix/' + id } }
        };
        falso.pagamentos.set(String(id), pagamento);
        return { data: pagamento };
    }
    if (url === '/checkout/preferences') {
        falso.preferencias.push(corpo);
        return { data: { id: 'pref-' + falso.preferencias.length, init_point: 'https://mp.test/checkout', sandbox_init_point: 'https://sandbox.mp.test/checkout' } };
    }
    throw erroHttp(404);
}

async function getFalso(url, opcoes) {
    if (url === '/v1/payments/search') {
        const ref = opcoes.params.external_reference;
        return { data: { results: Array.from(falso.pagamentos.values()).filter(function (p) { return p.external_reference === ref; }) } };
    }
    const achado = url.match(/^\/v1\/payments\/(.+)$/);
    if (achado && falso.pagamentos.has(achado[1])) return { data: falso.pagamentos.get(achado[1]) };
    throw erroHttp(404);
}

/* ---------- fluxo inteiro pela API ---------- */
let servidor, base;
const produto = catalogo.buscarProduto('lote-1');
const janelaOriginal = produto.vendaDe;

before(async function () {
    mp._cliente.get = getFalso;
    mp._cliente.post = postFalso;
    produto.vendaDe = '2026-01-01';   // a janela abre dia 27; aqui ela já está aberta
    servidor = criarApp().listen(0);
    await new Promise(function (ok) { servidor.once('listening', ok); });
    base = 'http://127.0.0.1:' + servidor.address().port + '/api';
});

after(function () {
    mp._cliente.get = originais.get;
    mp._cliente.post = originais.post;
    produto.vendaDe = janelaOriginal;
    servidor.close();
});

const COMPRADORA = { nome: 'Maria da Silva Souza', email: 'maria@exemplo.com', cpf: '249.715.637-92', telefone: '(91) 98888-7777' };

function post(caminho, corpo, cabecalhos) {
    return fetch(base + caminho, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, cabecalhos),
        body: JSON.stringify(corpo || {})
    });
}

function avisar(pagamentoId, segredo) {
    const ts = String(Math.floor(Date.now() / 1000));
    return post('/webhook?data.id=' + pagamentoId + '&type=payment', { type: 'payment', action: 'payment.updated', data: { id: String(pagamentoId) } }, {
        'x-signature': assinar(pagamentoId, 'req-' + pagamentoId, ts, segredo || 'segredo-do-webhook'),
        'x-request-id': 'req-' + pagamentoId
    });
}

test('/saude mostra o Mercado Pago de pé, sem expor segredo', async function () {
    const saude = await (await fetch(base + '/saude')).json();
    assert.equal(saude.pagamento, 'mercadopago');
    assert.equal(saude.ok, true);
    assert.deepEqual(saude.mercadopago, { ambiente: 'teste', credencial: true, webhookAssinado: true, parcelasMax: 1 });
    assert.ok(!JSON.stringify(saude).includes('TEST-token'), 'o token nunca aparece');
});

test('Pix: checkout -> QR -> webhook assinado -> PAGO, sem duplicar', async function () {
    const r = await post('/checkout', Object.assign({ produto: 'lote-1', quantidade: 2, metodo: 'pix' }, COMPRADORA));
    const pedido = await r.json();
    assert.equal(r.status, 201, JSON.stringify(pedido));
    assert.equal(pedido.status, 'PENDENTE');
    assert.match(pedido.pix.copiaECola, /^00020126PIX-FALSO-/);
    assert.match(pedido.pix.qrCode, /^data:image\/png;base64,/);
    assert.ok(pedido.linkPagamento, 'ticket_url como plano B');

    const chamada = falso.chamadas.find(function (c) { return c.corpo.external_reference === pedido.pedidoId; });
    assert.equal(chamada.corpo.transaction_amount, 110, '2 x R$ 55,00 em reais');
    assert.equal(chamada.corpo.payment_method_id, 'pix');
    assert.equal(chamada.opcoes.headers['X-Idempotency-Key'], pedido.pedidoId, 'repetir não cria outro Pix');
    assert.deepEqual(chamada.corpo.payer.identification, { type: 'CPF', number: '24971563792' });
    assert.equal(chamada.corpo.payer.first_name, 'Maria');
    assert.equal(chamada.corpo.payer.last_name, 'da Silva Souza');

    const pagamento = Array.from(falso.pagamentos.values()).find(function (p) { return p.external_reference === pedido.pedidoId; });

    // forjado: assinado com outro segredo
    assert.equal((await avisar(pagamento.id, 'segredo-errado')).status, 401);

    // aviso legítimo, mas o pagamento ainda está pendente: nada muda
    assert.equal((await avisar(pagamento.id)).status, 200);
    assert.equal((await (await fetch(base + '/pedidos/' + pedido.pedidoId)).json()).status, 'PENDENTE');

    pagamento.status = 'approved';
    assert.equal((await avisar(pagamento.id)).status, 200);
    const pago = await (await fetch(base + '/pedidos/' + pedido.pedidoId)).json();
    assert.equal(pago.status, 'PAGO');
    assert.equal(pago.ingressos.length, 2);
    assert.equal(pago.transacaoId, String(pagamento.id));

    // o Mercado Pago reenvia: mesmos códigos
    assert.equal((await avisar(pagamento.id)).status, 200);
    const denovo = await (await fetch(base + '/pedidos/' + pedido.pedidoId)).json();
    assert.deepEqual(denovo.ingressos.map(function (i) { return i.codigo; }), pago.ingressos.map(function (i) { return i.codigo; }));
});

test('cartão: link do Checkout Pro; o pagamento que nasce depois acha o pedido', async function () {
    const r = await post('/checkout', Object.assign({ produto: 'lote-1', quantidade: 3, metodo: 'cartao' }, COMPRADORA));
    const pedido = await r.json();
    assert.equal(r.status, 201, JSON.stringify(pedido));
    assert.equal(pedido.pix, null);
    assert.equal(pedido.linkPagamento, 'https://sandbox.mp.test/checkout', 'credencial TEST- usa o link de sandbox');

    const pref = falso.preferencias[falso.preferencias.length - 1];
    assert.equal(pref.external_reference, pedido.pedidoId);
    assert.deepEqual(pref.items[0], { id: 'lote-1', title: pref.items[0].title, quantity: 3, unit_price: 55, currency_id: 'BRL' });
    assert.equal(pref.auto_return, 'approved', 'SITE_URL https: volta sozinho para a página de pagamento');
    assert.match(pref.back_urls.success, /\/pagamento\.html\?pedido=MP/);
    assert.equal(pref.payment_methods.installments, 1);
    assert.ok(pref.payment_methods.excluded_payment_types.some(function (t) { return t.id === 'ticket'; }), 'sem boleto');

    // antes de ela pagar, a consulta não quebra nem muda nada
    assert.equal((await (await fetch(base + '/pedidos/' + pedido.pedidoId)).json()).status, 'PENDENTE');

    // primeiro cartão recusado, segundo aprovado — dois pagamentos novos
    const recusado = { id: proximoId++, status: 'rejected', external_reference: pedido.pedidoId };
    falso.pagamentos.set(String(recusado.id), recusado);
    assert.equal((await avisar(recusado.id)).status, 200);
    assert.equal((await (await fetch(base + '/pedidos/' + pedido.pedidoId)).json()).status, 'RECUSADO');

    const aprovado = { id: proximoId++, status: 'approved', external_reference: pedido.pedidoId };
    falso.pagamentos.set(String(aprovado.id), aprovado);
    assert.equal((await avisar(aprovado.id)).status, 200);
    const pago = await (await fetch(base + '/pedidos/' + pedido.pedidoId)).json();
    assert.equal(pago.status, 'PAGO', 'a recusa anterior não segura o pedido');
    assert.equal(pago.ingressos.length, 3);
});

test('cartão: se o webhook se perder, a página de pagamento descobre sozinha', async function () {
    const pedido = await (await post('/checkout', Object.assign({ produto: 'lote-1', quantidade: 1, metodo: 'cartao' }, COMPRADORA))).json();
    const aprovado = { id: proximoId++, status: 'approved', external_reference: pedido.pedidoId };
    falso.pagamentos.set(String(aprovado.id), aprovado);
    const pago = await (await fetch(base + '/pedidos/' + pedido.pedidoId)).json();
    assert.equal(pago.status, 'PAGO');
    assert.equal(pago.ingressos.length, 1);
});

/* No Checkout Pro ela pode tentar outro cartão na mesma página depois de uma
   recusa. Se o webhook do cartão aprovado se perder, o pedido ficaria RECUSADO
   para sempre: a tela diria "não aprovado" para quem pagou, e ela compraria de novo. */
test('cartão: recusado e depois aprovado sem webhook, a página ainda descobre o PAGO', async function () {
    const pedido = await (await post('/checkout', Object.assign({ produto: 'lote-1', quantidade: 1, metodo: 'cartao' }, COMPRADORA))).json();
    const recusado = { id: proximoId++, status: 'rejected', external_reference: pedido.pedidoId };
    falso.pagamentos.set(String(recusado.id), recusado);
    assert.equal((await avisar(recusado.id)).status, 200);
    assert.equal((await (await fetch(base + '/pedidos/' + pedido.pedidoId)).json()).status, 'RECUSADO');

    const aprovado = { id: proximoId++, status: 'approved', external_reference: pedido.pedidoId };
    falso.pagamentos.set(String(aprovado.id), aprovado);
    const pago = await (await fetch(base + '/pedidos/' + pedido.pedidoId)).json();
    assert.equal(pago.status, 'PAGO');
    assert.equal(pago.ingressos.length, 1);
});

test('avisos que não são de pagamento, ou de pagamento inexistente, devolvem 200', async function () {
    // o botão "simular" do painel manda um ID que não existe
    const simulado = await avisar(123456);
    assert.equal(simulado.status, 200);
    assert.equal((await simulado.json()).ignorado, true);

    const ts = '1700000000';
    const outroTipo = await post('/webhook?data.id=55&type=merchant_order', { type: 'merchant_order', data: { id: '55' } }, {
        'x-signature': assinar('55', 'r', ts, 'segredo-do-webhook'), 'x-request-id': 'r'
    });
    assert.equal(outroTipo.status, 200);
});

test('Mercado Pago fora do ar no webhook: 500 para ele tentar de novo', async function () {
    const antes = mp._cliente.get;
    mp._cliente.get = async function () { throw Object.assign(new Error('timeout'), { response: { status: 503, data: {} } }); };
    try {
        assert.equal((await avisar(777)).status, 500);
    } finally {
        mp._cliente.get = antes;
    }
});
