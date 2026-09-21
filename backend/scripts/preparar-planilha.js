/* =============================================================
   Prepara a planilha de controle (npm run planilha:preparar)
   - aba "Pedidos": cria se não existir e completa o cabeçalho
   - aba "Resumo": totais de vendas atualizados sozinhos por fórmula
   Funciona em planilha nova, na planilha-modelo .xlsx importada ou
   numa planilha que já tem outras abas. Não apaga pedidos nem abas.
   ============================================================= */
const { config, abrirPlanilha, explicarErro } = require('./conexaoPlanilha');
const { CABECALHO } = require('../src/services/sheetsService');
const { listarProdutos } = require('../src/catalogo');

const TIJOLO = { red: 0x85 / 255, green: 0x35 / 255, blue: 0x1e / 255 };
const TERRACOTA = { red: 0xb8 / 255, green: 0x68 / 255, blue: 0x4f / 255 };
const ROSADO = { red: 0xf5 / 255, green: 0xe8 / 255, blue: 0xe2 / 255 };

function letra(indice) {
    return String.fromCharCode(65 + indice);
}

async function lerCabecalho(aba) {
    try {
        await aba.loadHeaderRow();
        return aba.headerValues.filter(Boolean);
    } catch (e) {
        return [];  // aba vazia
    }
}

async function prepararPedidos(doc) {
    const nome = config.google.aba;
    let aba = doc.sheetsByTitle[nome];

    if (!aba) {
        // planilha recém-criada, com uma única aba vazia: só renomeia
        const unica = doc.sheetsByIndex.length === 1 ? doc.sheetsByIndex[0] : null;
        if (unica && (await lerCabecalho(unica)).length === 0) {
            await unica.updateProperties({ title: nome });
            aba = unica;
            console.log('• Aba "' + unica.title + '" renomeada para "' + nome + '"');
        } else {
            aba = await doc.addSheet({
                title: nome,
                index: 0,
                gridProperties: { rowCount: 2000, columnCount: CABECALHO.length, frozenRowCount: 1 }
            });
            console.log('• Aba "' + nome + '" criada (as outras abas não foram mexidas)');
        }
    }

    const atual = await lerCabecalho(aba);
    const faltando = CABECALHO.filter(function (c) { return !atual.includes(c); });

    if (faltando.length) {
        const linhas = atual.length ? await aba.getRows({ limit: 1 }) : [];
        if (atual.length && linhas.length) {
            console.error('A aba "' + nome + '" já tem dados e faltam as colunas: ' + faltando.join(', '));
            console.error('Renomeie essa aba (ex.: "Pedidos antigos") e rode o comando de novo.');
            process.exit(1);
        }
        if (aba.columnCount < CABECALHO.length) {
            await aba.resize({ rowCount: Math.max(aba.rowCount, 2000), columnCount: CABECALHO.length });
        }
        await aba.setHeaderRow(CABECALHO);
    }

    await aba.updateProperties({ gridProperties: { frozenRowCount: 1 } });
    await aba.loadCells('A1:' + letra(CABECALHO.length - 1) + '1');
    CABECALHO.forEach(function (_, i) {
        const celula = aba.getCell(0, i);
        celula.textFormat = { bold: true, foregroundColor: ROSADO };
        celula.backgroundColor = TIJOLO;
    });
    await aba.saveUpdatedCells();
    console.log('✓ Aba "' + nome + '" com as ' + CABECALHO.length + ' colunas');
    return aba;
}

