/* =============================================================
   EDITAR: evento, lotes e preços.
   O preço vale SÓ daqui — o site nunca manda valor, só o código do
   produto, então ninguém consegue comprar mais barato mexendo no navegador.
   Valores em centavos (5500 = R$ 55,00) e sempre POR PESSOA.

   Este catálogo espelha exatamente o que a landing anuncia na seção de
   ingressos: um único tipo de ingresso, individual, em dois lotes que se
   diferenciam só pelo preço e pela janela de venda. Se mudar um preço aqui,
   mude também o .ticket-preco do lote correspondente no index.html.
   ============================================================= */

const evento = {
    nome: 'Conferência Mulheres Plenas 2026',
    data: '16 e 17 de outubro de 2026',
    local: 'Paragominas – PA',
    realizacao: 'Igreja Evangelho Pleno'
};

// quantos ingressos cabem num mesmo pedido (uma pessoa comprando para amigas)
const QTD_MIN = 1;
const QTD_MAX = 5;

// EDITAR: os dois lotes. As datas aqui são só documentação da janela de
// venda — quem decide se o lote aparece é o campo "ativo". A landing mostra
// o selo de "abre dia…/vendas abertas/encerrado" a partir dos data-inicio e
// data-fim do próprio HTML, em configurarLotes().
const lotes = [
    { id: 'lote-1', lote: '1º lote', preco: 5500, venda: '27/09 a 06/10' },
    { id: 'lote-2', lote: '2º lote', preco: 6500, venda: '07/10 a 15/10' }
];

const produtos = {};
lotes.forEach(function (l) {
    produtos[l.id] = {
        id: l.id,
        tipo: 'Ingresso individual',
        lote: l.lote,
        janelaVenda: l.venda,
        precoUnitario: l.preco,
        quantidadeMin: QTD_MIN,
        quantidadeMax: QTD_MAX,
        ativo: true
    };
});

/* Como o produto aparece para a compradora: no resumo do pedido, na planilha
   e na descrição que vai para a operadora de pagamento. */
function descreverProduto(produto) {
    return produto.tipo + ' (' + produto.lote + ')';
}

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

module.exports = { evento, buscarProduto, listarProdutos, descreverProduto, formatarReais };
