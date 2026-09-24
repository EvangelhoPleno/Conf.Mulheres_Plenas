/* Gravação na planilha: tipos das células.
   O painel Acompanhamento soma Quantidade e Valor_Total com SUMIF/SUMIFS, que ignoram
   texto. O getRows() devolve toda célula como string e o save() reescreve a
   linha inteira — então atualizar um pedido já zerou os totais uma vez.
   Rode com: npm test */
process.env.NODE_ENV = 'test';
process.env.GOOGLE_SHEET_ID = '';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CABECALHO, COLUNAS_NUMERICAS, prepararLinha } = require('../src/services/sheetsService');

/* Imita a GoogleSpreadsheetRow: o que vem da planilha vem como texto. */
function linhaFalsa(valores) {
    const celulas = Object.assign({}, valores);
    return {
        celulas,
        get: function (coluna) { return celulas[coluna]; },
        set: function (coluna, valor) { celulas[coluna] = valor; },
        assign: function (obj) { Object.assign(celulas, obj); }
    };
}

function linhaPaga() {
    return linhaFalsa({
        Data_Hora: '21/09/2026 21:24:02',
        Nome_Cliente: 'Maria de Souza',
        CPF: '01234567890',          // CPF com zero à esquerda
        Status: 'PENDENTE',
        Quantidade: '3',             // texto, como o getRows() devolve
        Valor_Total: '165',          // texto
        Pedido_ID: 'MPgWjha9XLYVpDOvWY',
        Email_Enviado: 'NAO',
        Pix_Copia_Cola: '00020101021226860014BR.GOV.BCB.PIX'
    });
}

test('colunas numéricas existem no cabeçalho', function () {
    COLUNAS_NUMERICAS.forEach(function (coluna) {
        assert.ok(CABECALHO.includes(coluna), coluna + ' precisa existir na aba Pedidos');
    });
});

test('confirmar pagamento devolve Quantidade e Valor_Total a número', function () {
    const row = linhaPaga();
    // o que confirmarPagamento manda: nenhum campo numérico
    prepararLinha(row, { status: 'PAGO', codigos: ['MP26-AAAA-BBBB'], emailEnviado: 'SIM' });

    assert.equal(typeof row.get('Quantidade'), 'number', 'SUMIF ignora texto');
    assert.equal(row.get('Quantidade'), 3);
    assert.equal(typeof row.get('Valor_Total'), 'number', 'Arrecadado sairia zerado');
    assert.equal(row.get('Valor_Total'), 165);
    assert.equal(row.get('Status'), 'PAGO');
});

test('campos de texto continuam texto', function () {
    const row = linhaPaga();
    prepararLinha(row, { status: 'PAGO' });

    assert.equal(row.get('CPF'), '01234567890', 'zero à esquerda não pode sumir');
    assert.equal(typeof row.get('Data_Hora'), 'string');
    assert.equal(row.get('Pix_Copia_Cola'), '00020101021226860014BR.GOV.BCB.PIX');
});

test('valorTotal vem em centavos e é gravado em reais', function () {
    const row = linhaPaga();
    prepararLinha(row, { status: 'PAGO', valorTotal: 16500 });
    assert.equal(row.get('Valor_Total'), 165, 'a planilha guarda reais');
});

test('atualizar de novo não volta a estragar os tipos', function () {
    const row = linhaPaga();
    prepararLinha(row, { status: 'PAGO' });
    prepararLinha(row, { emailEnviado: 'SIM' });   // reenvio de e-mail
    prepararLinha(row, { atualizadoEm: '21/09/2026 21:30:00' });

    assert.equal(typeof row.get('Quantidade'), 'number');
    assert.equal(row.get('Valor_Total'), 165);
});

test('valores estranhos não viram NaN', function () {
    const row = linhaFalsa({ Quantidade: '', Valor_Total: '110,50' });
    prepararLinha(row, {});
    assert.equal(row.get('Quantidade'), 0, 'célula vazia vira 0');
    assert.equal(row.get('Valor_Total'), 110.5, 'vírgula decimal é aceita');
});
