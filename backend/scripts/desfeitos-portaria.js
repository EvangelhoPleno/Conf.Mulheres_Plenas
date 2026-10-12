/* =============================================================
   Aba "Check-ins desfeitos" (npm run portaria:desfeitos)
   Registro de todo check-in desfeito na página portaria.html: quando, de
   quem, qual era o check-in, o motivo e quem desfez. Quem grava é o site
   (backend/src/services/portariaService.js), uma linha por vez, logo abaixo
   da última: não escreva nada fora das colunas A–H, nem mude a ordem delas.
   Pode rodar quantas vezes quiser: cria a aba se faltar e refaz o visual,
   sem apagar nenhum registro. Se a aba for apagada, o site cria outra
   sozinho (sem o visual) no próximo desfazer; rode este comando de novo.
   ============================================================= */
const { abrirPlanilha, explicarErro } = require('./conexaoPlanilha');
const { ABA_DESFEITOS, CABECALHO_DESFEITOS } = require('../src/services/portariaService');

const LINHAS = 200;
const COLUNAS = CABECALHO_DESFEITOS.length;
// Desfeito em, Nome, Código, Check-in desfeito, Motivo, Detalhe, Desfeito por, E-mail
const LARGURAS = [140, 280, 170, 210, 230, 340, 150, 260];

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
const FONTE = 'DM Sans';
const FONTE_CODIGO = 'Roboto Mono';

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

async function main() {
    const doc = await abrirPlanilha();
    console.log('Planilha: "' + doc.title + '"\n');

    let aba = doc.sheetsByTitle[ABA_DESFEITOS];
    if (!aba) {
        aba = await doc.addSheet({ title: ABA_DESFEITOS, gridProperties: { rowCount: LINHAS, columnCount: COLUNAS } });
        console.log('• Aba "' + ABA_DESFEITOS + '" criada');
    }
    const id = aba.sheetId;
    const nome = "'" + ABA_DESFEITOS + "'";
    // nunca encolhe: os registros que já existem ficam
    const linhas = Math.max(aba.rowCount || 0, LINHAS);
    const colunas = Math.max(aba.columnCount || 0, COLUNAS);

    await doc.sheetsApi.post('values:batchUpdate', {
        json: { valueInputOption: 'RAW', data: [{ range: nome + '!A1', values: [CABECALHO_DESFEITOS] }] }
    });
    const registros = ((await doc.sheetsApi.get('values/' + encodeURIComponent(nome + '!C2:C')).json()).values || [])
        .filter(function (l) { return String(l[0] || '').trim(); }).length;

    const meta = await doc.sheetsApi.get('?fields=sheets(properties(sheetId),bandedRanges(bandedRangeId),protectedRanges(protectedRangeId))').json();
    const atual = meta.sheets.find(function (s) { return s.properties.sheetId === id; }) || {};
    const pedidos = [];
    (atual.bandedRanges || []).forEach(function (b) { pedidos.push({ deleteBanding: { bandedRangeId: b.bandedRangeId } }); });
    (atual.protectedRanges || []).forEach(function (p) { pedidos.push({ deleteProtectedRange: { protectedRangeId: p.protectedRangeId } }); });
    pedidos.push(
        {
            updateSheetProperties: {
                properties: { sheetId: id, gridProperties: { rowCount: linhas, columnCount: colunas, frozenRowCount: 1, hideGridlines: true }, tabColorStyle: { rgbColor: TIJOLO } },
                fields: 'gridProperties(rowCount,columnCount,frozenRowCount,hideGridlines),tabColorStyle'
            }
        },
        formato(intervalo(id), {
            textFormat: { fontFamily: FONTE, fontSize: 10, foregroundColor: TEXTO, bold: false, italic: false },
            verticalAlignment: 'MIDDLE', horizontalAlignment: 'LEFT', wrapStrategy: 'CLIP', backgroundColor: BRANCO, padding: { left: 8, right: 8 }
        })
    );
    LARGURAS.forEach(function (px, coluna) { pedidos.push(largura(id, coluna, px)); });
    pedidos.push(
        { updateDimensionProperties: { range: { sheetId: id, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 42 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId: id, dimension: 'ROWS', startIndex: 1, endIndex: linhas }, properties: { pixelSize: 32 }, fields: 'pixelSize' } },
        formato(intervalo(id, 0, 1, 0, COLUNAS), { backgroundColor: TIJOLO, textFormat: { fontFamily: FONTE, fontSize: 10, bold: true, foregroundColor: PAPEL } }),
        // nome em destaque; código em fonte de máquina; o motivo é o que se lê primeiro
        formato(intervalo(id, 1, null, 1, 2), { textFormat: { fontFamily: FONTE, fontSize: 10, bold: true, foregroundColor: TEXTO } }),
        formato(intervalo(id, 1, null, 2, 3), { textFormat: { fontFamily: FONTE_CODIGO, fontSize: 10, bold: true, foregroundColor: TIJOLO } }),
        formato(intervalo(id, 1, null, 4, 5), { textFormat: { fontFamily: FONTE, fontSize: 10, bold: true, foregroundColor: TIJOLO } }),
        formato(intervalo(id, 1, null, 5, 6), { wrapStrategy: 'WRAP' }),
        formato(intervalo(id, 1, null, 7, 8), { textFormat: { fontFamily: FONTE, fontSize: 9, foregroundColor: ROTULO } }),
        { addBanding: { bandedRange: { range: intervalo(id, 0, linhas, 0, COLUNAS), rowProperties: { headerColor: TIJOLO, firstBandColor: BRANCO, secondBandColor: PAPEL } } } },
        { updateBorders: { range: intervalo(id, 1, linhas, 0, COLUNAS), innerHorizontal: { style: 'SOLID', colorStyle: { rgbColor: ROSADO } }, bottom: { style: 'SOLID', colorStyle: { rgbColor: NUDE } } } },
        // quem grava é o site: mexer aqui só com aviso
        { addProtectedRange: { protectedRange: { range: { sheetId: id }, description: 'Registro automático dos check-ins desfeitos: não edite', warningOnly: true } } }
    );
    await doc.sheetsApi.post(':batchUpdate', { json: { requests: pedidos } });

    console.log('• ' + registros + ' check-in(s) desfeito(s) registrados');
    console.log('\nPronto: https://docs.google.com/spreadsheets/d/' + doc.spreadsheetId + '#gid=' + id);
}

main().catch(explicarErro);
