/* =============================================================
   Teste de carga (npm run carga [-- --compradoras 30 --instancias 3])

   Simula o pior momento: o link divulgado no culto e 30 mulheres comprando
   JUNTAS, no mesmo Wi-Fi (mesmo IP), cada uma esperando o Pix na página de
   pagamento, que consulta o status a cada 5 s, e os pagamentos caindo
   espalhados em ~40 s.

   Usa a planilha DE VERDADE (o limite do Google é o que se quer medir), mas
   numa aba temporária "Teste carga", apagada no final — a aba Pedidos não é
   tocada. Pagamento simulado e e-mail desligado: ninguém é cobrado e nenhum
   e-mail sai. Sobe N servidores locais, como instâncias da Vercel.
   ============================================================= */
const { spawn } = require('child_process');
const path = require('path');
const { abrirPlanilha } = require('./conexaoPlanilha');
const { CABECALHO } = require('../src/services/sheetsService');
const { pintarCabecalho } = require('./preparar-planilha');

const ABA = 'Teste carga';
const arg = function (nome, padrao) {
    const i = process.argv.indexOf('--' + nome);
    return i > -1 ? Number(process.argv[i + 1]) : padrao;
};
const COMPRADORAS = arg('compradoras', 30);
const INSTANCIAS = arg('instancias', 3);
const PORTA_BASE = 3900;
const INTERVALO_CONSULTA = 5000;

const esperar = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

function cpfAleatorio() {
    const n = Array.from({ length: 9 }, function () { return Math.floor(Math.random() * 10); });
    [9, 10].forEach(function (pos) {
        let soma = 0;
        for (let i = 0; i < pos; i++) soma += n[i] * (pos + 1 - i);
        const d = (soma * 10) % 11;
        n.push(d === 10 ? 0 : d);
    });
    return n.join('');
}

function subirInstancia(porta) {
    const filho = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
        env: Object.assign({}, process.env, {
            PORT: String(porta),
            API_URL: 'http://localhost:' + porta,
            NODE_ENV: 'development',
            PAYMENT_PROVIDER: 'mock',
            RESEND_API_KEY: '',
            GOOGLE_SHEET_TAB: ABA
        }),
        stdio: ['ignore', 'pipe', 'pipe']
    });
    const avisos = [];
    filho.stderr.on('data', function (d) { avisos.push(String(d)); });
    filho.stdout.on('data', function (d) { if (/429|ocupado/.test(d)) avisos.push(String(d)); });
    return new Promise(function (ok, falha) {
        filho.stdout.once('data', function () { ok({ filho, avisos, porta }); });
        filho.once('exit', function (c) { falha(new Error('servidor saiu: ' + c + ' ' + avisos.join(''))); });
    });
}

const medidas = { checkout: [], consulta: [], pagamento: [] };
const erros = [];

async function chamar(tipo, porta, caminho, corpo) {
    const inicio = Date.now();
    try {
        const resposta = await fetch('http://localhost:' + porta + '/api' + caminho, {
            method: corpo ? 'POST' : 'GET',
            headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
            body: corpo ? JSON.stringify(corpo) : undefined,
            signal: AbortSignal.timeout(25000)   // o mesmo prazo da página
        });
        const dados = await resposta.json().catch(function () { return {}; });
        medidas[tipo].push(Date.now() - inicio);
        if (!resposta.ok) erros.push(tipo + ' ' + resposta.status + ' ' + (dados.erro || ''));
        return resposta.ok ? dados : null;
    } catch (erro) {
        medidas[tipo].push(Date.now() - inicio);
        erros.push(tipo + ' ' + erro.name + ' ' + erro.message);
        return null;
    }
}

async function compradora(i, portas) {
    const porta = function () { return portas[Math.floor(Math.random() * portas.length)]; };
    const pedido = await chamar('checkout', porta(), '/checkout', {
        produto: 'lote-1', quantidade: 1, metodo: 'pix',
        nome: 'Teste Carga ' + (i + 1), email: 'carga' + (i + 1) + '@example.com',
        cpf: cpfAleatorio(), telefone: '91999990000'
    });
    if (!pedido) return { i, final: 'SEM PEDIDO' };

    // ela "paga" num momento qualquer dos próximos 40 s; o aviso cai numa instância
    const pagaEm = Date.now() + Math.random() * 40000;
    let pago = false;
    let status = 'PENDENTE';
    const limite = Date.now() + 90000;
    while (status !== 'PAGO' && Date.now() < limite) {
        await esperar(INTERVALO_CONSULTA);
        if (!pago && Date.now() >= pagaEm) {
            pago = true;
            await chamar('pagamento', porta(), '/dev/simular-pagamento/' + pedido.pedidoId, {});
        }
        const visto = await chamar('consulta', porta(), '/pedidos/' + pedido.pedidoId);
        if (visto) status = visto.status;
    }
    return { i, pedidoId: pedido.pedidoId, final: status };
}

