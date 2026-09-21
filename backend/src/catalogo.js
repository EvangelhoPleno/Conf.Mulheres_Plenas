/* =============================================================
   EDITAR: evento, lotes e preços.
   O preço vale SÓ daqui — o site nunca manda valor, só o código do
   produto, então ninguém consegue comprar mais barato mexendo no navegador.
   Valores em centavos (15000 = R$ 150,00) e sempre POR PESSOA.
   ============================================================= */

const evento = {
    nome: 'Conferência Mulheres Plenas 2026',
    // EDITAR quando estiverem definidos
    data: 'Data a confirmar',
    local: 'Paragominas – PA',
    realizacao: 'Igreja Evangelho Pleno'
};

const LOTE_ATUAL = '1º lote';

// quantidade: fixa (min = max) ou faixa, para a caravana
const tipos = [
    { tipo: 'individual', nome: 'Individual', min: 1, max: 1 },
    { tipo: 'dupla', nome: 'Combo dupla', min: 2, max: 2 },
    { tipo: 'trio', nome: 'Combo 3 amigas', min: 3, max: 3 },
    { tipo: 'caravana', nome: 'Caravana', min: 10, max: 60 }
];

// EDITAR: preço por pessoa de cada setor e tipo (R$ 150,00 da especificação
// em todos até a organização definir os descontos dos combos)
const precos = {
    central: { individual: 15000, dupla: 15000, trio: 15000, caravana: 15000 },
    arquibancada: { individual: 15000, dupla: 15000, trio: 15000, caravana: 15000 }
};

const setores = { central: 'Central', arquibancada: 'Arquibancada' };

const produtos = {};
Object.keys(precos).forEach(function (setor) {
    tipos.forEach(function (t) {
        const id = setor + '-' + t.tipo;
        produtos[id] = {
            id,
            setor: setores[setor],
            tipo: t.nome,
            lote: LOTE_ATUAL,
            precoUnitario: precos[setor][t.tipo],
            quantidadeMin: t.min,
            quantidadeMax: t.max,
            ativo: true
        };
    });
});

function buscarProduto(id) {
    const produto = produtos[id];
    return produto && produto.ativo ? produto : null;
}

function listarProdutos() {
    return Object.values(produtos).filter(function (p) { return p.ativo; });
}

function formatarReais(centavos) {
    return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

module.exports = { evento, buscarProduto, listarProdutos, formatarReais };
