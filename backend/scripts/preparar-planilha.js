/* =============================================================
   Prepara a planilha de controle (npm run planilha:preparar)
   - aba "Pedidos": cria se não existir, completa o cabeçalho e dá o visual
     (cores de status, linhas alternadas) — os pedidos não são tocados
   - aba "Acompanhamento": o painel de vendas, todo por fórmula; é apagada
     e refeita a cada rodada
   - a antiga aba "Resumo" foi absorvida pelo painel e é removida
   Funciona em planilha nova, na planilha-modelo .xlsx importada ou
   numa planilha que já tem outras abas. Não apaga pedidos.
   ============================================================= */
const { config, abrirPlanilha, explicarErro } = require('./conexaoPlanilha');
const { CABECALHO } = require('../src/services/sheetsService');
const { listarProdutos, descreverProduto, formatarReais, evento } = require('../src/catalogo');

const cor = function (hex) {
    return {
        red: parseInt(hex.slice(1, 3), 16) / 255,
        green: parseInt(hex.slice(3, 5), 16) / 255,
        blue: parseInt(hex.slice(5, 7), 16) / 255
    };
};

// paleta Mulheres Plenas
const TIJOLO = cor('#85351E');
const TERRACOTA = cor('#B8684F');
const NUDE = cor('#E0B8A6');
const ROSADO = cor('#F5E8E2');
const ROSADO_CLARO = cor('#FBF5F2');
const BRANCO = cor('#FFFFFF');
const PRETO = cor('#000000');
const TEXTO = cor('#3E1A10');
const ROTULO = cor('#8A6A5E');

// cores de status
const VERDE = cor('#E3F1E4');
const VERDE_TEXTO = cor('#1E6B34');
const AMBAR = cor('#FDF0D5');
const AMBAR_TEXTO = cor('#8A5A00');
const CINZA = cor('#EEEEEE');
const CINZA_TEXTO = cor('#5F5F5F');
const VERMELHO = cor('#F8E0DC');
const VERMELHO_TEXTO = cor('#A12A1A');

const REAIS = { type: 'CURRENCY', pattern: '"R$" #,##0.00' };
const PORCENTO = { type: 'PERCENT', pattern: '0%' };
const PORCENTO_FINO = { type: 'PERCENT', pattern: '0.00%' };

const FONTE = 'DM Sans';       // a do texto do site
const FONTE_TITULO = 'Fraunces';  // a dos títulos do site
const LOGO = 'https://evangelhoplenoparagominas.com.br/assets/imagens/marca/mp-horizontal-claro.png';
const FUSO = 'America/Belem';  // Paragominas; a planilha nasceu em Los Angeles
const VAGAS = 350;  // as mesmas "apenas 350 vagas" da landing (index.html)

/* Tarifas do Mercado Pago (Checkout, recebimento "na hora"), conferidas no
   painel em 25/09/2026 — Seu negócio > Taxas e parcelas > Checkout.
   Cartão só à vista (MERCADOPAGO_PARCELAS_MAX = 1): 2,49% de processamento +
   2,49% de recebimento. Mudou a tarifa ou o prazo? Troque aqui e rode o
   comando de novo. Reembolso total devolve a tarifa: só pedido PAGO conta. */
const TAXA_PIX = 0.0099;
const TAXA_CARTAO = 0.0498;

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

/* Nas localidades com vírgula decimal (pt_BR, es, fr, de...) o Google Sheets
   separa os argumentos da fórmula com ";" — a vírgula dá "Formula parse error"
   (#ERROR!). A API grava a fórmula como se fosse digitada, na localidade da
   planilha, então o separador tem de acompanhá-la. */
function separadorDeArgumentos(locale) {
    const decimal = (0.5).toLocaleString(String(locale || 'en_US').replace('_', '-')).charAt(1);
    return decimal === ',' ? ';' : ',';
}

