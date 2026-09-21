/* =============================================================
   Regras do pedido, independentes de qual gateway, planilha ou
   provedor de e-mail estiver por baixo.

   Ciclo: PENDENTE --(webhook ou consulta)--> PAGO --> e-mail enviado
                   \-> RECUSADO / EXPIRADO / CANCELADO
   ============================================================= */
const config = require('../config');
const { buscarProduto } = require('../catalogo');
const { pedidos } = require('./sheetsService');
const { pagamento } = require('./pagamento');
const { enviarIngresso } = require('./emailService');
const { validarComprador, mascararEmail } = require('../utils/validacao');
const { dataHoraBrasil } = require('../utils/datas');
const { novoPedidoId, novoCodigoIngresso } = require('../utils/codigos');

const STATUS_FINAIS = ['PAGO', 'RECUSADO', 'EXPIRADO', 'CANCELADO', 'REEMBOLSADO'];

function erroPublico(status, mensagem, extra) {
    const erro = new Error(mensagem);
    erro.status = status;
    erro.publico = mensagem;
    Object.assign(erro, extra);
    return erro;
}

async function criarPedido(entrada) {
    const produto = buscarProduto(entrada.produto);
    if (!produto) throw erroPublico(400, 'Ingresso indisponível. Volte e escolha outro.');

    const quantidade = Number(entrada.quantidade) || produto.quantidadeMin;
    if (!Number.isInteger(quantidade) || quantidade < produto.quantidadeMin || quantidade > produto.quantidadeMax) {
        throw erroPublico(400, 'Quantidade inválida para este ingresso.', {
            erros: { quantidade: 'Escolha entre ' + produto.quantidadeMin + ' e ' + produto.quantidadeMax + '.' }
        });
    }

    const provedor = pagamento();
    const metodo = provedor.metodos.includes(entrada.metodo) ? entrada.metodo : provedor.metodos[0];

    const validacao = validarComprador(entrada);
    if (!validacao.ok) throw erroPublico(422, 'Confira os campos destacados.', { erros: validacao.erros });

    const agora = new Date();
    const pedido = Object.assign({}, validacao.dados, {
        pedidoId: novoPedidoId(),
        transacaoId: '',
        criadoEm: dataHoraBrasil(agora),
        atualizadoEm: dataHoraBrasil(agora),
        status: 'PENDENTE',
        produto: produto.setor + ' · ' + produto.tipo + ' (' + produto.lote + ')',
        quantidade,
        valorTotal: produto.precoUnitario * quantidade,
        metodo,
        codigos: [],
        emailEnviado: 'NAO',
        pixCopiaECola: '',
        linkPagamento: ''
    });

    const cobranca = await provedor.criarCobranca({
        pedido,
        produto,
        metodo,
        urls: {
            retorno: config.siteUrl + '/pagamento.html?pedido=' + encodeURIComponent(pedido.pedidoId),
            webhook: config.apiUrl + '/api/webhook'
        }
    });

    pedido.transacaoId = cobranca.transacaoId;
    pedido.pixCopiaECola = (cobranca.pix && cobranca.pix.copiaECola) || '';
    pedido.linkPagamento = cobranca.linkPagamento || '';

    await pedidos().criar(pedido);
    return { pedido, cobranca };
}

// Evita que o webhook e a consulta de status confirmem o mesmo pedido ao
// mesmo tempo nesta instância (entre instâncias, quem segura é a chave de
// idempotência do Resend e a releitura da planilha).
const emAndamento = new Map();

function confirmarPagamento(pedidoId) {
    if (emAndamento.has(pedidoId)) return emAndamento.get(pedidoId);
    const tarefa = (async function () {
        let pedido = await pedidos().buscarPorId(pedidoId);
        if (!pedido) throw new Error('Pedido não encontrado: ' + pedidoId);

        if (pedido.status !== 'PAGO') {
            const codigos = pedido.codigos.length
                ? pedido.codigos
                : Array.from({ length: pedido.quantidade }, novoCodigoIngresso);
            pedido = await pedidos().atualizar(pedidoId, {
                status: 'PAGO',
                codigos,
                pixCopiaECola: '',
                atualizadoEm: dataHoraBrasil()
            });
        }

        if (pedido.emailEnviado === 'NAO') pedido = await enviarEmailDoPedido(pedido);
        return pedido;
    })().finally(function () { emAndamento.delete(pedidoId); });

    emAndamento.set(pedidoId, tarefa);
    return tarefa;
}