function resumo(lista) {
    if (!lista.length) return '-';
    const o = lista.slice().sort(function (a, b) { return a - b; });
    const p = function (q) { return o[Math.min(o.length - 1, Math.floor(q * o.length))]; };
    return lista.length + ' chamadas · mediana ' + p(0.5) + ' ms · 95% ' + p(0.95) + ' ms · pior ' + o[o.length - 1] + ' ms';
}

async function main() {
    const doc = await abrirPlanilha();
    if (doc.sheetsByTitle[ABA]) await doc.sheetsByTitle[ABA].delete();
    const aba = await doc.addSheet({ title: ABA, headerValues: CABECALHO });
    await pintarCabecalho(doc, aba);  // cabeçalho igual ao da aba Pedidos
    console.log('Aba temporária "' + ABA + '" criada. ' + COMPRADORAS + ' compradoras, ' + INSTANCIAS + ' instâncias.\n');

    const servidores = [];
    try {
        for (let k = 0; k < INSTANCIAS; k++) servidores.push(await subirInstancia(PORTA_BASE + k));
        const portas = servidores.map(function (s) { return s.porta; });

        const inicio = Date.now();
        const resultados = await Promise.all(Array.from({ length: COMPRADORAS }, function (_, i) {
            return compradora(i, portas);
        }));
        console.log('Tempo total: ' + Math.round((Date.now() - inicio) / 1000) + ' s\n');

        console.log('checkout  ', resumo(medidas.checkout));
        console.log('consulta  ', resumo(medidas.consulta));
        console.log('pagamento ', resumo(medidas.pagamento));

        const porFinal = {};
        resultados.forEach(function (r) { porFinal[r.final] = (porFinal[r.final] || 0) + 1; });
        console.log('\nNa tela delas:', JSON.stringify(porFinal));

        // a planilha é a verdade: confere linha a linha (o próprio teste pode
        // ter gastado a cota do minuto; espera ela voltar)
        let linhas = null;
        for (let t = 0; !linhas; t++) {
            try { linhas = await aba.getRows(); } catch (e) {
                if (t > 6) throw e;
                await esperar(15000);
            }
        }
        const ids = linhas.map(function (r) { return r.get('Pedido_ID'); });
        const repetidos = ids.filter(function (id, k) { return ids.indexOf(id) !== k; });
        const pagas = linhas.filter(function (r) { return r.get('Status') === 'PAGO'; });
        const comCodigo = pagas.filter(function (r) { return /^MP26-/.test(r.get('Codigos_Ingresso') || ''); });
        const comEmail = pagas.filter(function (r) { return ['SIM', 'SIMULADO'].includes(r.get('Email_Enviado')); });
        const numericas = linhas.filter(function (r) { return Number(r.get('Valor_Total')) === 55; });
        console.log('Na planilha:   ' + linhas.length + ' linhas · ' + pagas.length + ' PAGO · ' + comCodigo.length +
            ' com código · ' + comEmail.length + ' com e-mail marcado · ' + numericas.length + ' com valor 55 · ' +
            repetidos.length + ' pedidos repetidos');

        // as vendas entram INSERINDO linha: nenhuma pode ter herdado o marrom do cabeçalho
        await aba.loadCells({ startRowIndex: 0, endRowIndex: linhas.length + 1, startColumnIndex: 0, endColumnIndex: 1 });
        const fundo = function (r) {
            const f = aba.getCell(r, 0).effectiveFormat;
            const c = (f && f.backgroundColor) || {};
            return (c.red === undefined ? 1 : c.red) < 0.9;  // escuro = marrom
        };
        const marrons = linhas.filter(function (_, k) { return fundo(k + 1); }).length;
        console.log('Formato:       cabeçalho ' + (fundo(0) ? 'marrom' : 'SEM COR') + ' · ' + marrons + ' linha(s) de venda marrom');

        const avisos = servidores.map(function (s) { return s.avisos.join(''); }).join('');
        const ocupado = (avisos.match(/429|ocupado/g) || []).length;
        console.log('Google pediu calma (429): ' + ocupado + ' vez(es), todas absorvidas se não houver erro abaixo');

        console.log('\nErros vistos pelas compradoras: ' + erros.length);
        const agrupados = {};
        erros.forEach(function (e) { agrupados[e] = (agrupados[e] || 0) + 1; });
        Object.keys(agrupados).forEach(function (e) { console.log('  ' + agrupados[e] + '× ' + e); });

        const ok = linhas.length === COMPRADORAS && pagas.length === COMPRADORAS &&
            comCodigo.length === COMPRADORAS && comEmail.length === COMPRADORAS && !repetidos.length &&
            fundo(0) && !marrons &&
            resultados.every(function (r) { return r.final === 'PAGO'; });
        console.log('\n' + (ok ? '✓ PASSOU: todas compraram, pagaram e receberam o ingresso.' : '✗ FALHOU: veja acima.'));
        process.exitCode = ok ? 0 : 1;
    } finally {
        servidores.forEach(function (s) { s.filho.kill(); });
        for (let t = 0; ; t++) {
            try { await aba.delete(); break; } catch (e) { if (t > 6) throw e; await esperar(15000); }
        }
        console.log('Aba temporária apagada.');
    }
}

main().catch(function (erro) { console.error(erro); process.exit(1); });
