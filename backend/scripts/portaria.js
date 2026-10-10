/* =============================================================
   Aba "Portaria" (npm run portaria)
   Lista de entrada do dia da conferência: só quem está PAGO na aba Pedidos,
   uma linha por código de ingresso, em ordem alfabética, com a caixinha
   "Presente" e a hora de entrada. Ao lado, o painel da portaria.
   Pode rodar quantas vezes quiser: refaz a lista com os pagos de agora,
   refaz o visual e GUARDA as presenças já marcadas (casadas pelo código do
   ingresso, não pela linha). Pedido reembolsado sai da lista. A aba Pedidos
   não é tocada.
   Não rodar enquanto a portaria estiver marcando presença: a regravação da
   lista apagaria uma marcação feita no meio dela.
   A página portaria.html grava aqui (backend/src/services/portariaService.js),
   pelas colunas A–G: não mude a ordem delas.
   ============================================================= */
const { config, abrirPlanilha, explicarErro } = require('./conexaoPlanilha');

const NOME_ABA = 'Portaria';
const CABECALHO = ['Nome', 'Código do ingresso', 'CPF', 'Telefone', 'Presente', 'Entrada', 'Pedido'];
const COL_PRESENTE = 4;  // E
const COL_ENTRADA = 5;   // F
const COL_PAINEL = 8;    // I (H fica de respiro)

const cor = function (hex) {
    return {
        red: parseInt(hex.slice(1, 3), 16) / 255,
        green: parseInt(hex.slice(3, 5), 16) / 255,
        blue: parseInt(hex.slice(5, 7), 16) / 255
    };
};
// paleta Mulheres Plenas (a mesma do preparar-planilha.js)
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
const FONTE_TITULO = 'Bebas Neue';
const FONTE_CODIGO = 'Roboto Mono';

function texto(valor) {
    return String(valor == null ? '' : valor).trim();
}

function ordemAlfabetica(a, b) {
    return a[0].localeCompare(b[0], 'pt-BR', { sensitivity: 'base' }) || a[1].localeCompare(b[1]);
}

// "TRUE"/"VERDADEIRO" (o que a API devolve para caixinha marcada, conforme a localidade)
function marcado(valor) {
    return /^(true|verdadeiro)$/i.test(texto(valor));
}

function formatarCpf(valor) {
    const d = texto(valor).replace(/\D/g, '');
    return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : texto(valor);
}

function formatarTelefone(valor) {
    const d = texto(valor).replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
    if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    return texto(valor);
}

async function lerValores(doc, intervalo) {
    const caminho = 'values/' + encodeURIComponent(intervalo) + '?valueRenderOption=UNFORMATTED_VALUE';
    const resposta = await doc.sheetsApi.get(caminho).json();
    return resposta.values || [];
}

/* ---------- visual (refeito a cada rodada) ---------- */
function intervalo(id, linha1, linha2, col1, col2) {
    const r = { sheetId: id };
    if (linha1 != null) r.startRowIndex = linha1;
    if (linha2 != null) r.endRowIndex = linha2;
    if (col1 != null) r.startColumnIndex = col1;
    if (col2 != null) r.endColumnIndex = col2;
    return r;
}

function formato(range, userEnteredFormat) {
    const campos = Object.keys(userEnteredFormat).join(',');
    return { repeatCell: { range: range, cell: { userEnteredFormat: userEnteredFormat }, fields: 'userEnteredFormat(' + campos + ')' } };
}

function largura(id, coluna, px) {
    return {
        updateDimensionProperties: {
            range: { sheetId: id, dimension: 'COLUMNS', startIndex: coluna, endIndex: coluna + 1 },
            properties: { pixelSize: px },
            fields: 'pixelSize'
        }
    };
}

function altura(id, de, ate, px) {
    return {
        updateDimensionProperties: {
            range: { sheetId: id, dimension: 'ROWS', startIndex: de, endIndex: ate },
            properties: { pixelSize: px },
            fields: 'pixelSize'
        }
    };
}

