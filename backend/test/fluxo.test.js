/* Fluxo completo no modo simulado: checkout -> pagamento -> confirmação.
   Rode com: npm test */
process.env.NODE_ENV = 'test';
process.env.PAYMENT_PROVIDER = 'mock';
process.env.GOOGLE_SHEET_ID = '';
process.env.RESEND_API_KEY = '';
process.env.ADMIN_TOKEN = 'segredo-de-teste';
process.env.SITE_URL = 'https://evangelhopleno.github.io/Conf.Mulheres_Plenas';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { criarApp } = require('../src/app');
const { cpfValido } = require('../src/utils/validacao');
const { buscarProduto, situacaoDoLote } = require('../src/catalogo');

let servidor;
let base;

before(async function () {
    servidor = criarApp().listen(0);
    await new Promise(function (ok) { servidor.once('listening', ok); });
    base = 'http://127.0.0.1:' + servidor.address().port + '/api';
});

after(function () { servidor.close(); });

function post(caminho, corpo, cabecalhos) {
    return fetch(base + caminho, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, cabecalhos),
        body: JSON.stringify(corpo || {})
    });
}

const COMPRADORA = { nome: 'Maria de Souza', email: 'maria@exemplo.com', cpf: '529.982.247-25', telefone: '(91) 99999-0000' };

test('valida CPF', function () {
    assert.equal(cpfValido('529.982.247-25'), true);
    assert.equal(cpfValido('529.982.247-24'), false);
    assert.equal(cpfValido('000.000.000-00'), false);
});

test('lista produtos com preço vindo do servidor', async function () {
    const r = await fetch(base + '/produtos');
    const dados = await r.json();
    assert.equal(r.status, 200);
    assert.equal(dados.produtos.length, 2, 'dois lotes, um tipo de ingresso');
    const primeiro = dados.produtos.find(function (p) { return p.id === 'lote-1'; });
    const segundo = dados.produtos.find(function (p) { return p.id === 'lote-2'; });
    assert.equal(primeiro.precoUnitario, 5500, '1o lote: R$ 55,00');
    assert.equal(segundo.precoUnitario, 6500, '2o lote: R$ 65,00');
    assert.equal(dados.simulado, true);
});

test('janela de venda de cada lote', function () {
    const um = buscarProduto('lote-1');
    const dois = buscarProduto('lote-2');

    // as datas precisam ser as mesmas dos data-inicio/data-fim do index.html
    assert.equal(um.vendaDe, '2026-09-24');
    assert.equal(um.vendaAte, '2026-10-06');
    assert.equal(dois.vendaDe, '2026-10-07');
    assert.equal(dois.vendaAte, '2026-10-15');

    /* Os instantes vao em UTC de proposito. new Date(2026, 8, 27) usaria o
       fuso de quem roda o teste, e ai o teste passaria na maquina do
       desenvolvedor (UTC-3, igual a Paragominas) e mentiria sobre a Vercel,
       que roda em UTC. Cada linha traz o horario de Paragominas ao lado. */
    const emBelem = function (utc) { return new Date(utc); };

    assert.equal(situacaoDoLote(um, emBelem('2026-09-24T02:59:00Z')), 'espera', '23/09 23:59 em Paragominas: vespera');
    assert.equal(situacaoDoLote(um, emBelem('2026-09-24T03:00:00Z')), 'aberto', '24/09 00:00 em Paragominas: abre');
    assert.equal(situacaoDoLote(um, emBelem('2026-10-07T02:59:00Z')), 'aberto', '06/10 23:59 em Paragominas: ultimo dia vende');
    assert.equal(situacaoDoLote(um, emBelem('2026-10-07T03:00:00Z')), 'encerrado', '07/10 00:00 em Paragominas: fechou');

    /* As bordas que o fuso do servidor estragava: as 21:00 de Paragominas o
       relogio em UTC ja virou o dia. Se a venda abrir ou fechar aqui, o
       servidor esta decidindo pelo fuso dele. */
    assert.equal(situacaoDoLote(um, emBelem('2026-09-24T00:00:00Z')), 'espera', '23/09 21:00 em Paragominas: ainda nao abriu');
    assert.equal(situacaoDoLote(um, emBelem('2026-10-07T00:00:00Z')), 'aberto', '06/10 21:00 em Paragominas: ainda vende');
    assert.equal(situacaoDoLote(dois, emBelem('2026-10-07T00:00:00Z')), 'espera', '06/10 21:00 em Paragominas: o 2o ainda nao abriu');
    assert.equal(situacaoDoLote(dois, emBelem('2026-10-16T02:59:00Z')), 'aberto', '15/10 23:59 em Paragominas: ultimo dia vende');

    // os dois lotes se encaixam sem buraco nem sobreposicao
    assert.equal(situacaoDoLote(dois, emBelem('2026-10-07T03:00:00Z')), 'aberto', 'o 2o abre quando o 1o fecha');
    assert.equal(situacaoDoLote(dois, emBelem('2026-10-16T03:00:00Z')), 'encerrado', 'fechado no dia do evento');
});

