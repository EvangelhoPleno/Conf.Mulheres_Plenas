/* Portaria (portaria.html): senha, lista dos pagos, confirmar, "já entrou",
   desfazer e ingresso pago depois da última rodada do npm run portaria.
   A planilha é trocada por uma lista em memória. */
process.env.NODE_ENV = 'test';
process.env.PAYMENT_PROVIDER = 'mock';
process.env.GOOGLE_SHEET_ID = '';
process.env.RESEND_API_KEY = '';
process.env.PORTARIA_SENHA = 'senha-da-porta';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { criarApp } = require('../src/app');
const config = require('../src/config');
const { usarArmazem, criarArmazemMemoria, pagosDosPedidos, carimbo } = require('../src/services/portariaService');

let servidor, base, armazem;
const SENHA = { Authorization: 'Bearer senha-da-porta' };
const ANA = 'MP26-AAAA-AAAA';
const BIA = 'MP26-BBBB-BBBB';

before(async function () {
    servidor = criarApp().listen(0);
    await new Promise(function (ok) { servidor.once('listening', ok); });
    base = 'http://127.0.0.1:' + servidor.address().port + '/api';
});

after(function () { servidor.close(); });

beforeEach(function () {
    armazem = criarArmazemMemoria([
        { codigo: BIA, nome: 'Beatriz Souza', cpf: '52998224725', pedido: 'MPb' },
        { codigo: ANA, nome: 'Ana Lima', cpf: '11144477735', pedido: 'MPa' }
    ]);
    // Ana já estava na aba Portaria (npm run portaria); Beatriz pagou depois
    armazem.portaria.push(['Ana Lima', ANA, '11144477735', '', 'FALSE', '', 'MPa']);
    usarArmazem(armazem, { agora: function () { return new Date('2026-10-16T21:42:00Z'); } });
});

function chamar(caminho, corpo, cabecalhos) {
    return fetch(base + caminho, {
        method: corpo ? 'POST' : 'GET',
        headers: Object.assign({ 'Content-Type': 'application/json' }, cabecalhos === undefined ? SENHA : cabecalhos),
        body: corpo ? JSON.stringify(corpo) : undefined
    });
}

test('sem senha ou com senha errada: 401; sem PORTARIA_SENHA no servidor: 503', async function () {
    assert.equal((await chamar('/portaria/lista', null, {})).status, 401);
    assert.equal((await chamar('/portaria/lista', null, { Authorization: 'Bearer chute' })).status, 401);
    const antes = config.portariaSenha;
    config.portariaSenha = '';
    try {
        assert.equal((await chamar('/portaria/lista')).status, 503);
    } finally {
        config.portariaSenha = antes;
    }
});

test('lista os pagos em ordem alfabética, sem cache no navegador', async function () {
    const r = await chamar('/portaria/lista');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    const dados = await r.json();
    assert.deepEqual(dados.ingressos.map(function (i) { return i.nome; }), ['Ana Lima', 'Beatriz Souza']);
    assert.equal(dados.total, 2);
    assert.equal(dados.presentes, 0);
});

test('confirmar grava hora e quem; a segunda vez responde 409 "já entrou"', async function () {
    let r = await chamar('/portaria/entrada', { codigo: ANA.toLowerCase(), por: 'Carla' });
    assert.equal(r.status, 200);
    const ok = await r.json();
    assert.equal(ok.situacao, 'confirmado');
    assert.equal(ok.entrada, '16/10 18:42:00 · Carla');
    assert.equal(armazem.portaria[0][4], true);

    r = await chamar('/portaria/entrada', { codigo: ANA, por: 'Dani' });
    assert.equal(r.status, 409);
    assert.equal((await r.json()).entrada, '16/10 18:42:00 · Carla');

    const lista = await (await chamar('/portaria/lista')).json();
    assert.equal(lista.presentes, 1);
});

test('pago depois da lista: confirmar acrescenta a linha na aba Portaria', async function () {
    const r = await chamar('/portaria/entrada', { codigo: BIA, por: 'Carla' });
    assert.equal(r.status, 200);
    assert.equal(armazem.portaria.length, 2);
    assert.equal(armazem.portaria[1][1], BIA);
    assert.equal(armazem.portaria[1][4], true);
});

test('pedido recém-pago entra na aba sozinho, uma vez só, com nome em maiúsculas e CPF e telefone formatados', async function () {
    const { portaria } = require('../src/services/portariaService');
    const pedido = { pedidoId: 'MPc', nome: 'Carol  Conceição', cpf: '39053344705', telefone: '5591981877494', codigos: ['MP26-CCCC-CCCC', 'MP26-DDDD-DDDD'] };
    assert.equal(await portaria().incluir(pedido), 2);
    assert.deepEqual(armazem.portaria[1], ['CAROL CONCEIÇÃO', 'MP26-CCCC-CCCC', '390.533.447-05', '(91) 98187-7494', false, '', 'MPc']);
    // o webhook e a página de pagamento chamam os dois: a segunda não duplica
    assert.equal(await portaria().incluir(pedido), 0);
    assert.equal(armazem.portaria.length, 3);
});

test('desfazer libera o ingresso de novo', async function () {
    await chamar('/portaria/entrada', { codigo: ANA, por: 'Carla' });
    const r = await chamar('/portaria/desfazer', { codigo: ANA });
    assert.equal(r.status, 200);
    assert.equal(armazem.portaria[0][4], false);
    assert.equal((await chamar('/portaria/entrada', { codigo: ANA, por: 'Carla' })).status, 200);
});

test('código fora do padrão: 422; que não está entre os pagos: 404', async function () {
    assert.equal((await chamar('/portaria/entrada', { codigo: 'qualquer' })).status, 422);
    assert.equal((await chamar('/portaria/entrada', { codigo: 'MP26-ZZZZ-ZZZZ' })).status, 404);
});

test('só PAGO entra na lista, um item por código', function () {
    const pagos = pagosDosPedidos([
        ['Status', 'Nome_Cliente', 'CPF', 'Codigos_Ingresso', 'Pedido_ID'],
        ['PAGO', 'Ana  Lima', '111.444.777-35', 'MP26-AAAA-AAAA MP26-CCCC-CCCC', 'MPa'],
        ['PENDENTE', 'Bia', '', '', 'MPb'],
        ['REEMBOLSADO', 'Cris', '', 'MP26-DDDD-DDDD', 'MPc']
    ]);
    assert.deepEqual(pagos.map(function (p) { return p.codigo; }), ['MP26-AAAA-AAAA', 'MP26-CCCC-CCCC']);
    assert.equal(pagos[0].nome, 'Ana Lima');
    assert.equal(pagos[0].cpf, '11144477735');
});

test('carimbo no horário de Paragominas', function () {
    assert.equal(carimbo(new Date('2026-10-17T00:30:05Z'), 'Ana'), '16/10 21:30:05 · Ana');
});
