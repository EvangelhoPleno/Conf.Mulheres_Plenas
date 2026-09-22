/* Auditoria ponta a ponta: o que o site pede, o que a API responde.
   Roda contra o sandbox do Asaas, com os pedidos em memoria (nao toca
   na planilha de verdade) e o e-mail so no console. */
process.env.PAYMENT_PROVIDER = 'asaas';
process.env.GOOGLE_SHEET_ID = '';
process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = '';
process.env.GOOGLE_CREDENTIALS_FILE = 'nao-existe.json';
process.env.RESEND_API_KEY = '';
process.env.API_URL = 'http://localhost:3998';
process.env.ASAAS_WEBHOOK_TOKEN = 'token-de-auditoria';

const axios = require('axios');
const http = require('http');
// a mesma porta de entrada que a Vercel usa
const handler = require('../../api/index.js');
const catalogo = require('../src/catalogo');
const config = require('../src/config');

// A janela do 1o lote so abre dia 27. Abro aqui dentro do processo, sem
// tocar em arquivo nenhum, para poder ver o que a compradora vera no dia.
const produto = catalogo.buscarProduto('lote-1');
const janelaOriginal = produto.vendaDe;

const asaas = axios.create({
    baseURL: config.asaas.apiUrl,
    headers: { access_token: config.asaas.apiKey },
    timeout: 20000
});

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
        headers: opcoes.headers || (opcoes.corpo ? { 'Content-Type': 'application/json' } : undefined),
        body: opcoes.corpo ? JSON.stringify(opcoes.corpo) : undefined
    });
    const tipo = r.headers.get('content-type') || '';
    const corpo = tipo.includes('json') ? await r.json() : await r.arrayBuffer();
    return { status: r.status, tipo, corpo };
}

const COMPRADORA = {
    produto: 'lote-1', quantidade: 2, metodo: 'pix',
    nome: 'Maria de Teste', email: 'maria@exemplo.com.br',
    cpf: '249.715.637-92', telefone: '(91) 98888-7777'
};

