/* =============================================================
   Aba "Check-in especial" (npm run portaria:especial -- ../convidados.txt)
   Convidadas, líderes e mídia, que entram sem ingresso: só o nome e a
   confirmação. A Nome, B Entrou (caixinha), C Entrada ("16/10 18:42:07 ·
   Ana", gravada pela página do check-in, aba "Especial").
   O arquivo tem um nome por linha (linhas com # são ignoradas) e fica FORA
   do repositório público. Pode rodar quantas vezes quiser: cria a aba se
   faltar, acrescenta no fim só quem ainda não está nela (mesmo nome, sem
   olhar acento e maiúsculas) e refaz o visual, sem apagar check-in feito.
   Sem arquivo, só refaz o visual. Incluir alguém na hora = escrever o nome
   na coluna A, numa linha vazia; a página mostra em até 20 s.
   ============================================================= */
const fs = require('fs');
const path = require('path');
const { abrirPlanilha, explicarErro } = require('./conexaoPlanilha');
const { ABA_ESPECIAL, CABECALHO_ESPECIAL, chaveDoNome } = require('../src/services/portariaService');

const FOLGA = 40;  // linhas vazias com caixinha, para nomes escritos na hora
const COLUNAS = CABECALHO_ESPECIAL.length;
const LARGURAS = [340, 90, 200];

const cor = function (hex) {
    return {
        red: parseInt(hex.slice(1, 3), 16) / 255,
        green: parseInt(hex.slice(3, 5), 16) / 255,
        blue: parseInt(hex.slice(5, 7), 16) / 255
    };
};
// paleta Mulheres Plenas (a mesma do portaria.js)
const TIJOLO = cor('#85351E');
const NUDE = cor('#E0B8A6');
const ROSADO = cor('#F5E8E2');
const PAPEL = cor('#FBF5F2');
const BRANCO = cor('#FFFFFF');
const TEXTO = cor('#3E1A10');
const ROTULO = cor('#8A6A5E');
const VERDE = cor('#1E6B34');
const VERDE_FUNDO = cor('#E3F1E4');
const FONTE = 'DM Sans';

function intervalo(id, linha1, linha2, col1, col2) {
    const r = { sheetId: id };
    if (linha1 != null) r.startRowIndex = linha1;
    if (linha2 != null) r.endRowIndex = linha2;
    if (col1 != null) r.startColumnIndex = col1;
    if (col2 != null) r.endColumnIndex = col2;
    return r;
}

function formato(range, userEnteredFormat) {
    return { repeatCell: { range: range, cell: { userEnteredFormat: userEnteredFormat }, fields: 'userEnteredFormat(' + Object.keys(userEnteredFormat).join(',') + ')' } };
}