async function formatarAba(doc, id, fim, linhasAba) {
    // o que a rodada anterior deixou: faixas, regras, proteções e mesclas
    const meta = await doc.sheetsApi.get('?fields=sheets(properties(sheetId),bandedRanges(bandedRangeId),conditionalFormats,protectedRanges(protectedRangeId))').json();
    const atual = meta.sheets.find(function (s) { return s.properties.sheetId === id; }) || {};
    const pedidos = [];
    (atual.bandedRanges || []).forEach(function (b) { pedidos.push({ deleteBanding: { bandedRangeId: b.bandedRangeId } }); });
    (atual.conditionalFormats || []).forEach(function () { pedidos.push({ deleteConditionalFormatRule: { sheetId: id, index: 0 } }); });
    (atual.protectedRanges || []).forEach(function (p) { pedidos.push({ deleteProtectedRange: { protectedRangeId: p.protectedRangeId } }); });
    pedidos.push({ unmergeCells: { range: intervalo(id, 0, 12, COL_PAINEL, COL_PAINEL + 2) } });

    /* Quem paga depois desta rodada entra sozinha logo abaixo da lista
       (portariaService.incluir): cores, fontes, filtro e a regra do verde
       vão até o fim da aba, para a linha nova já nascer no padrão. */
    const fimAba = linhasAba;
    pedidos.push(
        {
            updateSheetProperties: {
                properties: { sheetId: id, gridProperties: { rowCount: linhasAba, columnCount: 10, frozenRowCount: 1, frozenColumnCount: 1, hideGridlines: true } },
                fields: 'gridProperties(rowCount,columnCount,frozenRowCount,frozenColumnCount,hideGridlines)'
            }
        },
        { updateSheetProperties: { properties: { sheetId: id, tabColorStyle: { rgbColor: TIJOLO } }, fields: 'tabColorStyle' } },

        // base: fonte, cor e alinhamento vertical em tudo; limpa bordas antigas
        formato(intervalo(id), {
            textFormat: { fontFamily: FONTE, fontSize: 10, foregroundColor: TEXTO, bold: false, italic: false },
            verticalAlignment: 'MIDDLE',
            horizontalAlignment: 'LEFT',
            wrapStrategy: 'CLIP',
            borders: {},
            backgroundColor: BRANCO,
            padding: { left: 8, right: 8 }
        }),

        // colunas
        largura(id, 0, 300), largura(id, 1, 170), largura(id, 2, 130), largura(id, 3, 140),
        largura(id, 4, 86), largura(id, 5, 190), largura(id, 6, 150), largura(id, 7, 28),
        largura(id, 8, 190), largura(id, 9, 140),
        altura(id, 0, 1, 42),
        altura(id, 1, linhasAba, 30),

        // cabeçalho
        formato(intervalo(id, 0, 1, 0, CABECALHO.length), {
            backgroundColor: TIJOLO,
            textFormat: { fontFamily: FONTE, fontSize: 10, bold: true, foregroundColor: PAPEL },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE'
        }),
        formato(intervalo(id, 0, 1, 0, 1), { horizontalAlignment: 'LEFT' }),

        // nome em destaque; código em fonte de máquina (fácil de conferir)
        formato(intervalo(id, 1, fimAba, 0, 1), { textFormat: { fontFamily: FONTE, fontSize: 10, bold: true, foregroundColor: TEXTO } }),
        formato(intervalo(id, 1, fimAba, 1, 2), {
            textFormat: { fontFamily: FONTE_CODIGO, fontSize: 10, bold: true, foregroundColor: TIJOLO },
            horizontalAlignment: 'CENTER'
        }),
        formato(intervalo(id, 1, fimAba, 2, COL_ENTRADA + 1), { horizontalAlignment: 'CENTER' }),
        formato(intervalo(id, 1, fimAba, 6, 7), {
            textFormat: { fontFamily: FONTE, fontSize: 8, foregroundColor: ROTULO },
            horizontalAlignment: 'CENTER'
        }),

        // linhas alternadas (o verde de "entrou" vem por cima, na regra abaixo)
        {
            addBanding: {
                bandedRange: {
                    range: intervalo(id, 0, fimAba, 0, CABECALHO.length),
                    rowProperties: { headerColor: TIJOLO, firstBandColor: BRANCO, secondBandColor: PAPEL }
                }
            }
        },
        // fio fino entre as linhas
        {
            updateBorders: {
                range: intervalo(id, 1, fimAba, 0, CABECALHO.length),
                innerHorizontal: { style: 'SOLID', colorStyle: { rgbColor: ROSADO } },
                bottom: { style: 'SOLID', colorStyle: { rgbColor: NUDE } }
            }
        },
        // quem já entrou: linha verde e a hora em negrito
        {
            addConditionalFormatRule: {
                index: 0,
                rule: {
                    ranges: [intervalo(id, 1, fimAba, 0, CABECALHO.length)],
                    booleanRule: {
                        condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: '=$E2' }] },
                        format: { backgroundColor: VERDE_FUNDO, textFormat: { foregroundColor: VERDE, bold: true } }
                    }
                }
            }
        },

        // filtro em todas as colunas da lista
        { clearBasicFilter: { sheetId: id } },
        { setBasicFilter: { filter: { range: intervalo(id, 0, fimAba, 0, CABECALHO.length) } } },

        // os dados vêm da aba Pedidos: editar aqui só com aviso (a caixinha e a hora ficam livres)
        {
            addProtectedRange: {
                protectedRange: {
                    range: intervalo(id, 0, null, 0, COL_PRESENTE),
                    description: 'Dados da aba Pedidos: corrija lá e rode npm run portaria',
                    warningOnly: true
                }
            }
        },
        {
            addProtectedRange: {
                protectedRange: {
                    range: intervalo(id, 0, null, 6, 7),
                    description: 'Pedido de origem (aba Pedidos)',
                    warningOnly: true
                }
            }
        },

        /* ---------- painel da portaria (I1:J7) ---------- */
        formato(intervalo(id, 0, 12, COL_PAINEL, COL_PAINEL + 2), { backgroundColor: BRANCO }),
        { mergeCells: { range: intervalo(id, 0, 1, COL_PAINEL, COL_PAINEL + 2), mergeType: 'MERGE_ALL' } },
        formato(intervalo(id, 0, 1, COL_PAINEL, COL_PAINEL + 2), {
            backgroundColor: TIJOLO,
            textFormat: { fontFamily: FONTE_TITULO, fontSize: 16, foregroundColor: PAPEL },
            horizontalAlignment: 'CENTER'
        }),
        formato(intervalo(id, 1, 5, COL_PAINEL, COL_PAINEL + 1), {
            backgroundColor: PAPEL,
            textFormat: { fontFamily: FONTE, fontSize: 10, bold: true, foregroundColor: ROTULO }
        }),
        formato(intervalo(id, 1, 5, COL_PAINEL + 1, COL_PAINEL + 2), {
            backgroundColor: PAPEL,
            textFormat: { fontFamily: FONTE, fontSize: 15, bold: true, foregroundColor: TEXTO },
            horizontalAlignment: 'RIGHT',
            numberFormat: { type: 'NUMBER', pattern: '0' }
        }),
        formato(intervalo(id, 2, 3, COL_PAINEL, COL_PAINEL + 2), {
            backgroundColor: VERDE_FUNDO,
            textFormat: { fontFamily: FONTE, fontSize: 10, bold: true, foregroundColor: VERDE }
        }),
        formato(intervalo(id, 2, 3, COL_PAINEL + 1, COL_PAINEL + 2), {
            textFormat: { fontFamily: FONTE, fontSize: 15, bold: true, foregroundColor: VERDE }
        }),
        formato(intervalo(id, 4, 5, COL_PAINEL + 1, COL_PAINEL + 2), { numberFormat: { type: 'PERCENT', pattern: '0%' } }),
        { mergeCells: { range: intervalo(id, 5, 6, COL_PAINEL, COL_PAINEL + 2), mergeType: 'MERGE_ALL' } },
        formato(intervalo(id, 5, 6, COL_PAINEL, COL_PAINEL + 2), {
            backgroundColor: PAPEL,
            textFormat: { fontFamily: FONTE, fontSize: 11, foregroundColor: VERDE },
            horizontalAlignment: 'CENTER'
        }),
        { mergeCells: { range: intervalo(id, 6, 7, COL_PAINEL, COL_PAINEL + 2), mergeType: 'MERGE_ALL' } },
        formato(intervalo(id, 6, 7, COL_PAINEL, COL_PAINEL + 2), {
            textFormat: { fontFamily: FONTE, fontSize: 8, italic: true, foregroundColor: ROTULO },
            horizontalAlignment: 'CENTER',
            wrapStrategy: 'WRAP'
        }),
        altura(id, 6, 7, 40),
        {
            updateBorders: {
                range: intervalo(id, 0, 6, COL_PAINEL, COL_PAINEL + 2),
                top: { style: 'SOLID', colorStyle: { rgbColor: TIJOLO } },
                bottom: { style: 'SOLID', colorStyle: { rgbColor: TIJOLO } },
                left: { style: 'SOLID', colorStyle: { rgbColor: TIJOLO } },
                right: { style: 'SOLID', colorStyle: { rgbColor: TIJOLO } },
                innerHorizontal: { style: 'SOLID', colorStyle: { rgbColor: NUDE } }
            }
        }
    );
    await doc.sheetsApi.post(':batchUpdate', { json: { requests: pedidos } });
}