async function main() {
    console.log('\n=== 1. A janela de venda fechada devolve 409 ===');
    const fechado = await chamar('/api/checkout', { method: 'POST', corpo: COMPRADORA });
    ok(fechado.status === 409, 'checkout antes do dia 27 e recusado', 'HTTP ' + fechado.status);
    ok(typeof fechado.corpo.erro === 'string' && fechado.corpo.erro.length > 10, 'com mensagem que da para mostrar na tela', fechado.corpo.erro);

    // a partir daqui, finjo que ja e dia 27
    produto.vendaDe = '2026-09-01';

    console.log('\n=== 2. /api/saude e /api/produtos ===');
    const saude = await chamar('/api/saude');
    ok(saude.status === 200, 'GET /api/saude responde 200');
    ok(saude.corpo.pagamento === 'asaas', 'provedor e o asaas', saude.corpo.pagamento);
    ok(saude.corpo.simulado === false, 'simulado = false (o site nao mostra aviso de teste)');
    ok(Array.isArray(saude.corpo.metodos) && saude.corpo.metodos.includes('pix'), 'metodos trazem pix');

    const produtos = await chamar('/api/produtos');
    ok(produtos.status === 200, 'GET /api/produtos responde 200');
    const lote1 = (produtos.corpo.produtos || []).find(function (p) { return p.id === 'lote-1'; });
    ok(Boolean(lote1), 'lote-1 existe no catalogo');
    ok(lote1 && lote1.precoUnitario === 5500, 'preco do 1o lote = R$ 55,00, igual ao index.html', lote1 && lote1.precoUnitario);
    ['tipo', 'lote', 'precoUnitario', 'quantidadeMin', 'quantidadeMax'].forEach(function (campo) {
        ok(lote1 && lote1[campo] !== undefined, 'campo que o checkout.html le: ' + campo);
    });
    ok(produtos.corpo.vagas === undefined, 'sem campo "vagas": o contador da landing fica escondido');

    console.log('\n=== 3. Compra no Pix ===');
    const compra = await chamar('/api/checkout', { method: 'POST', corpo: COMPRADORA });
    ok(compra.status === 201, 'POST /api/checkout responde 201', 'HTTP ' + compra.status + ' ' + JSON.stringify(compra.corpo).slice(0, 200));
    if (compra.status !== 201) throw new Error('sem pedido, nao da para seguir');
    const pedido = compra.corpo;
    ok(/^MP[A-Za-z0-9_-]{16}$/.test(pedido.pedidoId), 'pedidoId no formato que o pedido.js aceita', pedido.pedidoId);
    ok(pedido.status === 'PENDENTE', 'status inicial PENDENTE', pedido.status);
    ok(pedido.valorTotal === 11000, 'valor de 2 ingressos = R$ 110,00', pedido.valorTotal);
    ok(Boolean(pedido.pix && pedido.pix.copiaECola), 'pix.copiaECola presente');
    ok(Boolean(pedido.pix && String(pedido.pix.qrCode || '').startsWith('data:image/png')), 'pix.qrCode e uma imagem pronta para o <img>');
    ok(Boolean(pedido.linkPagamento), 'linkPagamento, o plano B se o QR falhar');
    ok(!String(pedido.email).includes('maria@exemplo'), 'e-mail mascarado na resposta', pedido.email);
    ok(pedido.nome === 'Maria', 'so o primeiro nome vai para o navegador', pedido.nome);
    ok(pedido.transacaoId === undefined, 'id da transacao escondido enquanto nao esta pago');
    ok(String(pedido.proximaEtapa).includes('/pagamento.html?pedido='), 'proximaEtapa aponta para a pagina de pagamento', pedido.proximaEtapa);

    console.log('\n=== 4. A pagina de pagamento consultando o pedido ===');
    const consulta = await chamar('/api/pedidos/' + pedido.pedidoId);
    ok(consulta.status === 200, 'GET /api/pedidos/:id responde 200');
    ok(consulta.corpo.status === 'PENDENTE', 'ainda PENDENTE');
    ok(Boolean(consulta.corpo.pix && consulta.corpo.pix.qrCode), 'o QR volta a cada consulta');
    const inexistente = await chamar('/api/pedidos/MPzzzzzzzzzzzzzzzz');
    ok(inexistente.status === 404, 'pedido inexistente devolve 404', 'HTTP ' + inexistente.status);

    console.log('\n=== 5. Webhook ===');
    const semToken = await chamar('/api/webhook', { method: 'POST', corpo: { payment: { id: 'pay_qualquer' } } });
    ok(semToken.status === 401, 'webhook sem token e recusado com 401', 'HTTP ' + semToken.status);

    const tokenErrado = await chamar('/api/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'asaas-access-token': 'token-errado' },
        corpo: { payment: { id: 'pay_qualquer' } }
    });
    ok(tokenErrado.status === 401, 'webhook com token errado tambem e recusado', 'HTTP ' + tokenErrado.status);

    const cabecalhos = { 'Content-Type': 'application/json', 'asaas-access-token': 'token-de-auditoria' };
    const desconhecido = await chamar('/api/webhook', { method: 'POST', headers: cabecalhos, corpo: { evento: 'sem payment' } });
    ok(desconhecido.status === 200, 'corpo estranho devolve 200, senao o Asaas suspende a fila', 'HTTP ' + desconhecido.status);

    const busca = await asaas.get('/payments', { params: { externalReference: pedido.pedidoId, limit: 1 } });
    ok(busca.data.data.length === 1, 'a cobranca no Asaas carrega o Pedido_ID em externalReference');
    const cobrancaId = busca.data.data[0].id;

    console.log('  (marcando a cobranca como paga no sandbox)');
    await asaas.post('/payments/' + cobrancaId + '/receiveInCash', { paymentDate: '2026-09-22', value: 110, notifyCustomer: false });

    const notificacao = await chamar('/api/webhook', { method: 'POST', headers: cabecalhos, corpo: { event: 'PAYMENT_RECEIVED', payment: { id: cobrancaId } } });
    ok(notificacao.status === 200, 'webhook legitimo devolve 200', 'HTTP ' + notificacao.status);

    console.log('\n=== 6. Depois do pagamento ===');
    const pago = await chamar('/api/pedidos/' + pedido.pedidoId);
    ok(pago.corpo.status === 'PAGO', 'pedido virou PAGO', pago.corpo.status);
    ok(Array.isArray(pago.corpo.ingressos) && pago.corpo.ingressos.length === 2, '2 ingressos gerados', pago.corpo.ingressos && pago.corpo.ingressos.length);
    ok(Boolean(pago.corpo.transacaoId), 'agora o id da transacao aparece', pago.corpo.transacaoId);
    const ingresso = (pago.corpo.ingressos || [])[0] || {};
    ok(/^MP26-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(ingresso.codigo || ''), 'codigo do ingresso no formato MP26-XXXX-XXXX', ingresso.codigo);
    ok(String(ingresso.qr).startsWith('http://localhost:3998/api/ingressos/'), 'link do QR montado com o API_URL', ingresso.qr);

    const png = await chamar('/api/ingressos/' + ingresso.codigo + '/qr.png');
    ok(png.status === 200 && png.tipo.includes('png'), 'a imagem do QR do ingresso abre', 'HTTP ' + png.status + ' ' + png.tipo);

    console.log('\n=== 7. Webhook repetido: o Asaas reenvia ===');
    const denovo = await chamar('/api/webhook', { method: 'POST', headers: cabecalhos, corpo: { event: 'PAYMENT_RECEIVED', payment: { id: cobrancaId } } });
    ok(denovo.status === 200, 'segunda notificacao devolve 200');
    const depois = await chamar('/api/pedidos/' + pedido.pedidoId);
    ok(depois.corpo.ingressos.length === 2, 'nao duplicou ingressos', depois.corpo.ingressos.length);
    ok(depois.corpo.ingressos[0].codigo === ingresso.codigo, 'os codigos continuam os mesmos');

    console.log('\n=== 8. Validacao do formulario no servidor ===');
    const cpfRuim = await chamar('/api/checkout', { method: 'POST', corpo: Object.assign({}, COMPRADORA, { cpf: '111.111.111-11' }) });
    ok(cpfRuim.status === 422, 'CPF invalido recusado com 422', 'HTTP ' + cpfRuim.status);
    ok(Boolean(cpfRuim.corpo.erros && cpfRuim.corpo.erros.cpf), 'devolve erros.cpf, que o pedido.js mostra no campo');
    const qtdRuim = await chamar('/api/checkout', { method: 'POST', corpo: Object.assign({}, COMPRADORA, { quantidade: 99 }) });
    ok(qtdRuim.status === 400, 'quantidade fora do limite recusada', 'HTTP ' + qtdRuim.status);
    const semNada = await chamar('/api/checkout', { method: 'POST', corpo: {} });
    ok(semNada.status >= 400 && semNada.status < 500, 'corpo vazio nao derruba o servidor', 'HTTP ' + semNada.status);

    console.log('\n=== limpando o sandbox ===');
    await asaas.delete('/payments/' + cobrancaId).then(
        function () { console.log('  cobranca ' + cobrancaId + ' apagada'); },
        function (e) { console.log('  nao apagou: ' + e.message); });
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
