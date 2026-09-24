/* =============================================================
   Pedidos: a planilha do Google é o banco de dados.
   Aba "Pedidos" (achada pelo nome, então a planilha pode ter outras abas),
   cabeçalho na linha 1. As colunas A–F são as
   da especificação; as seguintes guardam o que o fluxo precisa para
   reenviar e-mail, conferir ingressos e retomar um Pix.
   Sem credenciais do Google, os pedidos ficam em memória (só para testes).
   ============================================================= */
const { JWT } = require('google-auth-library');
const config = require('../config');

// campo do pedido -> coluna da planilha (a ordem aqui é a ordem das colunas)
const COLUNAS = [
    ['transacaoId', 'ID_Transação'],
    ['criadoEm', 'Data_Hora'],
    ['nome', 'Nome_Cliente'],
    ['cpf', 'CPF'],
    ['email', 'Email'],
    ['status', 'Status'],
    ['telefone', 'Telefone'],
    ['produto', 'Produto'],
    ['quantidade', 'Quantidade'],
    ['valorTotal', 'Valor_Total'],
    ['metodo', 'Metodo'],
    ['pedidoId', 'Pedido_ID'],
    ['codigos', 'Codigos_Ingresso'],
    ['emailEnviado', 'Email_Enviado'],
    ['atualizadoEm', 'Atualizado_Em'],
    ['pixCopiaECola', 'Pix_Copia_Cola'],
    ['linkPagamento', 'Link_Pagamento']
];
const CABECALHO = COLUNAS.map(function (c) { return c[1]; });

/* As colunas que o painel Acompanhamento soma com SUMIF/SUMIFS precisam ser NÚMERO na
   planilha: texto é ignorado pelas somas e o total sai zerado. O getRows()
   devolve toda célula como texto e o save() reescreve a linha inteira, então
   sem isto atualizar um pedido transformaria 110 em "110". */
const COLUNAS_NUMERICAS = ['Quantidade', 'Valor_Total'];

function comoNumero(valor) {
    return Number(String(valor == null ? '' : valor).replace(',', '.')) || 0;
}

/* Põe os campos novos na linha e devolve as colunas numéricas ao tipo número.
   Separada de atualizar() para poder ser testada sem falar com o Google. */
function prepararLinha(row, campos) {
    row.assign(paraLinha(campos));
    COLUNAS_NUMERICAS.forEach(function (coluna) {
        row.set(coluna, comoNumero(row.get(coluna)));
    });
    return row;
}

// pedido (valorTotal em centavos, codigos em array) -> linha da planilha
function paraLinha(pedido) {
    const linha = {};
    COLUNAS.forEach(function ([campo, coluna]) {
        if (!(campo in pedido)) return;
        let valor = pedido[campo];
        if (campo === 'valorTotal') valor = valor / 100;
        if (campo === 'codigos') valor = (valor || []).join(' ');
        linha[coluna] = valor == null ? '' : valor;
    });
    return linha;
}

function daLinha(row) {
    const pedido = {};
    COLUNAS.forEach(function ([campo, coluna]) { pedido[campo] = row.get(coluna); });
    pedido.quantidade = Number(pedido.quantidade) || 0;
    pedido.valorTotal = Math.round(Number(String(pedido.valorTotal).replace(',', '.')) * 100) || 0;
    pedido.codigos = String(pedido.codigos || '').split(/\s+/).filter(Boolean);
    pedido.cpf = String(pedido.cpf || '');
    return pedido;
}

/* ---------- limite de uso do Google ----------
   A conta de serviço é UM usuário para o Google: 60 leituras e 60 escritas
   por minuto. Numa leva de 20–30 compras juntas (o link divulgado no culto,
   todas no Wi-Fi da igreja) isso estoura por alguns segundos e o Google
   responde 429. Não é falha de verdade: é "espere um pouco". Então esperamos,
   com espera crescente e um sorteio para as instâncias não voltarem todas no
   mesmo instante. O total fica abaixo de ~20 s, dentro dos 25 s que a página
   espera pela resposta. */
const ESPERAS_MS = [700, 1400, 2800, 5000, 7000];

function esperaComSorteio(tentativa) {
    const base = ESPERAS_MS[Math.min(tentativa, ESPERAS_MS.length) - 1];
    return Math.round(base * (0.6 + Math.random() * 0.8));
}

