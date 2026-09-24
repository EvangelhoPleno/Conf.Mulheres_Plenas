/* Parte 2: portas fechadas, CORS e a trava de producao. */
process.env.PAYMENT_PROVIDER = 'mercadopago';
process.env.GOOGLE_SHEET_ID = '';
process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = '';
process.env.GOOGLE_CREDENTIALS_FILE = 'nao-existe.json';
process.env.RESEND_API_KEY = '';
process.env.NODE_ENV = 'production';                 // como na Vercel
process.env.SITE_URL = 'https://conf-mulheres-plenas.vercel.app';
process.env.API_URL = 'https://conf-mulheres-plenas.vercel.app';
process.env.ADMIN_TOKEN = 'token-de-auditoria';

const http = require('http');
// a mesma porta de entrada que a Vercel usa
const handler = require('../../api/index.js');
const config = require('../src/config');

const BASE = 'http://localhost:3997';
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
    return {
        status: r.status,
        cors: r.headers.get('access-control-allow-origin'),
        corpo: tipo.includes('json') ? await r.json() : await r.text()
    };
}

const COMPRADORA = {
    produto: 'lote-1', quantidade: 1, metodo: 'pix',
    nome: 'Maria de Teste', email: 'maria@exemplo.com.br',
    cpf: '249.715.637-92', telefone: '(91) 98888-7777'
};

async function main() {
    console.log('\n=== A trava de producao: gateway de verdade sem planilha ===');
    ok(config.ambiente === 'production', 'rodando como producao, igual a Vercel');
    const semPlanilha = await chamar('/api/checkout', { method: 'POST', corpo: COMPRADORA });
    ok(semPlanilha.status === 503, 'checkout recusado com 503 em vez de perder o pedido', 'HTTP ' + semPlanilha.status);
    ok(String(semPlanilha.corpo.erro).length > 10, 'com mensagem para a compradora', semPlanilha.corpo.erro);
    const saude = await chamar('/api/saude');
    ok(saude.corpo.planilha === 'memoria', '/api/saude denuncia o problema: planilha = memoria', saude.corpo.planilha);
    ok(saude.corpo.ok === false, '/api/saude devolve ok:false', saude.corpo.ok);

    console.log('\n=== Portas que precisam estar fechadas ===');
    const simular = await chamar('/api/dev/simular-pagamento/MPaaaaaaaaaaaaaaaa', { method: 'POST' });
    ok(simular.status === 404, 'simulador de pagamento nao existe fora do modo mock', 'HTTP ' + simular.status);

    const admin = await chamar('/api/admin/pedidos/MPaaaaaaaaaaaaaaaa');
    ok(admin.status === 401, 'rota de admin sem token devolve 401', 'HTTP ' + admin.status);
    const adminErrado = await chamar('/api/admin/pedidos/MPaaaaaaaaaaaaaaaa', { headers: { authorization: 'Bearer errado' } });
    ok(adminErrado.status === 401, 'rota de admin com token errado devolve 401', 'HTTP ' + adminErrado.status);
    const adminCerto = await chamar('/api/admin/pedidos/MPaaaaaaaaaaaaaaaa', { headers: { authorization: 'Bearer token-de-auditoria' } });
    ok(adminCerto.status === 404, 'com o token certo, passa da porta (404 = pedido inexistente)', 'HTTP ' + adminCerto.status);

    const webhook = await chamar('/api/webhook?data.id=123', { method: 'POST', corpo: { type: 'payment', data: { id: '123' } } });
    ok(webhook.status === 401, 'webhook sem assinatura do Mercado Pago devolve 401', 'HTTP ' + webhook.status);

    const inventada = await chamar('/api/nao-existe');
    ok(inventada.status === 404, 'rota inventada devolve 404 em JSON', 'HTTP ' + inventada.status);

    console.log('\n=== CORS ===');
    ok(config.origensPermitidas.includes('https://conf-mulheres-plenas.vercel.app'), 'a origem do site esta liberada', config.origensPermitidas.join(' | '));
    const doSite = await chamar('/api/saude', { headers: { Origin: 'https://conf-mulheres-plenas.vercel.app' } });
    ok(doSite.cors === 'https://conf-mulheres-plenas.vercel.app', 'pedido vindo do site e aceito', doSite.cors);
    const deOutroLugar = await chamar('/api/saude', { headers: { Origin: 'https://site-de-outra-pessoa.com' } });
    ok(!deOutroLugar.cors, 'pedido de outro site nao ganha permissao', String(deOutroLugar.cors));
    const paginasGithub = config.origensPermitidas.includes('https://evangelhopleno.github.io');
    console.log('  nota  GitHub Pages ' + (paginasGithub ? 'esta' : 'NAO esta') + ' na lista de origens');

    console.log('\n=== JSON quebrado nao derruba a funcao ===');
    const quebrado = await fetch(BASE + '/api/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{isso nao e json'
    });
    ok(quebrado.status === 400, 'corpo invalido devolve 400', 'HTTP ' + quebrado.status);
}

const servidor = http.createServer(handler).listen(3997, async function () {
    try { await main(); } catch (e) { console.error('\nINTERROMPIDO:', e.message); falhas++; }
    console.log('\n' + (falhas ? falhas + ' FALHA(S)' : 'tudo passou'));
    servidor.close();
    process.exit(falhas ? 1 : 0);
});