function largura(id, coluna, px) {
    return { updateDimensionProperties: { range: { sheetId: id, dimension: 'COLUMNS', startIndex: coluna, endIndex: coluna + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' } };
}

function lerNomes(arquivo) {
    if (!arquivo) return [];
    const vistos = {};
    return fs.readFileSync(path.resolve(arquivo), 'utf8').split(/\r?\n/)
        .map(function (l) { return l.replace(/\s+/g, ' ').trim(); })
        .filter(function (l) {
            if (!l || l.charAt(0) === '#' || vistos[chaveDoNome(l)]) return false;
            vistos[chaveDoNome(l)] = true;
            return true;
        });
}

async function main() {
    const nomes = lerNomes(process.argv[2]);
    const doc = await abrirPlanilha();
    console.log('Planilha: "' + doc.title + '"\n');

    let aba = doc.sheetsByTitle[ABA_ESPECIAL];
    if (!aba) {
        aba = await doc.addSheet({ title: ABA_ESPECIAL, gridProperties: { rowCount: nomes.length + FOLGA + 1, columnCount: COLUNAS } });
        console.log('• Aba "' + ABA_ESPECIAL + '" criada');
    }
    const id = aba.sheetId;
    const nome = "'" + ABA_ESPECIAL + "'";

    await doc.sheetsApi.post('values:batchUpdate', {
        json: { valueInputOption: 'RAW', data: [{ range: nome + '!A1', values: [CABECALHO_ESPECIAL] }] }
    });
    const colunaA = ((await doc.sheetsApi.get('values/' + encodeURIComponent(nome + '!A2:A')).json()).values || [])
        .map(function (l) { return String(l[0] || '').trim(); });
    const jaEstao = {};
    colunaA.forEach(function (n) { if (n) jaEstao[chaveDoNome(n)] = true; });
    const novos = nomes.filter(function (n) { return !jaEstao[chaveDoNome(n)]; });
    // logo abaixo do último nome; Entrou começa desmarcada
    if (novos.length) {
        const primeira = colunaA.length + 2;
        await doc.sheetsApi.post('values:batchUpdate', {
            json: { valueInputOption: 'RAW', data: [{ range: nome + '!A' + primeira, values: novos.map(function (n) { return [n, false, '']; }) }] }
        });
    }
    const ocupadas = colunaA.length + novos.length + 1;
    // nunca encolhe; sempre sobra folga para escrever nomes na hora
    const linhas = Math.max(aba.rowCount || 0, ocupadas + FOLGA);
    const colunas = Math.max(aba.columnCount || 0, COLUNAS);

    const meta = await doc.sheetsApi.get('?fields=sheets(properties(sheetId),bandedRanges(bandedRangeId),conditionalFormats)').json();
    const atual = meta.sheets.find(function (s) { return s.properties.sheetId === id; }) || {};
    const pedidos = [];
    (atual.bandedRanges || []).forEach(function (b) { pedidos.push({ deleteBanding: { bandedRangeId: b.bandedRangeId } }); });
    (atual.conditionalFormats || []).forEach(function () { pedidos.push({ deleteConditionalFormatRule: { sheetId: id, index: 0 } }); });
    pedidos.push(
        {
            updateSheetProperties: {
                properties: { sheetId: id, gridProperties: { rowCount: linhas, columnCount: colunas, frozenRowCount: 1, hideGridlines: true }, tabColorStyle: { rgbColor: TIJOLO } },
                fields: 'gridProperties(rowCount,columnCount,frozenRowCount,hideGridlines),tabColorStyle'
            }
        },
        formato(intervalo(id), {
            textFormat: { fontFamily: FONTE, fontSize: 11, foregroundColor: TEXTO, bold: false, italic: false },
            verticalAlignment: 'MIDDLE', horizontalAlignment: 'LEFT', wrapStrategy: 'CLIP', backgroundColor: BRANCO, padding: { left: 8, right: 8 }
        })
    );
    LARGURAS.forEach(function (px, coluna) { pedidos.push(largura(id, coluna, px)); });
    pedidos.push(
        { updateDimensionProperties: { range: { sheetId: id, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 42 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId: id, dimension: 'ROWS', startIndex: 1, endIndex: linhas }, properties: { pixelSize: 34 }, fields: 'pixelSize' } },
        formato(intervalo(id, 0, 1, 0, COLUNAS), { backgroundColor: TIJOLO, textFormat: { fontFamily: FONTE, fontSize: 10, bold: true, foregroundColor: PAPEL } }),
        formato(intervalo(id, 1, null, 0, 1), { textFormat: { fontFamily: FONTE, fontSize: 11, bold: true, foregroundColor: TEXTO } }),
        formato(intervalo(id, 0, null, 1, 2), { horizontalAlignment: 'CENTER' }),
        formato(intervalo(id, 1, null, 2, 3), { textFormat: { fontFamily: FONTE, fontSize: 10, foregroundColor: ROTULO } }),
        { setDataValidation: { range: intervalo(id, 1, linhas, 1, 2), rule: { condition: { type: 'BOOLEAN' } } } },
        { addBanding: { bandedRange: { range: intervalo(id, 0, linhas, 0, COLUNAS), rowProperties: { headerColor: TIJOLO, firstBandColor: BRANCO, secondBandColor: PAPEL } } } },
        { updateBorders: { range: intervalo(id, 1, linhas, 0, COLUNAS), innerHorizontal: { style: 'SOLID', colorStyle: { rgbColor: ROSADO } }, bottom: { style: 'SOLID', colorStyle: { rgbColor: NUDE } } } },
        // quem entrou fica verde, como na aba Portaria
        {
            addConditionalFormatRule: {
                index: 0,
                rule: {
                    ranges: [intervalo(id, 1, linhas, 0, COLUNAS)],
                    booleanRule: {
                        condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: '=$B2' }] },
                        format: { backgroundColor: VERDE_FUNDO, textFormat: { foregroundColor: VERDE, bold: true } }
                    }
                }
            }
        }
    );
    await doc.sheetsApi.post(':batchUpdate', { json: { requests: pedidos } });

    console.log('• ' + novos.length + ' nome(s) acrescentado(s); ' + (ocupadas - 1) + ' linha(s) na aba (contando vazias no meio)');
    if (nomes.length && novos.length < nomes.length) console.log('• ' + (nomes.length - novos.length) + ' do arquivo já estavam na aba');
    console.log('\nPronto: https://docs.google.com/spreadsheets/d/' + doc.spreadsheetId + '#gid=' + id);
}

main().catch(explicarErro);