test('checkout recusa dados inválidos campo a campo', async function () {
    const r = await post('/checkout', { produto: 'lote-1', nome: 'Maria', email: 'x', cpf: '123' });
    const dados = await r.json();
    assert.equal(r.status, 422);
    assert.ok(dados.erros.nome && dados.erros.email && dados.erros.cpf);
});

test('checkout recusa produto e quantidade inválidos', async function () {
    assert.equal((await post('/checkout', Object.assign({ produto: 'vip-gratis' }, COMPRADORA))).status, 400);
    assert.equal((await post('/checkout', Object.assign({ produto: 'lote-1', quantidade: 6 }, COMPRADORA))).status, 400, 'acima do maximo de 5');
    assert.equal((await post('/checkout', Object.assign({ produto: 'lote-1', quantidade: 2.5 }, COMPRADORA))).status, 400, 'quantidade quebrada');
    // 0 e ausente sao a mesma coisa: caem no minimo do lote (ver pedidoService)
    assert.equal((await post('/checkout', Object.assign({ produto: 'lote-1', quantidade: 0 }, COMPRADORA))).status, 201, '0 = nao informado, vira 1');
});

test('fluxo Pix: pendente -> pago -> ingressos, sem duplicar', async function () {
    const r = await post('/checkout', Object.assign({ produto: 'lote-1', quantidade: 3, metodo: 'pix', valorTotal: 1 }, COMPRADORA));
    const checkout = await r.json();
    assert.equal(r.status, 201);
    assert.equal(checkout.status, 'PENDENTE');
    assert.equal(checkout.valorTotal, 16500, 'ignora valor mandado pelo navegador: 3 x R$ 55,00');
    assert.ok(checkout.pix.copiaECola);
    assert.match(checkout.pix.qrCode, /^data:image\/png;base64,/);
    assert.equal(checkout.email, 'ma***@exemplo.com');
    assert.equal(checkout.cpf, undefined, 'CPF nunca volta para o navegador');
    assert.match(checkout.proximaEtapa, /\/pagamento\.html\?pedido=MP/);

    const pendente = await (await fetch(base + '/pedidos/' + checkout.pedidoId)).json();
    assert.equal(pendente.status, 'PENDENTE');
    assert.deepEqual(pendente.ingressos, []);

    const simulado = await (await post('/dev/simular-pagamento/' + checkout.pedidoId)).json();
    assert.equal(simulado.status, 'PAGO');
    assert.equal(simulado.ingressos.length, 3);

    // webhook repetido não gera códigos novos
    const w = await post('/webhook', { transacaoId: simulado.transacaoId });
    assert.equal(w.status, 200);

    const pago = await (await fetch(base + '/pedidos/' + checkout.pedidoId)).json();
    assert.equal(pago.status, 'PAGO');
    assert.equal(pago.pix, null);
    assert.deepEqual(pago.ingressos.map(function (i) { return i.codigo; }), simulado.ingressos.map(function (i) { return i.codigo; }));
    assert.match(pago.ingressos[0].codigo, /^MP26-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    // nenhuma tela usa mais, mas os e-mails antigos ainda carregam a imagem
    const qr = await fetch(base + '/ingressos/' + pago.ingressos[0].codigo + '/qr.png');
    assert.equal(qr.status, 200);
    assert.equal(qr.headers.get('content-type'), 'image/png');
});

test('fluxo cartão devolve link de pagamento', async function () {
    const checkout = await (await post('/checkout', Object.assign({ produto: 'lote-2', quantidade: 5, metodo: 'cartao' }, COMPRADORA))).json();
    assert.equal(checkout.quantidade, 5);
    assert.equal(checkout.valorTotal, 32500, '5 x R$ 65,00');
    assert.ok(checkout.linkPagamento);
    assert.equal(checkout.pix, null);
});

test('pedido inexistente e rotas admin protegidas', async function () {
    assert.equal((await fetch(base + '/pedidos/MPaaaaaaaaaaaaaaaa')).status, 404);
    assert.equal((await fetch(base + '/pedidos/qualquer-coisa')).status, 404);
    assert.equal((await fetch(base + '/admin/pedidos/MPaaaaaaaaaaaaaaaa')).status, 401);
    const r = await fetch(base + '/admin/pedidos/MPaaaaaaaaaaaaaaaa', { headers: { Authorization: 'Bearer segredo-de-teste' } });
    assert.equal(r.status, 404);
});

test('CORS libera o site e bloqueia outras origens', async function () {
    const site = await fetch(base + '/saude', { headers: { Origin: 'https://evangelhopleno.github.io' } });
    assert.equal(site.headers.get('access-control-allow-origin'), 'https://evangelhopleno.github.io');
    const outro = await fetch(base + '/saude', { headers: { Origin: 'https://golpe.example' } });
    assert.equal(outro.headers.get('access-control-allow-origin'), null);
});

/* ---------- códigos derivados do Pedido_ID (corrida entre instâncias) ---------- */
const { codigosDoPedido, PADRAO_INGRESSO, novoPedidoId } = require('../src/utils/codigos');

test('duas instancias emitindo o mesmo pedido chegam aos MESMOS codigos', function () {
    const pedidoId = novoPedidoId();

    // o webhook e a consulta da pagina de pagamento, cada um na sua instancia
    const doWebhook = codigosDoPedido(pedidoId, 3);
    const daConsulta = codigosDoPedido(pedidoId, 3);

    assert.deepEqual(doWebhook, daConsulta,
        'se divergirem, o e-mail sai com um par e a planilha fica com outro');
});

test('codigos de pedidos diferentes nao colidem e respeitam o formato', function () {
    assert.equal(codigosDoPedido(novoPedidoId(), 0).length, 0);

    const todos = [];
    for (let i = 0; i < 300; i++) todos.push.apply(todos, codigosDoPedido(novoPedidoId(), 5));

    todos.forEach(function (codigo) {
        assert.match(codigo, PADRAO_INGRESSO, codigo + ' fora do formato da portaria');
    });
    assert.equal(new Set(todos).size, todos.length, '1500 codigos, nenhum repetido');

    // dentro do mesmo pedido os ingressos tambem sao distintos entre si
    const doMesmoPedido = codigosDoPedido(novoPedidoId(), 5);
    assert.equal(new Set(doMesmoPedido).size, 5);
});

test('/saude no modo simulado nao traz o bloco do Mercado Pago', async function () {
    const saude = await (await fetch(base + '/saude')).json();
    assert.equal(saude.pagamento, 'mock');
    assert.equal(saude.simulado, true);
    assert.equal(saude.mercadopago, undefined);
    assert.equal(saude.ok, true);
});

test('quem chuta IDs de pedido é barrado depois de 30 "não encontrado"', async function () {
    // os testes anteriores já gastaram alguns 404 deste IP: conta até o 429
    let status = 0;
    let tentativas = 0;
    while (tentativas < 40) {
        tentativas++;
        status = (await fetch(base + '/pedidos/MPchute' + String(tentativas).padStart(11, 'x'))).status;
        if (status !== 404) break;
    }
    assert.equal(status, 429);
    assert.ok(tentativas <= 31, 'barrado até o 31º chute, foi no ' + tentativas + 'º');
});