// troca as vírgulas entre argumentos (fora de aspas) pelo separador da planilha
function formulaNaLocalidade(doc) {
    const sep = separadorDeArgumentos(doc.locale);
    return function (formula) { return formula.replace(/,(?=(?:[^"']*["'][^"']*["'])*[^"']*$)/g, sep); };
}

/* Opções do SPARKLINE vão numa matriz {…}. Nela a vírgula separa colunas em
   en_US, mas em pt_BR quem separa colunas é "\" (e ";" separa linhas nas
   duas). Montada aqui já no formato da planilha, sem vírgula nenhuma. */
function opcoesDoGrafico(doc, pares) {
    const coluna = separadorDeArgumentos(doc.locale) === ';' ? '\\' : ',';
    return '{' + pares.map(function (par) {
        return par.map(function (v) { return typeof v === 'number' ? v : '"' + v + '"'; }).join(coluna);
    }).join(';') + '}';
}

// 0.0498 -> "4,98%"
function formatarPorcento(taxa) {
    return (taxa * 100).toFixed(2).replace('.', ',') + '%';
}

function paraHex(c) {
    return '#' + [c.red, c.green, c.blue].map(function (v) {
        return Math.round(v * 255).toString(16).padStart(2, '0');
    }).join('').toUpperCase();
}

async function regrasCondicionais(doc, aba) {
    const info = await doc.sheetsApi.get('', {
        searchParams: { fields: 'sheets(properties.sheetId,conditionalFormats(ranges))' }
    }).json();
    const daAba = (info.sheets || []).find(function (s) { return s.properties.sheetId === aba.sheetId; }) || {};
    return daAba.conditionalFormats || [];
}

/* Visual da aba Pedidos, todo em formatação CONDICIONAL.
   A API grava cada venda INSERINDO uma linha (vendas simultâneas se apagavam
   no outro modo), e a linha inserida copia o formato da de cima: com o marrom
   direto na célula do cabeçalho, a 1ª venda nascia marrom e as seguintes
   também. Regra condicional não é copiada. E o Google estica o intervalo da
   regra quando insere linha logo abaixo dele (A1:Q1 vira A1:Q31) — por isso
   a condição é ROW()=1, e não "o intervalo da linha 1".
   As regras desta aba são todas deste script: a cada rodada saem e voltam. */
async function pintarCabecalho(doc, aba) {
    const ate = CABECALHO.length;
    await aba.repeatCell(
        { startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: ate },
        { userEnteredFormat: { backgroundColor: BRANCO, textFormat: { bold: false, foregroundColor: PRETO } } },
        'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.foregroundColor'
    );

    const pedidos = (await regrasCondicionais(doc, aba)).map(function () {
        return { deleteConditionalFormatRule: { sheetId: aba.sheetId, index: 0 } };
    });
    const regra = function (inicio, fim, formula, formato) {
        pedidos.push({
            addConditionalFormatRule: {
                index: 0,
                rule: {
                    ranges: [{ sheetId: aba.sheetId, startRowIndex: 0, startColumnIndex: inicio, endColumnIndex: fim }],
                    booleanRule: { condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: formula }] }, format: formato }
                }
            }
        });
    };
    // index 0 = prioridade máxima: a última regra adicionada vence
    const idPedido = '$' + letra(CABECALHO.indexOf('Pedido_ID'));
    regra(0, ate, '=AND(ROW()>1,ISEVEN(ROW()),' + idPedido + '1<>"")', { backgroundColor: ROSADO_CLARO });
    const colStatus = CABECALHO.indexOf('Status');
    const st = '$' + letra(colStatus) + '1';
    const status = function (formula, fundo, texto) {
        regra(colStatus, colStatus + 1, formula, { backgroundColor: fundo, textFormat: { bold: true, foregroundColor: texto } });
    };
    status('=' + st + '="PAGO"', VERDE, VERDE_TEXTO);
    status('=' + st + '="PENDENTE"', AMBAR, AMBAR_TEXTO);
    status('=OR(' + st + '="RECUSADO",' + st + '="EXPIRADO",' + st + '="CANCELADO")', CINZA, CINZA_TEXTO);
    status('=' + st + '="REEMBOLSADO"', VERMELHO, VERMELHO_TEXTO);
    const colEmail = CABECALHO.indexOf('Email_Enviado');
    regra(colEmail, colEmail + 1, '=$' + letra(colEmail) + '1="ERRO"', { backgroundColor: VERMELHO, textFormat: { bold: true, foregroundColor: VERMELHO_TEXTO } });
    regra(0, ate, '=ROW()=1', { backgroundColor: TIJOLO, textFormat: { bold: true, foregroundColor: ROSADO } });

    // as fórmulas acima foram escritas com vírgula: passam para a localidade
    const f = formulaNaLocalidade(doc);
    pedidos.forEach(function (p) {
        const c = p.addConditionalFormatRule && p.addConditionalFormatRule.rule.booleanRule.condition.values[0];
        if (c) c.userEnteredValue = f(c.userEnteredValue);
    });
    await doc.sheetsApi.post(':batchUpdate', { json: { requests: pedidos } });
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
    await pintarCabecalho(doc, aba);

    // formato direto das linhas de pedido: fundo branco (o alternado vem da
    // regra condicional), fonte do site, uma linha por pedido (o Pix copia e
    // cola é enorme), dinheiro em R$
    const ate = CABECALHO.length;
    const pedidos = [{
        repeatCell: {
            range: { sheetId: aba.sheetId, startRowIndex: 1, endRowIndex: aba.rowCount, startColumnIndex: 0, endColumnIndex: ate },
            cell: {
                userEnteredFormat: {
                    backgroundColor: BRANCO,
                    wrapStrategy: 'CLIP',
                    verticalAlignment: 'MIDDLE',
                    textFormat: { bold: false, foregroundColor: TEXTO, fontFamily: FONTE }
                }
            },
            fields: 'userEnteredFormat.backgroundColor,userEnteredFormat.wrapStrategy,userEnteredFormat.verticalAlignment,' +
                'userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.textFormat.fontFamily'
        }
    }, {
        repeatCell: {
            range: { sheetId: aba.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: ate },
            cell: { userEnteredFormat: { verticalAlignment: 'MIDDLE', textFormat: { fontFamily: FONTE } } },
            fields: 'userEnteredFormat.verticalAlignment,userEnteredFormat.textFormat.fontFamily'
        }
    }, {
        updateDimensionProperties: {
            range: { sheetId: aba.sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
            properties: { pixelSize: 32 },
            fields: 'pixelSize'
        }
    }];
    const col = function (nomeColuna) { return CABECALHO.indexOf(nomeColuna); };
    /* A partir da linha 1, cabeçalho incluído: a venda entra INSERINDO linha,
       que copia o formato da de cima — com a aba vazia, a de cima é o
       cabeçalho, e sem isto a 1ª venda (e todas as seguintes, em cadeia)
       saía com "55" em vez de "R$ 55,00". No texto do cabeçalho não muda nada. */
    const formatoDaColuna = function (nomeColuna, formato, campos) {
        pedidos.push({
            repeatCell: {
                range: { sheetId: aba.sheetId, startRowIndex: 0, endRowIndex: aba.rowCount, startColumnIndex: col(nomeColuna), endColumnIndex: col(nomeColuna) + 1 },
                cell: { userEnteredFormat: formato },
                fields: campos
            }
        });
    };
    formatoDaColuna('Valor_Total', { numberFormat: REAIS }, 'userEnteredFormat.numberFormat');
    ['Status', 'Quantidade', 'Metodo', 'Email_Enviado'].forEach(function (c) {
        formatoDaColuna(c, { horizontalAlignment: 'CENTER' }, 'userEnteredFormat.horizontalAlignment');
    });
    const larguras = {
        ID_Transação: 150, Data_Hora: 140, Nome_Cliente: 210, CPF: 110, Email: 230, Status: 115, Telefone: 115,
        Produto: 200, Quantidade: 90, Valor_Total: 95, Metodo: 75, Pedido_ID: 165, Codigos_Ingresso: 175,
        Email_Enviado: 105, Atualizado_Em: 140, Pix_Copia_Cola: 160, Link_Pagamento: 160
    };
    CABECALHO.forEach(function (c, i) {
        if (!larguras[c]) return;
        pedidos.push({
            updateDimensionProperties: {
                range: { sheetId: aba.sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
                properties: { pixelSize: larguras[c] },
                fields: 'pixelSize'
            }
        });
    });
    await doc.sheetsApi.post(':batchUpdate', { json: { requests: pedidos } });

    console.log('✓ Aba "' + nome + '" com as ' + CABECALHO.length + ' colunas (cores de status, linhas alternadas)');
    return aba;
}

/* =============================================================
   Aba "Acompanhamento": o painel de vendas
   Tudo por fórmula, lendo a aba Pedidos: atualiza sozinho e o site não grava
   nada a mais (a cota do Google fica para as vendas). A aba é apagada e
   refeita a cada rodada — por isso ninguém deve escrever nela.

   Linhas (1 = linha 1 da planilha):
     1–4    faixa tijolo: logo, título, data do evento, "atualizado em"
     6–8    cartões principais (rótulo, número, detalhe)
     10–11  números secundários
     13–14  gráfico de ingressos por dia (flutua sobre a linha 14)
     16–20  por lote · por forma de pagamento · por dia (este desce, em K:N)
     22–26  resultado líquido: bruto, taxa do Mercado Pago e líquido
     28–29  título e cabeçalho da tabela de pedidos
     30+    pedidos, mais recentes primeiro
     O:P    ocultas: dias em ordem crescente, a fonte do gráfico
   ============================================================= */
const GRAFICO = 14;  // linha onde o gráfico de ingressos por dia fica
const DADOS = 18;  // primeira linha dos blocos por lote / pagamento / dia
const LIQUIDO = 24;  // primeira linha (Pix) do bloco de resultado líquido
const TABELA = 30;
const ALTURA_GRAFICO = 240;

// grupos de colunas (índice 0 = A) de cada cartão; J fica de respiro
const CARTOES = [[0, 1], [2, 2], [3, 4], [5, 7], [8, 8], [10, 13]];

async function prepararAcompanhamento(doc) {
    const f = formulaNaLocalidade(doc);
    const P = "'" + config.google.aba + "'!";
    /* Coluna INTEIRA (F:F), nunca "da linha 2 para baixo" (F2:F). A venda
       entra inserindo linha logo abaixo do cabeçalho, e o Google empurra a
       referência junto: F2:F virava F3:F e a venda nova ficava de fora — o
       painel zerado com a venda ali na aba Pedidos. F:F não se mexe.
       O cabeçalho entra na coluna: as contas por "PAGO" não o pegam, e as
       listas o tiram com ROW()>1. */
    const c = function (nomeColuna) {
        const l = letra(CABECALHO.indexOf(nomeColuna));
        return P + l + ':' + l;
    };
    const status = c('Status');
    const pago = status + '="PAGO"';
    const temPedido = c('Pedido_ID') + '<>"",ROW(' + c('Pedido_ID') + ')>1';
    const T = TABELA;
    const D = DADOS;

    const celulas = {};   // 'A1' -> texto ou fórmula
    const formatos = {};  // 'A1' -> userEnteredFormat
    const por = function (a1, valor, formato) {
        if (valor !== undefined) celulas[a1] = valor;
        if (formato) formatos[a1] = Object.assign({}, formatos[a1] || {}, formato);
    };
    const texto = function (extra) { return Object.assign({ fontFamily: FONTE, foregroundColor: TEXTO }, extra); };
    const merges = [];
    const juntar = function (r1, c1, r2, c2) { merges.push([r1, c1, r2, c2]); };

    /* ---------- faixa do topo ---------- */
    const faixa = { backgroundColor: TIJOLO, verticalAlignment: 'MIDDLE' };
    juntar(2, 0, 3, 2);
    por('A2', '=IMAGE("' + LOGO + '",4,50,280)', Object.assign({ horizontalAlignment: 'LEFT' }, faixa));
    juntar(2, 3, 2, 8);
    por('D2', 'Painel de vendas', Object.assign({
        verticalAlignment: 'BOTTOM',
        textFormat: texto({ fontFamily: FONTE_TITULO, fontSize: 20, bold: true, foregroundColor: ROSADO })
    }, { backgroundColor: TIJOLO }));
    juntar(3, 3, 3, 8);
    por('D3', 'Conferência Mulheres Plenas  ·  ' + evento.data + '  ·  ' + evento.local, Object.assign({
        verticalAlignment: 'TOP',
        textFormat: texto({ fontSize: 10, foregroundColor: NUDE })
    }, { backgroundColor: TIJOLO }));
    juntar(2, 10, 3, 13);
    por('K2', '="Atualizado em"&CHAR(10)&TEXT(NOW(),"dd/mm/yyyy  HH:mm")', Object.assign({
        horizontalAlignment: 'RIGHT',
        wrapStrategy: 'WRAP',
        textFormat: texto({ fontSize: 9, foregroundColor: NUDE })
    }, faixa));

    /* ---------- números ---------- */
    // secundários primeiro: os cartões usam A11 (pagos) e C11 (total)
    const secundarios = [
        ['Pedidos pagos', '=COUNTIF(' + status + ',"PAGO")'],
        ['Pedidos no total', '=COUNTIF(' + c('Pedido_ID') + ',"?*")-1'],  // -1: o cabeçalho
        ['Não concluídos', '=COUNTIF(' + status + ',"RECUSADO")+COUNTIF(' + status + ',"EXPIRADO")+COUNTIF(' + status + ',"CANCELADO")'],
        ['Reembolsados', '=COUNTIF(' + status + ',"REEMBOLSADO")'],
        ['E-mails com erro', '=COUNTIF(' + c('Email_Enviado') + ',"ERRO")'],
        ['Melhor dia', '=IFERROR(TEXT(INDEX(SORT(FILTER(K' + D + ':K,K' + D + ':K<>""),FILTER(M' + D + ':M,K' + D + ':K<>""),FALSE),1),"dd/mm")&"  ·  "&MAX(M' + D + ':M)&" ingressos","—")']
    ];
    const hoje = 'SUMIFS(' + c('Quantidade') + ',' + status + ',"PAGO",' + c('Data_Hora') + ',TEXT(TODAY(),"dd/mm/yyyy")&"*")';
    const ontem = 'SUMIFS(' + c('Quantidade') + ',' + status + ',"PAGO",' + c('Data_Hora') + ',TEXT(TODAY()-1,"dd/mm/yyyy")&"*")';
    const principais = [
        ['Arrecadado (bruto)', '=SUMIF(' + status + ',"PAGO",' + c('Valor_Total') + ')',
            '="líquido  "&TEXT(E' + (LIQUIDO + 2) + ',"R$ #,##0.00")&"  ·  taxa  "&TEXT(D' + (LIQUIDO + 2) + ',"R$ #,##0.00")', REAIS],
        ['Ingressos vendidos', '=SUMIF(' + status + ',"PAGO",' + c('Quantidade') + ')', '="de ' + VAGAS + ' vagas  ·  "&TEXT(C7/' + VAGAS + ',"0%")'],
        // sem nenhum pago o FILTER dá erro, e o COUNTUNIQUE contaria o erro como 1
        ['Pessoas', '=IF(A11=0,0,COUNTUNIQUE(FILTER(' + c('CPF') + ',' + pago + ')))', 'que já pagaram (por CPF)'],
        ['Aguardando pagamento', '=COUNTIF(' + status + ',"PENDENTE")', 'Pix ou cartão em aberto'],
        ['Conversão', '=IFERROR(A11/C11,0)', 'dos pedidos', PORCENTO],
        /* era um mini-gráfico (SPARKLINE), que não mostra o dia de cada coluna:
           o gráfico com os dias fica logo abaixo dos cartões */
        ['Ingressos hoje', '=' + hoje, '="ontem: "&' + ontem + '&IF(' + ontem + '=1," ingresso"," ingressos")']
    ];

    CARTOES.forEach(function (grupo, i) {
        const [de, ate] = grupo;
        const L = letra(de);
        const [rotulo, valor, detalhe, formatoNumero] = principais[i];
        const destaque = i === 0;  // "Arrecadado" é o cartão escuro
        const fundo = destaque ? TIJOLO : ROSADO;
        [6, 7, 8].forEach(function (r) { if (ate > de) juntar(r, de, r, ate); });
        por(L + '6', rotulo, {
            backgroundColor: fundo, horizontalAlignment: 'CENTER', verticalAlignment: 'BOTTOM',
            textFormat: texto({ fontSize: 9, bold: true, foregroundColor: destaque ? NUDE : ROTULO })
        });
        por(L + '7', valor, Object.assign({
            backgroundColor: fundo, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
            textFormat: texto({ fontFamily: FONTE_TITULO, fontSize: 22, bold: true, foregroundColor: destaque ? BRANCO : TIJOLO })
        }, formatoNumero ? { numberFormat: formatoNumero } : {}));
        por(L + '8', detalhe, {
            backgroundColor: fundo, horizontalAlignment: 'CENTER', verticalAlignment: 'TOP',
            textFormat: texto({ fontSize: 9, italic: true, foregroundColor: destaque ? NUDE : ROTULO })
        });

        const [rotulo2, valor2] = secundarios[i];
        if (ate > de) { juntar(10, de, 10, ate); juntar(11, de, 11, ate); }
        por(L + '10', rotulo2, {
            horizontalAlignment: 'CENTER', verticalAlignment: 'BOTTOM',
            textFormat: texto({ fontSize: 8, bold: true, foregroundColor: ROTULO })
        });
        por(L + '11', valor2, {
            horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
            textFormat: texto({ fontSize: 13, bold: true, foregroundColor: TERRACOTA })
        });
    });

    /* ---------- blocos: por lote · por forma de pagamento · por dia ---------- */
    const tituloDeBloco = {
        verticalAlignment: 'BOTTOM',
        textFormat: texto({ fontFamily: FONTE_TITULO, fontSize: 12, bold: true, foregroundColor: TIJOLO })
    };
    const cabecalho = {
        backgroundColor: TERRACOTA, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
        textFormat: texto({ bold: true, fontSize: 9, foregroundColor: BRANCO })
    };
    const celulaDeDado = function (extra) {
        return Object.assign({ verticalAlignment: 'MIDDLE', textFormat: texto({ fontSize: 10 }) }, extra);
    };

    /* por lote (o que era a aba Resumo) — só em A:C. A coluna D fica vazia de
       propósito: colada na forma de pagamento, as duas faixas de cabeçalho
       viravam uma tabela só. */
    juntar(D - 2, 0, D - 2, 2);
    por('A' + (D - 2), 'Vendas por lote', tituloDeBloco);
    por('A' + (D - 1), 'Lote', cabecalho); por('B' + (D - 1), 'Ingressos', cabecalho); por('C' + (D - 1), 'Valor', cabecalho);
    const produtos = listarProdutos();
    produtos.forEach(function (produto, k) {
        const r = D + k;
        const doLote = status + ',"PAGO",' + c('Produto') + ',"' + descreverProduto(produto) + '"';
        por('A' + r, produto.lote + '  ·  ' + formatarReais(produto.precoUnitario), celulaDeDado({ horizontalAlignment: 'CENTER' }));
        por('B' + r, '=SUMIFS(' + c('Quantidade') + ',' + doLote + ')', celulaDeDado({ horizontalAlignment: 'CENTER' }));
        por('C' + r, '=SUMIFS(' + c('Valor_Total') + ',' + doLote + ')', celulaDeDado({ horizontalAlignment: 'CENTER', numberFormat: REAIS }));
    });
    const total = D + produtos.length;
    const linhaTotal = { backgroundColor: ROSADO, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', textFormat: texto({ bold: true, foregroundColor: TIJOLO }) };
    por('A' + total, 'Total', linhaTotal);
    por('B' + total, '=SUM(B' + D + ':B' + (total - 1) + ')', linhaTotal);
    por('C' + total, '=SUM(C' + D + ':C' + (total - 1) + ')', Object.assign({ numberFormat: REAIS }, linhaTotal));

    // por forma de pagamento
    juntar(D - 2, 4, D - 2, 8);
    por('E' + (D - 2), 'Forma de pagamento', tituloDeBloco);
    ['Forma', 'Pedidos', 'Valor', 'Participação', '%'].forEach(function (t, i) { por(letra(4 + i) + (D - 1), t, cabecalho); });
    [['Pix', 'pix'], ['Cartão', 'cartao']].forEach(function (m, k) {
        const r = D + k;
        const metodo = status + ',"PAGO",' + c('Metodo') + ',"' + m[1] + '"';
        por('E' + r, m[0], celulaDeDado({ horizontalAlignment: 'CENTER', textFormat: texto({ bold: true }) }));
        por('F' + r, '=COUNTIFS(' + metodo + ')', celulaDeDado({ horizontalAlignment: 'CENTER' }));
        por('G' + r, '=SUMIFS(' + c('Valor_Total') + ',' + metodo + ')', celulaDeDado({ numberFormat: REAIS }));
        por('H' + r, '=SPARKLINE(I' + r + ',' +
            opcoesDoGrafico(doc, [['charttype', 'bar'], ['max', 1], ['color1', paraHex(k === 0 ? TIJOLO : NUDE)]]) + ')', celulaDeDado({}));
        por('I' + r, '=IFERROR(G' + r + '/SUM(G$' + D + ':G$' + (D + 1) + '),0)',
            celulaDeDado({ horizontalAlignment: 'CENTER', numberFormat: PORCENTO, textFormat: texto({ bold: true, foregroundColor: TIJOLO }) }));
    });

    // por dia (desce ao lado da tabela de pedidos)
    juntar(D - 2, 10, D - 2, 13);
    por('K' + (D - 2), 'Vendas por dia', tituloDeBloco);
    ['Dia', 'Pedidos', 'Ingressos', 'Valor'].forEach(function (t, i) { por(letra(10 + i) + (D - 1), t, cabecalho); });

    /* ---------- gráfico de ingressos por dia ----------
       Fonte nas colunas O:P, ocultas: o dia como texto "dd/mm" (vira o rótulo
       embaixo da coluna) e os ingressos, do dia mais antigo para o mais novo. */
    juntar(GRAFICO - 1, 0, GRAFICO - 1, 13);
    por('A' + (GRAFICO - 1), 'Ingressos vendidos por dia', tituloDeBloco);
    const temDia = 'K' + D + ':K<>""';
    por('O' + D, '=IFERROR(ARRAYFORMULA(TEXT(SORT(FILTER(K' + D + ':K,' + temDia + ')),"dd/mm")),"")');
    por('P' + D, '=IFERROR(SORT(FILTER(M' + D + ':M,' + temDia + '),FILTER(K' + D + ':K,' + temDia + '),TRUE),"")');
    por('K' + D, '=IFERROR(LET(d,UNIQUE(FILTER(LEFT(' + c('Data_Hora') + ',10),' + pago + ')),' +
        'SORT(ARRAYFORMULA(DATE(RIGHT(d,4),MID(d,4,2),LEFT(d,2))),1,FALSE)),"")');
    /* MAP e não ARRAYFORMULA: dentro de ARRAYFORMULA o SUMIFS não vai linha a
       linha e devolvia o total de um dia só para todos. */
    const porDia = function (conta) { return '=MAP(K' + D + ':K,LAMBDA(d,IF(d="","",' + conta + ')))'; };
    const doDia = status + ',"PAGO",' + c('Data_Hora') + ',TEXT(d,"dd/mm/yyyy")&"*"';
    por('L' + D, porDia('COUNTIFS(' + doDia + ')'));
    por('M' + D, porDia('SUMIFS(' + c('Quantidade') + ',' + doDia + ')'));
    por('N' + D, porDia('SUMIFS(' + c('Valor_Total') + ',' + doDia + ')'));

    /* ---------- resultado líquido: o que o Mercado Pago fica ----------
       A tarifa é calculada pedido a pedido e arredondada no centavo, como o
       Mercado Pago faz (R$ 55 no Pix = R$ 0,54 de tarifa, não R$ 0,5445).
       A porcentagem fica numa célula e a conta a referencia: escrever 0.0099
       dentro da fórmula quebraria na planilha em pt_BR (vírgula decimal). */
    const L = LIQUIDO;
    juntar(L - 2, 0, L - 2, 8);
    por('A' + (L - 2), 'Resultado líquido  ·  taxas do Mercado Pago', tituloDeBloco);
    ['Forma', 'Taxa do Mercado Pago', 'Bruto (vendido)', 'Taxa (R$)', 'Líquido'].forEach(function (t, i) { por(letra(i) + (L - 1), t, cabecalho); });
    juntar(L - 1, 5, L - 1, 8);
    por('F' + (L - 1), 'Como ler', cabecalho);
    [['Pix', 'pix', TAXA_PIX], ['Cartão (à vista)', 'cartao', TAXA_CARTAO]].forEach(function (m, k) {
        const r = L + k;
        const doMetodo = status + '="PAGO",' + c('Metodo') + '="' + m[1] + '"';
        por('A' + r, m[0], celulaDeDado({ horizontalAlignment: 'CENTER', textFormat: texto({ bold: true }) }));
        por('B' + r, m[2], celulaDeDado({ horizontalAlignment: 'CENTER', numberFormat: PORCENTO_FINO, textFormat: texto({ bold: true, foregroundColor: TIJOLO }) }));
        por('C' + r, '=SUMIFS(' + c('Valor_Total') + ',' + status + ',"PAGO",' + c('Metodo') + ',"' + m[1] + '")', celulaDeDado({ horizontalAlignment: 'CENTER', numberFormat: REAIS }));
        por('D' + r, '=IFERROR(SUM(FILTER(ROUND(' + c('Valor_Total') + '*B' + r + ',2),' + doMetodo + ')),0)',
            celulaDeDado({ horizontalAlignment: 'CENTER', numberFormat: REAIS, textFormat: texto({ foregroundColor: VERMELHO_TEXTO }) }));
        por('E' + r, '=C' + r + '-D' + r, celulaDeDado({ horizontalAlignment: 'CENTER', numberFormat: REAIS, textFormat: texto({ bold: true, foregroundColor: VERDE_TEXTO }) }));
    });
    const tl = L + 2;
    por('A' + tl, 'Total', linhaTotal);
    // no total, a taxa que de fato saiu sobre tudo o que foi vendido (Pix e cartão juntos)
    por('B' + tl, '=IFERROR(D' + tl + '/C' + tl + ',0)', Object.assign({ numberFormat: PORCENTO_FINO }, linhaTotal));
    por('C' + tl, '=C' + L + '+C' + (L + 1), Object.assign({ numberFormat: REAIS }, linhaTotal));
    por('D' + tl, '=D' + L + '+D' + (L + 1), Object.assign({ numberFormat: REAIS }, linhaTotal));
    por('E' + tl, '=C' + tl + '-D' + tl, Object.assign({ numberFormat: REAIS }, linhaTotal));
    juntar(L, 5, tl, 8);
    por('F' + L, 'Bruto é o que as pessoas pagaram. O Mercado Pago desconta a taxa de cada venda ' +
        '(Pix ' + formatarPorcento(TAXA_PIX) + ', cartão à vista ' + formatarPorcento(TAXA_CARTAO) + ', dinheiro na hora) ' +
        'e o Líquido é o que cai na conta. Na linha Total, a porcentagem é a taxa média sobre tudo o que foi vendido. ' +
        'Pedido reembolsado não entra: na devolução total o Mercado Pago devolve a taxa.', {
        verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP', backgroundColor: ROSADO_CLARO,
        textFormat: texto({ fontSize: 9, italic: true, foregroundColor: ROTULO })
    });

    /* ---------- tabela de pedidos ---------- */
    juntar(T - 2, 0, T - 2, 8);
    por('A' + (T - 2), 'Pedidos  ·  mais recentes primeiro', tituloDeBloco);
    ['Data e hora', 'Nome', 'E-mail', 'Status', 'Pagamento', 'Qtd', 'Valor', 'Código do ingresso', 'Pedido da pessoa']
        .forEach(function (t, i) { por(letra(i) + (T - 1), t, cabecalho); });
    // os pedidos entram sempre embaixo na aba Pedidos: linha maior = mais recente
    const maisRecentes = function (coluna) {
        return 'SORT(FILTER(' + c(coluna) + ',' + temPedido + '),FILTER(ROW(' + c('Pedido_ID') + '),' + temPedido + '),FALSE)';
    };
    const vazioSeErro = function (formula) { return '=IFERROR(' + formula + ',"")'; };
    // Data_Hora é texto "dd/mm/aaaa hh:mm:ss": vira data de verdade (ordena e formata)
    por('A' + T, vazioSeErro('LET(t,' + maisRecentes('Data_Hora') + ',ARRAYFORMULA(IF(t="","",' +
        'DATE(MID(t,7,4),MID(t,4,2),LEFT(t,2))+TIME(MID(t,12,2),MID(t,15,2),MID(t,18,2)))))'));
    por('B' + T, vazioSeErro(maisRecentes('Nome_Cliente')));
    por('C' + T, vazioSeErro(maisRecentes('Email')));
    por('D' + T, vazioSeErro(maisRecentes('Status')));
    por('E' + T, vazioSeErro('LET(m,' + maisRecentes('Metodo') + ',ARRAYFORMULA(IF(m="pix","Pix",IF(m="cartao","Cartão",m))))'));
    por('F' + T, vazioSeErro(maisRecentes('Quantidade')));
    por('G' + T, vazioSeErro(maisRecentes('Valor_Total')));
    por('H' + T, vazioSeErro(maisRecentes('Codigos_Ingresso')));
    /* "2 de 2" = o 2º pedido deste e-mail, de 2 no total. Um número solto
       ("2") confundia: parecia que a linha tinha dois pedidos. */
    por('I' + T, '=MAP(C' + T + ':C,A' + T + ':A,LAMBDA(e,quando,IF(e="","",' +
        'COUNTIFS(C' + T + ':C,e,A' + T + ':A,"<="&quando)&" de "&COUNTIF(C' + T + ':C,e))))');

    /* ---------- monta a aba ---------- */
    /* A nova nasce ANTES de a antiga sair: com a aba Pedidos oculta, o
       Acompanhamento é a única aba visível e o Google recusa apagá-la. */
    const antiga = doc.sheetsByTitle.Acompanhamento;
    let aba = await doc.addSheet({
        title: antiga ? 'Acompanhamento (novo)' : 'Acompanhamento',
        index: 0,  // é a primeira coisa que se vê ao abrir a planilha
        gridProperties: { rowCount: 2000, columnCount: 16, hideGridlines: true },
        tabColor: TIJOLO
    });
    if (antiga) {
        await antiga.delete();
        await aba.updateProperties({ title: 'Acompanhamento', index: 0 });
    }

    const antes = [];  // estrutura: vai antes de escrever as células
    antes.push({
        repeatCell: {
            range: { sheetId: aba.sheetId },
            cell: { userEnteredFormat: { textFormat: { fontFamily: FONTE, foregroundColor: TEXTO }, verticalAlignment: 'MIDDLE' } },
            fields: 'userEnteredFormat.textFormat.fontFamily,userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.verticalAlignment'
        }
    });
    // faixa do topo inteira em tijolo (inclusive a coluna de respiro)
    antes.push({
        repeatCell: {
            range: { sheetId: aba.sheetId, startRowIndex: 0, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 14 },
            cell: { userEnteredFormat: { backgroundColor: TIJOLO } },
            fields: 'userEnteredFormat.backgroundColor'
        }
    });
    merges.forEach(function ([r1, c1, r2, c2]) {
        antes.push({
            mergeCells: {
                range: { sheetId: aba.sheetId, startRowIndex: r1 - 1, endRowIndex: r2, startColumnIndex: c1, endColumnIndex: c2 + 1 },
                mergeType: 'MERGE_ALL'
            }
        });
    });
    const larguras = [135, 200, 230, 120, 100, 70, 100, 175, 110, 24, 100, 75, 85, 100];
    larguras.forEach(function (px, i) {
        antes.push({
            updateDimensionProperties: {
                range: { sheetId: aba.sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
                properties: { pixelSize: px },
                fields: 'pixelSize'
            }
        });
    });
    const alturas = { 1: 12, 2: 46, 3: 30, 4: 12, 5: 16, 6: 26, 7: 46, 8: 24, 9: 10, 10: 20, 11: 26, 12: 14 };
    alturas[GRAFICO - 1] = 30;
    alturas[GRAFICO] = ALTURA_GRAFICO;
    alturas[GRAFICO + 1] = 10;
    [D, LIQUIDO, TABELA].forEach(function (r) {
        alturas[r - 3] = 16;  // respiro
        alturas[r - 2] = 30;  // título do bloco
        alturas[r - 1] = 26;  // cabeçalho
    });
    [0, 1, 2].forEach(function (k) { alturas[LIQUIDO + k] = 30; });
    // as colunas O:P só alimentam o gráfico
    antes.push({
        updateDimensionProperties: {
            range: { sheetId: aba.sheetId, dimension: 'COLUMNS', startIndex: 14, endIndex: 16 },
            properties: { hiddenByUser: true },
            fields: 'hiddenByUser'
        }
    });
    Object.keys(alturas).forEach(function (r) {
        antes.push({
            updateDimensionProperties: {
                range: { sheetId: aba.sheetId, dimension: 'ROWS', startIndex: r - 1, endIndex: Number(r) },
                properties: { pixelSize: alturas[r] },
                fields: 'pixelSize'
            }
        });
    });
    // linhas de dados um pouco mais altas, para respirar
    antes.push({
        updateDimensionProperties: {
            range: { sheetId: aba.sheetId, dimension: 'ROWS', startIndex: D - 1, endIndex: total },
            properties: { pixelSize: 26 },
            fields: 'pixelSize'
        }
    }, {
        updateDimensionProperties: {
            range: { sheetId: aba.sheetId, dimension: 'ROWS', startIndex: T - 1, endIndex: aba.rowCount },
            properties: { pixelSize: 26 },
            fields: 'pixelSize'
        }
    });
    await doc.sheetsApi.post(':batchUpdate', { json: { requests: antes } });

    // células: valor + formato, uma requisição só
    const dados = Object.keys(Object.assign({}, celulas, formatos)).map(function (a1) {
        const col = a1.charCodeAt(0) - 65;
        const row = Number(a1.slice(1)) - 1;
        const valor = celulas[a1];
        const celula = {};
        if (valor !== undefined) {
            celula.userEnteredValue = typeof valor === 'number' ? { numberValue: valor }
                : String(valor).startsWith('=') ? { formulaValue: f(valor) } : { stringValue: valor };
        }
        if (formatos[a1]) celula.userEnteredFormat = formatos[a1];
        return {
            updateCells: {
                start: { sheetId: aba.sheetId, rowIndex: row, columnIndex: col },
                rows: [{ values: [celula] }],
                fields: [valor !== undefined ? 'userEnteredValue' : null, formatos[a1] ? 'userEnteredFormat' : null].filter(Boolean).join(',')
            }
        };
    });

    // formatos das colunas que as fórmulas preenchem para baixo
    const coluna = function (inicio, colunaIdx, formato, campos) {
        dados.push({
            repeatCell: {
                range: { sheetId: aba.sheetId, startRowIndex: inicio - 1, endRowIndex: aba.rowCount, startColumnIndex: colunaIdx, endColumnIndex: colunaIdx + 1 },
                cell: { userEnteredFormat: formato },
                fields: campos
            }
        });
    };
    coluna(T, 0, { numberFormat: { type: 'DATE_TIME', pattern: 'dd/mm/yyyy  hh:mm' } }, 'userEnteredFormat.numberFormat');
    coluna(T, 6, { numberFormat: REAIS }, 'userEnteredFormat.numberFormat');
    coluna(T, 7, { textFormat: { fontFamily: 'Roboto Mono', fontSize: 9, foregroundColor: TEXTO } }, 'userEnteredFormat.textFormat');
    coluna(D, 10, { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' } }, 'userEnteredFormat.numberFormat');
    coluna(D, 13, { numberFormat: REAIS }, 'userEnteredFormat.numberFormat');
    [[T, 0], [T, 3], [T, 4], [T, 5], [T, 8], [D, 10], [D, 11], [D, 12]].forEach(function ([inicio, col]) {
        coluna(inicio, col, { horizontalAlignment: 'CENTER' }, 'userEnteredFormat.horizontalAlignment');
    });
    coluna(T, 1, { textFormat: { fontFamily: FONTE, bold: true, foregroundColor: TEXTO } }, 'userEnteredFormat.textFormat');
    coluna(T, 2, { wrapStrategy: 'CLIP' }, 'userEnteredFormat.wrapStrategy');

    /* regras condicionais — index 0 = prioridade máxima, então as mais
       gerais (linhas alternadas) entram primeiro e as de status por cima */
    // sem r2, a regra vale até o fim da aba (as listas que descem)
    const regra = function (r1, c1, c2, formula, formato, r2) {
        const faixaDaRegra = { sheetId: aba.sheetId, startRowIndex: r1 - 1, startColumnIndex: c1, endColumnIndex: c2 + 1 };
        if (r2) faixaDaRegra.endRowIndex = r2;
        dados.push({
            addConditionalFormatRule: {
                index: 0,
                rule: {
                    ranges: [faixaDaRegra],
                    booleanRule: { condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: f(formula) }] }, format: formato }
                }
            }
        });
    };
    regra(T, 0, 8, '=AND($C' + T + '<>"",ISEVEN(ROW()))', { backgroundColor: ROSADO_CLARO });
    regra(D, 10, 13, '=AND($K' + D + '<>"",ISODD(ROW()))', { backgroundColor: ROSADO_CLARO });
    const corDoStatus = function (condicao, fundo, textoCor) {
        regra(T, 3, 3, condicao, { backgroundColor: fundo, textFormat: { bold: true, foregroundColor: textoCor } });
    };
    const s = '$D' + T;
    corDoStatus('=' + s + '="PAGO"', VERDE, VERDE_TEXTO);
    corDoStatus('=' + s + '="PENDENTE"', AMBAR, AMBAR_TEXTO);
    corDoStatus('=OR(' + s + '="RECUSADO",' + s + '="EXPIRADO",' + s + '="CANCELADO")', CINZA, CINZA_TEXTO);
    corDoStatus('=' + s + '="REEMBOLSADO"', VERMELHO, VERMELHO_TEXTO);
    // a mesma pessoa com mais de um pedido fica em destaque
    regra(T, 8, 8, '=AND($I' + T + '<>"",RIGHT($I' + T + ',4)<>"de 1")', { backgroundColor: AMBAR, textFormat: { bold: true, foregroundColor: AMBAR_TEXTO } });
    // e-mail com erro: o número fica vermelho (é para agir)
    regra(11, 8, 8, '=$I$11>0', { backgroundColor: VERMELHO, textFormat: { bold: true, foregroundColor: VERMELHO_TEXTO } }, 11);

    // respiro branco entre os cartões, que senão viram uma faixa só
    const respiro = { style: 'SOLID_THICK', color: BRANCO };
    CARTOES.forEach(function ([de, ate]) {
        dados.push({
            updateBorders: {
                range: { sheetId: aba.sheetId, startRowIndex: 5, endRowIndex: 8, startColumnIndex: de, endColumnIndex: ate + 1 },
                left: respiro, right: respiro
            }
        });
    });

    // o gráfico: colunas tijolo, o dia embaixo e o número em cima de cada coluna
    const fonteDoGrafico = function (colunaIdx) {
        return { sourceRange: { sources: [{ sheetId: aba.sheetId, startRowIndex: D - 1, endRowIndex: aba.rowCount, startColumnIndex: colunaIdx, endColumnIndex: colunaIdx + 1 }] } };
    };
    const rotuloDoEixo = { fontFamily: FONTE, fontSize: 9, foregroundColorStyle: { rgbColor: ROTULO } };
    const specDoGrafico = {
        hiddenDimensionStrategy: 'SHOW_ALL',  // a fonte está em colunas ocultas
        fontName: FONTE,
        backgroundColorStyle: { rgbColor: BRANCO },
        basicChart: {
            chartType: 'COLUMN',
            legendPosition: 'NO_LEGEND',
            axis: [{ position: 'BOTTOM_AXIS', format: rotuloDoEixo }, { position: 'LEFT_AXIS', format: rotuloDoEixo }],
            domains: [{ domain: fonteDoGrafico(14) }],
            series: [{
                series: fonteDoGrafico(15),
                targetAxis: 'LEFT_AXIS',
                colorStyle: { rgbColor: TIJOLO },
                dataLabel: { type: 'DATA', placement: 'OUTSIDE_END', textFormat: { fontFamily: FONTE, fontSize: 9, bold: true, foregroundColorStyle: { rgbColor: TIJOLO } } }
            }],
            headerCount: 0
        }
    };
    dados.push({
        addChart: {
            chart: {
                spec: specDoGrafico,
                position: {
                    overlayPosition: {
                        anchorCell: { sheetId: aba.sheetId, rowIndex: GRAFICO - 1, columnIndex: 0 },
                        offsetXPixels: 0,
                        offsetYPixels: 4,
                        widthPixels: larguras.reduce(function (s, px) { return s + px; }, 0),
                        heightPixels: ALTURA_GRAFICO - 8
                    }
                }
            }
        }
    });

    const resposta = await doc.sheetsApi.post(':batchUpdate', { json: { requests: dados } }).json();

    /* No addChart o Google aceita o gráfico mas descarta cor, rótulos e fonte
       dos eixos (as colunas saíam azuis, sem número). No updateChartSpec,
       com o gráfico já criado, eles ficam. */
    const criado = (resposta.replies || []).find(function (r) { return r && r.addChart; });
    await doc.sheetsApi.post(':batchUpdate', {
        json: { requests: [{ updateChartSpec: { chartId: criado.addChart.chart.chartId, spec: specDoGrafico } }] }
    });

    console.log('✓ Aba "Acompanhamento": painel com logo, indicadores, gráfico por dia, lotes, Pix x cartão, resultado líquido, dias e pedidos');
}

async function main() {
    const doc = await abrirPlanilha();
    console.log('Planilha: "' + doc.title + '" (credencial: ' + config.google.email + ')\n');

    // "hoje" e "atualizado em" no horário do evento, não no da Califórnia
    if (doc.timeZone !== FUSO) {
        await doc.updateProperties({ timeZone: FUSO });
        console.log('• Fuso da planilha: ' + FUSO);
    }

    await prepararPedidos(doc);
    await prepararAcompanhamento(doc);

    // o Resumo virou parte do painel
    if (doc.sheetsByTitle.Resumo) {
        await doc.sheetsByTitle.Resumo.delete();
        console.log('• Aba "Resumo" removida (os totais agora estão no Acompanhamento)');
    }

    console.log('\nPronto. Confira em https://docs.google.com/spreadsheets/d/' + config.google.planilhaId);
    console.log('Próximo passo: npm run planilha:testar');
}

if (require.main === module) main().catch(explicarErro);

module.exports = { pintarCabecalho, prepararAcompanhamento };