// leituras (GET) e a gravação da linha (PUT) repetem sozinhas no ky
const REPETICAO = {
    limit: ESPERAS_MS.length,
    methods: ['get', 'put'],
    statusCodes: [408, 429, 500, 502, 503, 504],
    afterStatusCodes: [429, 503],
    maxRetryAfter: 8000,
    delay: esperaComSorteio,
    retryOnTimeout: true
};

function statusDoErro(erro) {
    return (erro && erro.response && erro.response.status) || 0;
}

/* O acréscimo de linha é POST, que o ky não repete: repetir às cegas depois
   de um 500 podia gravar o pedido duas vezes. Só o 429 é certeza de que o
   Google recusou sem gravar nada — esse, repetimos. */
async function repetindoSeOcupado(acao) {
    for (let tentativa = 1; ; tentativa++) {
        try {
            return await acao();
        } catch (erro) {
            if (statusDoErro(erro) !== 429 || tentativa > ESPERAS_MS.length) throw erro;
            console.warn('[planilha] Google ocupado (429), nova tentativa', tentativa);
            await new Promise(function (r) { setTimeout(r, esperaComSorteio(tentativa)); });
        }
    }
}

/* ---------- implementação Google Sheets ---------- */
function criarRepositorioPlanilha() {
    let docPromessa = null;

    /* O google-spreadsheet só existe como módulo ESM (ele puxa o ky). O Node
       do computador aceita exigi-lo com require(), mas o carregador de
       funções da Vercel não — a API inteira morria ao subir. Carregado aqui
       dentro, com import(), funciona nos dois, e só na primeira vez que
       alguém precisa da planilha. */
    function documento() {
        if (!docPromessa) {
            docPromessa = (async function () {
                const { GoogleSpreadsheet } = await import('google-spreadsheet');
                const auth = new JWT({
                    email: config.google.email,
                    key: config.google.chave,
                    scopes: ['https://www.googleapis.com/auth/spreadsheets']
                });
                return new GoogleSpreadsheet(config.google.planilhaId, auth, { retryConfig: REPETICAO });
            })().catch(function (erro) {
                docPromessa = null;   // tenta de novo na próxima chamada
                throw erro;
            });
        }
        return docPromessa;
    }

    let abaPromessa = null;
    let cache = { em: 0, linhas: null };
    /* A página de pagamento consulta o status a cada 5 s. Com 30 compradoras
       esperando o Pix, seriam 360 leituras por minuto — seis vezes o limite.
       Numa mesma instância, as consultas desses segundos dividem uma leitura
       só. Não atrasa a confirmação: quem descobre o pagamento é a consulta ao
       Mercado Pago, e a gravação relê a linha antes (atualizar). */
    const CACHE_MS = 8000;
    const FRESCA_MS = 3000;  // "fresca" para gravar: lida há no máximo 3 s
    let lendo = null;  // leitura em andamento: quem chega junto espera a mesma

    function aba() {
        if (!abaPromessa) {
            abaPromessa = (async function () {
                const doc = await documento();
                await doc.loadInfo();
                const sheet = doc.sheetsByTitle[config.google.aba];
                if (!sheet) {
                    throw new Error('A planilha não tem a aba "' + config.google.aba + '". Rode "npm run planilha:preparar".');
                }
                try {
                    await sheet.loadHeaderRow();
                } catch (e) {
                    await sheet.setHeaderRow(CABECALHO);  // planilha vazia: cria o cabeçalho
                }
                const faltando = CABECALHO.filter(function (c) { return !sheet.headerValues.includes(c); });
                if (faltando.length) {
                    throw new Error('Planilha sem as colunas: ' + faltando.join(', ') + '. Rode "npm run planilha:preparar".');
                }
                return sheet;
            })().catch(function (erro) {
                abaPromessa = null;  // tenta de novo na próxima chamada
                throw erro;
            });
        }
        return abaPromessa;
    }

    async function linhas(idadeMax) {
        if (cache.linhas && Date.now() - cache.em < (idadeMax || CACHE_MS)) return cache.linhas;
        if (!lendo) {
            lendo = (async function () {
                const sheet = await aba();
                const todas = await sheet.getRows();
                cache = { em: Date.now(), linhas: todas };
                return todas;
            })().finally(function () { lendo = null; });
        }
        return lendo;
    }

    async function acharLinha(campo, valor, fresca) {
        if (!valor) return null;
        const coluna = COLUNAS.find(function (c) { return c[0] === campo; })[1];
        const achar = function (todas) {
            return todas.find(function (row) { return String(row.get(coluna)) === String(valor); }) || null;
        };
        const idadeMax = fresca ? FRESCA_MS : CACHE_MS;
        const row = achar(await linhas(idadeMax));
        if (row || Date.now() - cache.em < 1000) return row;
        /* Não achou numa cópia de segundos atrás: o pedido pode ter nascido
           noutra instância depois dela. Sem esta releitura a página de
           pagamento dizia "pedido não encontrado" à compradora que acabou de
           receber o Pix. Pedido inexistente de verdade é raro (o ID é longo e
           aleatório), então o custo é pequeno. */
        return achar(await linhas(1000));
    }

    return {
        tipo: 'google-sheets',
        async criar(pedido) {
            const sheet = await aba();
            /* insert:true (INSERT_ROWS) é obrigatório. Com insert:false
               (OVERWRITE) o Google escreve na "próxima linha vazia" — e vendas
               simultâneas miram a MESMA linha e se apagam: no teste de carga,
               25 gravações juntas deixaram 3 linhas. A compradora recebia o
               Pix de um pedido que não existia mais. Inserindo, cada venda
               ganha a sua linha. (A linha inserida copia o formato da de cima;
               por isso o marrom do cabeçalho é formatação CONDICIONAL, que não
               se copia — ver scripts/preparar-planilha.js.) */
            await repetindoSeOcupado(function () {
                return sheet.addRow(paraLinha(pedido), { raw: true, insert: true });
            });
            // sem apagar a cópia em memória: quem procurar o pedido novo e não
            // achar força a releitura (acharLinha)
            return pedido;
        },
        async buscarPorId(pedidoId, opcoes) {
            const row = await acharLinha('pedidoId', pedidoId, opcoes && opcoes.fresca);
            return row ? daLinha(row) : null;
        },
        async buscarPorTransacao(transacaoId) {
            const row = await acharLinha('transacaoId', transacaoId);
            return row ? daLinha(row) : null;
        },
        async atualizar(pedidoId, campos) {
            // linha lida há no máximo 3 s: outra instância pode ter mexido
            const row = await acharLinha('pedidoId', pedidoId, true);
            if (!row) throw new Error('Pedido não encontrado na planilha: ' + pedidoId);
            prepararLinha(row, campos);
            await row.save({ raw: true });
            return daLinha(row);
        }
    };
}

