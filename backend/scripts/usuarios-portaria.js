/* =============================================================
   Aba "Usuários Portaria" (npm run portaria:usuarios)
   Quem pode entrar na página portaria.html: um e-mail por linha, na coluna
   A. Incluir alguém = escrever o e-mail numa linha nova; tirar o acesso =
   apagar a linha (vale em até 1 minuto, sem deploy). Nome e Observação são
   só para a organização: o site lê apenas a coluna A.
   Pode rodar quantas vezes quiser: cria a aba se faltar e refaz o visual,
   sem apagar nenhum e-mail. Passe e-mails para incluir os que faltam:
     npm run portaria:usuarios -- ana@gmail.com bia@gmail.com
   ============================================================= */
const { abrirPlanilha, explicarErro } = require('./conexaoPlanilha');
const { ABA_USUARIOS } = require('../src/services/portariaService');

const CABECALHO = ['E-mail', 'Nome', 'Observação'];
const LINHAS = 60;

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

function intervalo(id, linha1, linha2, col1, col2) {
    return { sheetId: id, startRowIndex: linha1, endRowIndex: linha2, startColumnIndex: col1, endColumnIndex: col2 };
}

function formato(range, userEnteredFormat) {
    return { repeatCell: { range: range, cell: { userEnteredFormat: userEnteredFormat }, fields: 'userEnteredFormat(' + Object.keys(userEnteredFormat).join(',') + ')' } };
}

function largura(id, coluna, px) {
    return { updateDimensionProperties: { range: { sheetId: id, dimension: 'COLUMNS', startIndex: coluna, endIndex: coluna + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' } };
}

async function main() {
    const novos = process.argv.slice(2).map(function (e) { return e.trim().toLowerCase(); }).filter(function (e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); });
    const doc = await abrirPlanilha();
    console.log('Planilha: "' + doc.title + '"\n');

    let aba = doc.sheetsByTitle[ABA_USUARIOS];
    if (!aba) {
        aba = await doc.addSheet({ title: ABA_USUARIOS, gridProperties: { rowCount: LINHAS, columnCount: 5 } });
        console.log('• Aba "' + ABA_USUARIOS + '" criada');
    }
    const id = aba.sheetId;
    const nome = "'" + ABA_USUARIOS + "'";

    // o que já está lá fica; só entram os e-mails que faltam
    const atuais = ((await doc.sheetsApi.get('values/' + encodeURIComponent(nome + '!A2:A')).json()).values || [])
        .map(function (l) { return String(l[0] || '').trim().toLowerCase(); });
    const faltam = novos.filter(function (e, i) { return !atuais.includes(e) && novos.indexOf(e) === i; });
    const dados = [
        { range: nome + '!A1:C1', values: [CABECALHO] },
        { range: nome + '!E1:E4', values: [
            ['Quem pode entrar na página da portaria'],
            ['Um e-mail por linha, na coluna A. A pessoa digita esse e-mail na página e recebe um código de 6 números nele.'],
            ['Para tirar o acesso de alguém, apague a linha: vale em até 1 minuto.'],
            ['Quem pode editar esta aba decide quem vê a lista de inscritas. Não compartilhe a planilha com quem não precisa.']
        ] }
    ];
    if (faltam.length) {
        dados.push({ range: nome + '!A' + (atuais.length + 2) + ':A' + (atuais.length + 1 + faltam.length), values: faltam.map(function (e) { return [e]; }) });
    }
    await doc.sheetsApi.post('values:batchUpdate', { json: { valueInputOption: 'RAW', data: dados } });

    const meta = await doc.sheetsApi.get('?fields=sheets(properties(sheetId),bandedRanges(bandedRangeId),protectedRanges(protectedRangeId))').json();
    const atual = meta.sheets.find(function (s) { return s.properties.sheetId === id; }) || {};
    const pedidos = [];
    (atual.bandedRanges || []).forEach(function (b) { pedidos.push({ deleteBanding: { bandedRangeId: b.bandedRangeId } }); });
    (atual.protectedRanges || []).forEach(function (p) { pedidos.push({ deleteProtectedRange: { protectedRangeId: p.protectedRangeId } }); });
    pedidos.push(
        { updateSheetProperties: { properties: { sheetId: id, gridProperties: { frozenRowCount: 1, hideGridlines: true }, tabColorStyle: { rgbColor: TIJOLO } }, fields: 'gridProperties(frozenRowCount,hideGridlines),tabColorStyle' } },
        formato({ sheetId: id }, {
            textFormat: { fontFamily: FONTE, fontSize: 10, foregroundColor: TEXTO, bold: false, italic: false },
            verticalAlignment: 'MIDDLE', horizontalAlignment: 'LEFT', wrapStrategy: 'CLIP', backgroundColor: BRANCO, padding: { left: 8, right: 8 }
        }),
        largura(id, 0, 320), largura(id, 1, 200), largura(id, 2, 240), largura(id, 3, 28), largura(id, 4, 520),
        { updateDimensionProperties: { range: { sheetId: id, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 42 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId: id, dimension: 'ROWS', startIndex: 1, endIndex: LINHAS }, properties: { pixelSize: 32 }, fields: 'pixelSize' } },
        formato(intervalo(id, 0, 1, 0, 3), { backgroundColor: TIJOLO, textFormat: { fontFamily: FONTE, fontSize: 10, bold: true, foregroundColor: PAPEL } }),
        formato(intervalo(id, 1, LINHAS, 0, 1), { textFormat: { fontFamily: FONTE, fontSize: 10, bold: true, foregroundColor: TEXTO } }),
        { addBanding: { bandedRange: { range: intervalo(id, 0, LINHAS, 0, 3), rowProperties: { headerColor: TIJOLO, firstBandColor: BRANCO, secondBandColor: PAPEL } } } },
        { updateBorders: { range: intervalo(id, 1, LINHAS, 0, 3), innerHorizontal: { style: 'SOLID', colorStyle: { rgbColor: ROSADO } }, bottom: { style: 'SOLID', colorStyle: { rgbColor: NUDE } } } },
        // instruções ao lado
        formato(intervalo(id, 0, 1, 4, 5), { backgroundColor: ROSADO, textFormat: { fontFamily: FONTE, fontSize: 10, bold: true, foregroundColor: TIJOLO } }),
        formato(intervalo(id, 1, 4, 4, 5), { backgroundColor: PAPEL, wrapStrategy: 'WRAP', textFormat: { fontFamily: FONTE, fontSize: 9, foregroundColor: ROTULO } }),
        { updateDimensionProperties: { range: { sheetId: id, dimension: 'ROWS', startIndex: 1, endIndex: 4 }, properties: { pixelSize: 44 }, fields: 'pixelSize' } },
        // mexer aqui muda quem vê a lista: o Google pede confirmação antes
        { addProtectedRange: { protectedRange: { range: { sheetId: id }, description: 'Quem pode entrar na página da portaria', warningOnly: true } } }
    );
    await doc.sheetsApi.post(':batchUpdate', { json: { requests: pedidos } });

    const total = atuais.filter(Boolean).length + faltam.length;
    if (faltam.length) console.log('• incluídos: ' + faltam.join(', '));
    console.log('• ' + total + ' e-mail(s) com acesso à página da portaria');
    console.log('\nPronto: https://docs.google.com/spreadsheets/d/' + doc.spreadsheetId + '#gid=' + id);
}

main().catch(explicarErro);
