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
    realizacao: 'Igreja Evangelho Pleno',
    // o mesmo do .recap-tema do index.html
    tema: 'Moldadas pelo Espírito. Movidas pelo Propósito.'
};

// quantos ingressos cabem num mesmo pedido (uma pessoa comprando para amigas)
const QTD_MIN = 1;
const QTD_MAX = 5;

// EDITAR: os dois lotes e a janela de venda de cada um.
// As datas PRECISAM bater com os data-inicio / data-fim dos <li class="lote">
// do index.html: a landing usa as de lá para o selo ("abre dia…/vendas
// abertas/encerrado") e o servidor usa as daqui para recusar de verdade uma
// compra fora do período. O último dia vende até 23:59.
const lotes = [
    // aberto de verdade em 24/09 para o ensaio em produção; o card da landing
    // continua anunciando 27/09 (texto fixo), que é quando o link é divulgado
    { id: 'lote-1', lote: '1º lote', preco: 5500, de: '2026-09-24', ate: '2026-10-06' },
    { id: 'lote-2', lote: '2º lote', preco: 6500, de: '2026-10-07', ate: '2026-10-15' }
];

/* A janela de venda vale pelo relogio de Paragominas, nao pelo do servidor.
   America/Belem e UTC-3 o ano inteiro (o Brasil nao tem mais horario de
   verao desde 2019), entao o deslocamento e fixo e nao precisa de tabela.

   Montar a data com new Date(ano, mes, dia) usaria o fuso de quem roda. Na
   Vercel isso e UTC: a venda abriria as 21h do dia ANTERIOR em Paragominas e
   o ultimo dia de cada lote fecharia as 21h em vez de 23:59. No computador de
   quem desenvolve, que ja esta em UTC-3, o erro nao aparece. */
const HORAS_ATRAS_DE_UTC = 3;

function diaBR(iso, fimDoDia) {
    const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!p) return null;
    return fimDoDia
        ? new Date(Date.UTC(+p[1], +p[2] - 1, +p[3], 23 + HORAS_ATRAS_DE_UTC, 59, 59, 999))
        : new Date(Date.UTC(+p[1], +p[2] - 1, +p[3], HORAS_ATRAS_DE_UTC));
}

function formatarJanela(de, ate) {
    const curto = function (iso) { return iso.slice(8, 10) + '/' + iso.slice(5, 7); };
    return curto(de) + ' a ' + curto(ate);
}

const produtos = {};
lotes.forEach(function (l) {
    produtos[l.id] = {
        id: l.id,
        tipo: 'Ingresso individual',
        lote: l.lote,
        vendaDe: l.de,
        vendaAte: l.ate,
        janelaVenda: formatarJanela(l.de, l.ate),
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

/* O lote está dentro da janela de venda agora? Devolve:
     'aberto'    dá para comprar
     'espera'    ainda não abriu
     'encerrado' já passou
   Mesmos três estados que o configurarLotes() mostra no selo da landing. */
function situacaoDoLote(produto, agora) {
    const inicio = diaBR(produto.vendaDe, false);
    const fim = diaBR(produto.vendaAte, true);
    if (!inicio || !fim) return 'aberto';   // sem data configurada, não bloqueia
    const momento = agora || new Date();
    if (momento < inicio) return 'espera';
    if (momento > fim) return 'encerrado';
    return 'aberto';
}

function listarProdutos() {
    return Object.values(produtos).filter(function (p) { return p.ativo; });
}

function formatarReais(centavos) {
    return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

module.exports = { evento, buscarProduto, listarProdutos, descreverProduto, situacaoDoLote, formatarReais };