async function enviarEmailDoPedido(pedido, opcoes) {
    try {
        const resultado = await enviarIngresso(pedido, opcoes);
        return await pedidos().atualizar(pedido.pedidoId, {
            emailEnviado: resultado.enviado ? 'SIM' : 'SIMULADO',
            atualizadoEm: dataHoraBrasil()
        });
    } catch (erro) {
        // o pagamento já está registrado; o e-mail pode ser reenviado pelo admin
        console.error('[email] falha ao enviar pedido', pedido.pedidoId, erro.message);
        return pedidos().atualizar(pedido.pedidoId, { emailEnviado: 'ERRO', atualizadoEm: dataHoraBrasil() });
    }
}

// Aplica um status vindo do gateway. Nunca "despaga" um pedido já pago,
// exceto por estorno.
async function aplicarStatus(pedido, novoStatus) {
    if (!novoStatus || novoStatus === pedido.status) {
        if (novoStatus === 'PAGO' && pedido.emailEnviado === 'NAO') return confirmarPagamento(pedido.pedidoId);
        return pedido;
    }
    if (novoStatus === 'PAGO') return confirmarPagamento(pedido.pedidoId);
    if (pedido.status === 'PAGO' && novoStatus !== 'REEMBOLSADO') return pedido;
    if (novoStatus === 'PENDENTE') return pedido;
    return pedidos().atualizar(pedido.pedidoId, { status: novoStatus, atualizadoEm: dataHoraBrasil() });
}

// Chamado pelo webhook: sempre reconsulta o gateway em vez de confiar no corpo recebido.
async function processarNotificacao(transacaoId) {
    const pedido = await pedidos().buscarPorTransacao(transacaoId);
    if (!pedido) return { ignorado: true, motivo: 'transação desconhecida' };
    const status = await pagamento().consultarStatus(transacaoId);
    const atualizado = await aplicarStatus(pedido, status);
    return { ignorado: false, status: atualizado.status };
}

// Chamado pela página de pagamento: se o webhook atrasar ou se perder, a
// própria consulta do cliente descobre que o pagamento caiu.
async function consultarPedido(pedidoId) {
    const pedido = await pedidos().buscarPorId(pedidoId);
    if (!pedido) return null;
    // pago mas sem e-mail tentado = a confirmação caiu no meio; termina agora
    if (STATUS_FINAIS.includes(pedido.status) && !(pedido.status === 'PAGO' && pedido.emailEnviado === 'NAO')) return pedido;

    try {
        const status = pedido.status === 'PAGO' ? 'PAGO' : await pagamento().consultarStatus(pedido.transacaoId);
        return await aplicarStatus(pedido, status);
    } catch (erro) {
        console.error('[pedido] falha ao consultar gateway', pedidoId, erro.message);
        return pedido;
    }
}

// O que o navegador pode ver: sem CPF, e-mail mascarado, códigos só se pago.
function visaoPublica(pedido) {
    const pago = pedido.status === 'PAGO';
    return {
        pedidoId: pedido.pedidoId,
        status: pedido.status,
        nome: String(pedido.nome).split(' ')[0],
        email: mascararEmail(pedido.email),
        produto: pedido.produto,
        quantidade: pedido.quantidade,
        valorTotal: pedido.valorTotal,
        metodo: pedido.metodo,
        transacaoId: pago ? pedido.transacaoId : undefined,
        criadoEm: pedido.criadoEm,
        pix: !pago && pedido.pixCopiaECola ? { copiaECola: pedido.pixCopiaECola } : null,
        linkPagamento: !pago && pedido.linkPagamento ? pedido.linkPagamento : null,
        ingressos: pago ? pedido.codigos.map(function (codigo) {
            return { codigo, qr: config.apiUrl + '/api/ingressos/' + encodeURIComponent(codigo) + '/qr.png' };
        }) : [],
        emailEnviado: pedido.emailEnviado === 'SIM'
    };
}

module.exports = {
    criarPedido,
    confirmarPagamento,
    enviarEmailDoPedido,
    processarNotificacao,
    consultarPedido,
    visaoPublica
};
