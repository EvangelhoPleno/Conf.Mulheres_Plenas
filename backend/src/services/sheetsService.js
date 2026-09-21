/* =============================================================
   Pedidos: a planilha do Google é o banco de dados.
   Aba "Pedidos" (achada pelo nome, então a planilha pode ter outras abas),
   cabeçalho na linha 1. As colunas A–F são as
   da especificação; as seguintes guardam o que o fluxo precisa para
   reenviar e-mail, conferir ingressos e retomar um Pix.
   Sem credenciais do Google, os pedidos ficam em memória (só para testes).
   ============================================================= */
const { GoogleSpreadsheet } = require('google-spreadsheet');
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

/* ---------- implementação Google Sheets ---------- */
function criarRepositorioPlanilha() {
    const auth = new JWT({
        email: config.google.email,
        key: config.google.chave,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const doc = new GoogleSpreadsheet(config.google.planilhaId, auth);

    let abaPromessa = null;
    let cache = { em: 0, linhas: null };
    const CACHE_MS = 2000;  // a página de pagamento consulta o status a cada poucos segundos

    function aba() {
        if (!abaPromessa) {
            abaPromessa = (async function () {
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

    async function linhas() {
        if (cache.linhas && Date.now() - cache.em < CACHE_MS) return cache.linhas;
        const sheet = await aba();
        cache = { em: Date.now(), linhas: await sheet.getRows() };
        return cache.linhas;
    }

    async function acharLinha(campo, valor) {
        if (!valor) return null;
        const coluna = COLUNAS.find(function (c) { return c[0] === campo; })[1];
        const todas = await linhas();
        return todas.find(function (row) { return String(row.get(coluna)) === String(valor); }) || null;
    }

    return {
        tipo: 'google-sheets',
        async criar(pedido) {
            const sheet = await aba();
            await sheet.addRow(paraLinha(pedido), { raw: true, insert: true });
            cache.linhas = null;
            return pedido;
        },
        async buscarPorId(pedidoId) {
            const row = await acharLinha('pedidoId', pedidoId);
            return row ? daLinha(row) : null;
        },
        async buscarPorTransacao(transacaoId) {
            const row = await acharLinha('transacaoId', transacaoId);
            return row ? daLinha(row) : null;
        },
        async atualizar(pedidoId, campos) {
            cache.linhas = null;  // lê de novo: outra instância pode ter mexido
            const row = await acharLinha('pedidoId', pedidoId);
            if (!row) throw new Error('Pedido não encontrado na planilha: ' + pedidoId);
            row.assign(paraLinha(campos));
            await row.save({ raw: true });
            cache.linhas = null;
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

module.exports = { pedidos, CABECALHO, criarRepositorioMemoria };
