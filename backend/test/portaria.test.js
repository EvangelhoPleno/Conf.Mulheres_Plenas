/* Portaria (portaria.html): entrada por e-mail + código, lista dos pagos, confirmar, "já entrou",
   desfazer e ingresso pago depois da última rodada do npm run portaria.
   A planilha é trocada por uma lista em memória. */
process.env.NODE_ENV = 'test';
process.env.PAYMENT_PROVIDER = 'mock';
process.env.GOOGLE_SHEET_ID = '';
process.env.RESEND_API_KEY = '';
process.env.PORTARIA_EMAILS = 'Porta@Exemplo.com, outra@exemplo.com';
process.env.PORTARIA_SEGREDO = 'segredo-de-teste-com-mais-de-32-caracteres';
process.env.TURNSTILE_SECRET_KEY = '';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { criarApp } = require('../src/app');
const config = require('../src/config');
const { usarArmazem, criarArmazemMemoria, pagosDosPedidos, carimbo } = require('../src/services/portariaService');
const acesso = require('../src/services/portariaAcesso');

let servidor, base, armazem;
const SENHA = { Authorization: 'Bearer ' + acesso.criarSessao('porta@exemplo.com').sessao };
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

test('sem sessão, com sessão inventada ou vencida: 401; portaria desligada: 503', async function () {
    assert.equal((await chamar('/portaria/lista', null, {})).status, 401);
    assert.equal((await chamar('/portaria/lista', null, { Authorization: 'Bearer chute' })).status, 401);
    const vencida = acesso.criarSessao('porta@exemplo.com', Date.now() - 49 * 60 * 60 * 1000).sessao;
    assert.equal((await chamar('/portaria/lista', null, { Authorization: 'Bearer ' + vencida })).status, 401);
    // assinatura de outro segredo, ou o e-mail trocado dentro da sessão
    const [corpo, assinatura] = SENHA.Authorization.replace('Bearer ', '').split('.');
    const trocado = Buffer.from(JSON.stringify({ e: 'intruso@exemplo.com', x: Date.now() + 1e6 })).toString('base64url');
    assert.equal((await chamar('/portaria/lista', null, { Authorization: 'Bearer ' + trocado + '.' + assinatura })).status, 401);
    assert.ok(corpo);

    config.portaria.configurada = false;
    try {
        assert.equal((await chamar('/portaria/lista')).status, 503);
        assert.equal((await chamar('/portaria/codigo', { email: 'porta@exemplo.com' }, {})).status, 503);
    } finally {
        config.portaria.configurada = true;
    }
});

test('e-mail tirado da lista perde a sessão na hora', async function () {
    const sessao = { Authorization: 'Bearer ' + acesso.criarSessao('outra@exemplo.com').sessao };
    assert.equal((await chamar('/portaria/lista', null, sessao)).status, 200);
    const antes = config.portaria.emails;
    config.portaria.emails = ['porta@exemplo.com'];
    try {
        assert.equal((await chamar('/portaria/lista', null, sessao)).status, 401);
    } finally {
        config.portaria.emails = antes;
    }
});

test('e-mail da aba Usuários Portaria entra; apagado da aba, perde o acesso', async function () {
    const { portaria } = require('../src/services/portariaService');
    const email = 'equipe@exemplo.com';
    assert.equal(await acesso.autorizado(email), false);
    armazem.usuarios.push(' Equipe@Exemplo.com ', 'linha sem e-mail');
    portaria().esquecerUsuarios();
    assert.equal(await acesso.autorizado(email), true);
    assert.equal(await acesso.autorizado('linha sem e-mail'), false);

    const r = await chamar('/portaria/entrar', { email: email, codigo: acesso.codigoAtual(email) }, {});
    assert.equal(r.status, 200);
    const sessao = { Authorization: 'Bearer ' + (await r.json()).sessao };
    assert.equal((await chamar('/portaria/lista', null, sessao)).status, 200);

    armazem.usuarios.length = 0;
    portaria().esquecerUsuarios();
    assert.equal((await chamar('/portaria/lista', null, sessao)).status, 401);

    // aba ilegível (apagada, Google ocupado): ninguém novo entra, a reserva do .env continua
    armazem.lerUsuarios = async function () { throw new Error('aba não existe'); };
    portaria().esquecerUsuarios();
    assert.equal(await acesso.autorizado(email), false);
    assert.equal(await acesso.autorizado('porta@exemplo.com'), true);
});