async function prepararResumo(doc) {
    const pedidos = "'" + config.google.aba + "'";
    const col = function (nomeColuna) {
        const l = letra(CABECALHO.indexOf(nomeColuna));
        return pedidos + '!' + l + ':' + l;
    };
    const status = col('Status');

    const linhas = [
        ['Resumo de vendas', '', ''],
        ['Pedidos pagos', '=COUNTIF(' + status + ',"PAGO")', ''],
        ['Ingressos vendidos', '=SUMIF(' + status + ',"PAGO",' + col('Quantidade') + ')', ''],
        ['Arrecadado (R$)', '=SUMIF(' + status + ',"PAGO",' + col('Valor_Total') + ')', ''],
        ['Aguardando pagamento', '=COUNTIF(' + status + ',"PENDENTE")', ''],
        ['Recusados / expirados / cancelados', '=COUNTIF(' + status + ',"RECUSADO")+COUNTIF(' + status + ',"EXPIRADO")+COUNTIF(' + status + ',"CANCELADO")', ''],
        ['Reembolsados', '=COUNTIF(' + status + ',"REEMBOLSADO")', ''],
        ['E-mails com erro (reenviar)', '=COUNTIF(' + col('Email_Enviado') + ',"ERRO")', ''],
        ['', '', ''],
        ['Vendas por ingresso', '', ''],
        ['Ingresso', 'Ingressos', 'Valor (R$)']
    ];

    // uma linha por ingresso do catálogo (mesmo layout da planilha-modelo .xlsx)
    const inicio = linhas.length + 1;
    listarProdutos().forEach(function (produto, k) {
        const r = inicio + k;
        linhas.push([
            produto.setor + ' · ' + produto.tipo + ' (' + produto.lote + ')',
            '=SUMIFS(' + col('Quantidade') + ',' + status + ',"PAGO",' + col('Produto') + ',A' + r + ')',
            '=SUMIFS(' + col('Valor_Total') + ',' + status + ',"PAGO",' + col('Produto') + ',A' + r + ')'
        ]);
    });
    const fim = linhas.length;
    linhas.push(['Total', '=SUM(B' + inicio + ':B' + fim + ')', '=SUM(C' + inicio + ':C' + fim + ')']);

    let resumo = doc.sheetsByTitle.Resumo;
    if (!resumo) {
        resumo = await doc.addSheet({ title: 'Resumo', gridProperties: { rowCount: 60, columnCount: 6 } });
    }

    // limpa sobras de uma versão anterior com mais ingressos
    const alcance = 'A1:C' + Math.max(linhas.length + 10, 40);
    await resumo.loadCells(alcance);
    for (let r = 0; r < Math.max(linhas.length + 10, 40); r++) {
        for (let c = 0; c < 3; c++) {
            const celula = resumo.getCell(r, c);
            const valor = linhas[r] ? linhas[r][c] : '';
            if (String(valor).startsWith('=')) celula.formula = valor;
            else if (celula.value !== null || valor !== '') celula.value = valor;

            if (r === 0) celula.textFormat = { bold: true, fontSize: 14, foregroundColor: TIJOLO };
            else if (r === 9) celula.textFormat = { bold: true, fontSize: 11, foregroundColor: TIJOLO };
            else if (r === 10) {
                celula.textFormat = { bold: true, foregroundColor: ROSADO };
                celula.backgroundColor = TERRACOTA;
            } else if (r === linhas.length - 1 || (c === 1 && r > 0 && r < 8)) {
                celula.textFormat = { bold: true, foregroundColor: TIJOLO };
            }
            if ((r === 3 || (r >= inicio - 1 && r < linhas.length)) && (r === 3 || c === 2)) {
                celula.numberFormat = { type: 'CURRENCY', pattern: '"R$" #,##0.00' };
            }
        }
    }
    await resumo.saveUpdatedCells();
    console.log('✓ Aba "Resumo" com os totais (' + listarProdutos().length + ' tipos de ingresso)');
}

async function main() {
    const doc = await abrirPlanilha();
    console.log('Planilha: "' + doc.title + '" (credencial: ' + config.google.email + ')\n');

    await prepararPedidos(doc);
    await prepararResumo(doc);

    console.log('\nPronto. Confira em https://docs.google.com/spreadsheets/d/' + config.google.planilhaId);
    console.log('Próximo passo: npm run planilha:testar');
}

main().catch(explicarErro);