/* ---------- implementação em memória (desenvolvimento e testes) ---------- */
function criarRepositorioMemoria() {
    const pedidos = new Map();
    const copia = function (p) { return p ? JSON.parse(JSON.stringify(p)) : null; };

    return {
        tipo: 'memoria',
        async criar(pedido) {
            pedidos.set(pedido.pedidoId, copia(pedido));
            return copia(pedido);
        },
        async buscarPorId(pedidoId) {
            return copia(pedidos.get(pedidoId));
        },
        async buscarPorTransacao(transacaoId) {
            for (const p of pedidos.values()) if (p.transacaoId === transacaoId) return copia(p);
            return null;
        },
        async atualizar(pedidoId, campos) {
            const atual = pedidos.get(pedidoId);
            if (!atual) throw new Error('Pedido não encontrado: ' + pedidoId);
            Object.assign(atual, copia(campos));
            return copia(atual);
        }
    };
}

let repositorio = null;

function pedidos() {
    if (!repositorio) {
        if (config.google.configurado) {
            repositorio = criarRepositorioPlanilha();
        } else {
            if (config.ambiente === 'production') {
                console.warn('[planilha] GOOGLE_* não configurado: pedidos em MEMÓRIA, serão perdidos.');
            }
            repositorio = criarRepositorioMemoria();
        }
    }
    return repositorio;
}

module.exports = { pedidos, CABECALHO, COLUNAS_NUMERICAS, prepararLinha, repetindoSeOcupado };