test('entrar: código do e-mail vira sessão; código errado e e-mail de fora não entram', async function () {
    // pedir o código responde igual para quem está e quem não está na lista
    const cadastrado = await chamar('/portaria/codigo', { email: ' Porta@exemplo.com ' }, {});
    const deFora = await chamar('/portaria/codigo', { email: 'intruso@exemplo.com' }, {});
    assert.equal(cadastrado.status, 200);
    assert.equal(deFora.status, 200);
    assert.deepEqual(await cadastrado.json(), await deFora.json());
    assert.equal((await chamar('/portaria/codigo', { email: 'sem-arroba' }, {})).status, 422);

    const codigo = acesso.codigoAtual('porta@exemplo.com');
    assert.match(codigo, /^\d{6}$/);
    const errado = codigo === '000000' ? '000001' : '000000';
    assert.equal((await chamar('/portaria/entrar', { email: 'porta@exemplo.com', codigo: errado }, {})).status, 401);
    // o código de um e-mail não serve para outro, nem para quem está de fora
    assert.equal((await chamar('/portaria/entrar', { email: 'outra@exemplo.com', codigo: codigo }, {})).status, 401);
    assert.equal((await chamar('/portaria/entrar', { email: 'intruso@exemplo.com', codigo: acesso.codigoAtual('intruso@exemplo.com') }, {})).status, 401);

    const r = await chamar('/portaria/entrar', { email: 'porta@exemplo.com', codigo: codigo }, {});
    assert.equal(r.status, 200);
    const dados = await r.json();
    assert.equal((await chamar('/portaria/lista', null, { Authorization: 'Bearer ' + dados.sessao })).status, 200);
    // vencido: o código de 30 minutos atrás não entra mais
    assert.equal(await acesso.codigoConfere('porta@exemplo.com', acesso.codigoAtual('porta@exemplo.com', Date.now() - 30 * 60 * 1000)), false);
});

test('cinco códigos errados seguidos travam aquele e-mail', async function () {
    let status;
    for (let n = 0; n < 6; n++) {
        status = (await chamar('/portaria/entrar', { email: 'outra@exemplo.com', codigo: '12' + n + '456' }, {})).status;
    }
    assert.equal(status, 429);
});

test('códigos errados enviados ao mesmo tempo não furam o limite do e-mail', async function () {
    // outro IP: os 401 dos testes acima já gastaram quase toda a cota do 127.0.0.1
    const ip = { 'X-Forwarded-For': '10.9.9.9' };
    /* No ar, cada tentativa espera a Cloudflare (anti-robô) antes de ser
       conferida; aqui quem demora é a leitura da lista de e-mails. Nesse
       intervalo as 12 já passaram pela contagem. */
    armazem.lerUsuarios = async function () {
        await new Promise(function (ok) { setTimeout(ok, 80); });
        return [];
    };
    const respostas = await Promise.all(Array.from({ length: 12 }, function (_, n) {
        return chamar('/portaria/entrar', { email: 'rajada@exemplo.com', codigo: '9' + String(n).padStart(2, '0') + '456' }, ip);
    }));
    const conferidos = respostas.filter(function (r) { return r.status === 401; }).length;
    assert.ok(conferidos <= 5, conferidos + ' chutes foram conferidos; o limite é 5');
    assert.ok(respostas.some(function (r) { return r.status === 429; }));
});

test('lista os pagos em ordem alfabética, sem cache no navegador, sem CPF inteiro nem telefone', async function () {
    const r = await chamar('/portaria/lista');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    const texto = await r.text();
    const dados = JSON.parse(texto);
    assert.deepEqual(dados.ingressos.map(function (i) { return i.nome; }), ['Ana Lima', 'Beatriz Souza']);
    assert.equal(dados.total, 2);
    assert.equal(dados.presentes, 0);
    assert.deepEqual(Object.keys(dados.ingressos[0]).sort(), ['codigo', 'cpfMeio', 'entrada', 'grupo', 'nome']);
    assert.equal(dados.ingressos[0].cpfMeio, '444777');
    assert.ok(!texto.includes('11144477735') && !texto.includes('52998224725'));
    assert.notEqual(dados.ingressos[0].grupo, dados.ingressos[1].grupo);
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
