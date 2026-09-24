/* =============================================================
   Confere se o backend fala mesmo com o Mercado Pago (npm run mercadopago:testar)

   Chama o provedor de verdade — o mesmo código que o checkout usa — e
   mostra o que voltou em cada etapa:
     1. conta      de quem é a credencial, e se é de teste
     2. Pix        cria o pagamento e confere o copia-e-cola (só em produção:
                   usuário de teste do Mercado Pago não tem Pix)
     3. consulta   lê o status do Pix recém-criado, e o cancela
     4. cartão     cria a preferência e pega o link do Checkout Pro

   Não passa pela rota /api/checkout, então
   a janela de venda do lote não atrapalha.

   Com credencial de PRODUÇÃO ele se recusa, a não ser com --producao:
   aí cria um Pix de verdade (que ninguém paga) e o cancela em seguida.
   ============================================================= */
const config = require('../src/config');
const provedor = require('../src/services/pagamento/mercadoPagoProvider');
const { listarProdutos, formatarReais } = require('../src/catalogo');

const cliente = provedor._cliente;

const pedidoFalso = {
    pedidoId: 'TESTE-' + Date.now(),
    nome: 'Compradora de Teste',
    cpf: '24971563792',
    // o Mercado Pago recusa pagador com o mesmo e-mail da conta que recebe
    email: 'compradora.teste@exemplo.com.br',
    telefone: '91988887777',
    quantidade: 1,
    valorTotal: 0
};

async function main() {
    if (!config.mercadoPago.accessToken) {
        console.log('✗ MERCADOPAGO_ACCESS_TOKEN está vazio no backend/.env.');
        console.log('  Pegue em mercadopago.com.br/developers → Suas integrações → a aplicação → Credenciais de teste.');
        process.exit(1);
    }

    // ---- 1: de quem é a credencial ----
    const { data: conta } = await cliente.get('/users/me');
    const deTeste = config.mercadoPago.ambiente === 'teste' || (conta.tags || []).includes('test_user');
    console.log('Conta:    ', conta.nickname || conta.id, '(' + (conta.email || 'sem e-mail') + ')');
    console.log('Ambiente: ', deTeste ? 'TESTE' : 'PRODUÇÃO');
    if (!deTeste && !process.argv.includes('--producao')) {
        console.log('\n✗ Credencial de PRODUÇÃO. Este teste cria um Pix de verdade (e o cancela).');
        console.log('  Se é isso mesmo: npm run mercadopago:testar -- --producao');
        process.exit(1);
    }

    const produto = listarProdutos()[0];
    pedidoFalso.valorTotal = produto.precoUnitario * pedidoFalso.quantidade;
    console.log('Pedido:   ', pedidoFalso.pedidoId, '—', formatarReais(pedidoFalso.valorTotal), '\n');

    // ---- 2 e 3: Pix ----
    /* Usuário de teste do Mercado Pago não tem Pix: a API responde
       "Unauthorized use of live credentials". Pix só se prova em produção. */
    let pix = null;
    try {
        pix = await provedor.criarCobranca({ pedido: pedidoFalso, produto, metodo: 'pix' });
    } catch (erro) {
        if (!deTeste || !/live credentials/i.test(erro.message)) throw erro;
        console.log('– Pix pulado: usuário de teste não tem Pix. Ele se prova com a credencial de produção.');
    }
    if (pix) await testarPix(pix);

    // ---- 4: cartão ----
    const cartao = await provedor.criarCobranca({
        pedido: pedidoFalso, produto, metodo: 'cartao',
        urls: { retorno: config.siteUrl + '/pagamento.html?pedido=' + pedidoFalso.pedidoId }
    });
    console.log(cartao.linkPagamento
        ? '✓ Link do cartão (Checkout Pro): ' + cartao.linkPagamento
        : '✗ A preferência veio sem link — a compradora ficaria sem para onde ir.');

    console.log('\nFalta o webhook: o Mercado Pago só notifica URL pública.');
    console.log('Confira no painel (Webhooks → Simular) depois do deploy.');
}

async function testarPix(pix) {
    console.log('✓ Pix criado:', pix.transacaoId);
    if (pix.pix && pix.pix.copiaECola) {
        console.log('✓ Copia-e-cola recebido (' + pix.pix.copiaECola.length + ' caracteres)');
        console.log('  começa com:', pix.pix.copiaECola.slice(0, 40) + '…');
        console.log('  expira em: ', pix.pix.expiraEm || '(sem data)');
    } else {
        console.log('✗ O Pix veio SEM copia-e-cola. Quase sempre é a conta sem CHAVE PIX cadastrada.');
    }
    console.log('  página do Pix:', pix.linkPagamento || '(nenhuma)');

    const status = await provedor.consultarStatus(pix.transacaoId, pedidoFalso);
    console.log(status === 'PENDENTE'
        ? '✓ Consulta de status devolveu PENDENTE, como esperado'
        : '✗ Consulta de status devolveu ' + status + ' — esperava PENDENTE.');

    // ninguém vai pagar este Pix: cancela para não ficar na conta
    try {
        await cliente.put('/v1/payments/' + pix.transacaoId, { status: 'cancelled' });
        console.log('  Pix ' + pix.transacaoId + ' cancelado');
    } catch (e) {
        console.log('  ⚠ não consegui cancelar o Pix ' + pix.transacaoId + ' (' + e.message + ') — ele vence sozinho amanhã');
    }
}

main().catch(function (erro) {
    console.error('\n✗ Falhou:', erro.message);
    if (erro.response && erro.response.data) console.error('  resposta do Mercado Pago:', JSON.stringify(erro.response.data));
    process.exit(1);
});