/* Caixinha só nas linhas com gente. Vai DEPOIS de gravar a lista: o
   values:batchClear apaga a validação junto com os valores (ao contrário do
   que diz a documentação do Google; conferido em 09/10). */
async function caixinhas(doc, id, fim, linhasAba) {
    await doc.sheetsApi.post(':batchUpdate', {
        json: {
            requests: [
                { setDataValidation: { range: intervalo(id, fim, linhasAba, COL_PRESENTE, COL_PRESENTE + 1) } },
                { setDataValidation: { range: intervalo(id, 1, fim, COL_PRESENTE, COL_PRESENTE + 1), rule: { condition: { type: 'BOOLEAN' } } } }
            ]
        }
    });
}

async function main() {
    const doc = await abrirPlanilha();
    console.log('Planilha: "' + doc.title + '"\n');

    const pedidos = doc.sheetsByTitle[config.google.aba];
    if (!pedidos) throw new Error('Aba "' + config.google.aba + '" não encontrada');

    // 1. quem está PAGO, uma linha por código de ingresso
    const linhas = await pedidos.getRows();
    const pagos = [];
    let semCodigo = 0;
    linhas.forEach(function (r) {
        if (texto(r.get('Status')) !== 'PAGO') return;
        const codigos = texto(r.get('Codigos_Ingresso')).split(/\s+/).filter(Boolean);
        if (!codigos.length) { semCodigo++; return; }
        codigos.forEach(function (codigo) {
            pagos.push([
                texto(r.get('Nome_Cliente')).replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR'),
                codigo,
                formatarCpf(r.get('CPF')),
                formatarTelefone(r.get('Telefone')),
                false,
                '',
                texto(r.get('Pedido_ID'))
            ]);
        });
    });

    // 2. presenças já marcadas, pelo código
    let aba = doc.sheetsByTitle[NOME_ABA];
    const presencas = {};
    if (aba) {
        (await lerValores(doc, NOME_ABA + '!A2:G')).forEach(function (l) {
            const codigo = texto(l[1]);
            if (codigo && (marcado(l[COL_PRESENTE]) || texto(l[COL_ENTRADA]))) {
                presencas[codigo] = { presente: marcado(l[COL_PRESENTE]), entrada: texto(l[COL_ENTRADA]) };
            }
        });
    } else {
        aba = await doc.addSheet({ title: NOME_ABA, index: 1, gridProperties: { rowCount: 1000, columnCount: 10 } });
        console.log('• Aba "' + NOME_ABA + '" criada');
    }

    let guardadas = 0;
    pagos.forEach(function (l) {
        const p = presencas[l[1]];
        if (!p) return;
        l[COL_PRESENTE] = p.presente;
        l[COL_ENTRADA] = p.entrada;
        guardadas++;
        delete presencas[l[1]];
    });
    const perdidas = Object.keys(presencas);
    pagos.sort(ordemAlfabetica);

    // 3. visual
    const fim = pagos.length + 1;  // última linha com dados (1-based)
    const linhasAba = Math.max(fim + 50, 200);
    await formatarAba(doc, aba.sheetId, fim, linhasAba);

    // 4. grava a lista (e limpa o que sobrou da rodada anterior) e o painel
    const sep = /^(en|ja|zh|ko|th|he)/i.test(String(doc.locale || '')) ? ',' : ';';
    await doc.sheetsApi.post('values:batchClear', { json: { ranges: [NOME_ABA + '!A2:G', NOME_ABA + '!I1:J12'] } });
    await doc.sheetsApi.post('values:batchUpdate', {
        json: {
            valueInputOption: 'RAW',
            data: [{ range: NOME_ABA + '!A1:G' + fim, values: [CABECALHO].concat(pagos) }]
        }
    });
    await doc.sheetsApi.post('values:batchUpdate', {
        json: {
            valueInputOption: 'USER_ENTERED',
            data: [{
                range: NOME_ABA + '!I1:J7',
                values: [
                    ['Painel da portaria', ''],
                    ['Inscritas (pagas)', '=COUNTUNIQUE(B2:B)'],
                    ['Já entraram', '=COUNTIF(E2:E' + sep + 'TRUE)'],
                    ['Faltam chegar', '=J2-J3'],
                    ['Presença', '=IF(J2=0' + sep + '0' + sep + 'J3/J2)'],
                    ['=REPT("█"' + sep + 'ROUND(J5*24))&REPT("░"' + sep + '24-ROUND(J5*24))', ''],
                    ['Atualiza sozinho a cada entrada confirmada na página da portaria.', '']
                ]
            }]
        }
    });

    await caixinhas(doc, aba.sheetId, fim, linhasAba);

    console.log('• ' + pagos.length + ' ingressos pagos na lista (ordem alfabética)');
    console.log('• ' + guardadas + ' presenças já marcadas foram mantidas');
    if (semCodigo) console.log('⚠ ' + semCodigo + ' pedido(s) PAGO sem código de ingresso ficaram de fora');
    if (perdidas.length) console.log('⚠ presença marcada em código que não está mais PAGO: ' + perdidas.join(', '));
    console.log('\nPronto: https://docs.google.com/spreadsheets/d/' + config.google.planilhaId + '#gid=' + aba.sheetId);
}

main().catch(explicarErro);
