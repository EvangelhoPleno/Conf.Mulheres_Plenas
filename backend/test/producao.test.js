/* Produção sem PAYMENT_PROVIDER cai no mock (o padrão). Se isso acontecer na
   Vercel, o pagamento simulado não pode vender nem emitir ingresso: qualquer
   pessoa chamaria /api/dev/simular-pagamento e sairia com um ingresso PAGO. */
process.env.NODE_ENV = 'production';
process.env.PAYMENT_PROVIDER = '';   // vazio: o dotenv não preenche com o do .env
process.env.GOOGLE_SHEET_ID = '';
process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = '';
process.env.GOOGLE_CREDENTIALS_FILE = 'nao-existe.json';
process.env.RESEND_API_KEY = '';
process.env.SITE_URL = 'https://evangelhoplenoparagominas.com.br';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { criarApp } = require('../src/app');
const { pedidos } = require('../src/services/sheetsService');

let servidor, base;

before(async function () {
    servidor = criarApp().listen(0);
    await new Promise(function (ok) { servidor.once('listening', ok); });
    base = 'http://127.0.0.1:' + servidor.address().port + '/api';
});

after(function () { servidor.close(); });

test('mock em produção não vende', async function () {
    const r = await fetch(base + '/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produto: 'lote-1', metodo: 'pix', nome: 'Maria de Souza', email: 'maria@exemplo.com', cpf: '529.982.247-25' })
    });
    assert.equal(r.status, 503);
});

test('simulador de pagamento não existe em produção', async function () {
    // um pedido que existe de verdade: o 404 tem que vir da porta, não da busca
    await pedidos().criar({ pedidoId: 'MPaaaaaaaaaaaaaaaa', transacaoId: 'mock_x', status: 'PENDENTE', codigos: [], emailEnviado: 'NAO' });
    const r = await fetch(base + '/dev/simular-pagamento/MPaaaaaaaaaaaaaaaa', { method: 'POST' });
    assert.equal(r.status, 404);
    assert.equal((await pedidos().buscarPorId('MPaaaaaaaaaaaaaaaa')).status, 'PENDENTE');
});

test('/saude denuncia produção sem gateway, planilha e e-mail', async function () {
    const saude = await (await fetch(base + '/saude')).json();
    assert.equal(saude.simulado, true);
    assert.equal(saude.ok, false);
});
