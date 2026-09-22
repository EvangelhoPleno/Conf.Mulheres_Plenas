/* =============================================================
   Confere se o backend fala mesmo com o Asaas (npm run asaas:testar)

   Chama o provedor de verdade — o mesmo código que o checkout usa —
   contra o sandbox, e mostra o que voltou em cada etapa:
     1. cliente    acha ou cria pelo CPF
     2. Pix        cria a cobrança e busca o copia-e-cola
     3. consulta   lê o status da cobrança recém-criada
     4. cartão     cria a cobrança e pega o link de pagamento
     5. telefone   um celular que o Asaas recusa não pode derrubar a venda

   No fim apaga as duas cobranças de teste, para não sujar a conta.
   Não passa pela rota /api/checkout, então a janela de venda do lote
   não atrapalha: dá para rodar antes do dia 27.

   NUNCA rode isto com a chave de produção — ele cria cobranças de verdade.
   ============================================================= */
const axios = require('axios');
const config = require('../src/config');
const provedor = require('../src/services/pagamento/asaasProvider');
const { listarProdutos, formatarReais } = require('../src/catalogo');

// CPF de teste válido nos dígitos verificadores (o Asaas recusa CPF inventado).
const CPF_TESTE = '24971563792';

const pedidoFalso = {
    pedidoId: 'TESTE-' + Date.now(),
    nome: 'Compradora de Teste',
    cpf: CPF_TESTE,
    email: 'teste@exemplo.com.br',
    telefone: '91988887777',
    quantidade: 1,
    valorTotal: 0            // preenchido em main() com o preço real do lote
};

function conferirConfiguracao() {
    if (!config.asaas.apiKey) {
        console.log('✗ ASAAS_API_KEY está vazia no .env.');
        console.log('  Pegue em sandbox.asaas.com → Configurações → Integrações → Chave de API');
        console.log('  (a de sandbox começa com $aact_hmlg_).');
        process.exit(1);
    }
    if (config.asaas.ambiente === 'producao') {
        console.log('✗ ASAAS_API_URL aponta para PRODUÇÃO. Este teste cria cobranças de verdade.');
        console.log('  Deixe ASAAS_API_URL=https://api-sandbox.asaas.com/v3 antes de rodar.');
        process.exit(1);
    }
    if (config.asaas.apiKey.includes('_prod_')) {
        console.log('✗ A chave é de produção e a URL é de sandbox — o Asaas responderia 401.');
        process.exit(1);
    }
}

/* Apaga a cobrança de teste. Se falhar, só avisa: o teste já valeu. */
async function apagar(id) {
    try {
        await axios.delete(config.asaas.apiUrl + '/payments/' + id, {
            headers: { access_token: config.asaas.apiKey },
            timeout: 20000
        });
        console.log('  cobrança ' + id + ' apagada do sandbox');
    } catch (e) {
        console.log('  ⚠ não consegui apagar ' + id + ' (' + e.message + ') — apague pelo painel');
    }
}

async function main() {
    conferirConfiguracao();

    const produto = listarProdutos()[0];
    /* Usa o preço de verdade do lote: o Asaas recusa cobrança abaixo de
       R$ 5,00, e testar com o valor real é mais fiel de qualquer forma. */
    pedidoFalso.valorTotal = produto.precoUnitario * pedidoFalso.quantidade;
    console.log('Ambiente:', config.asaas.ambiente, '(' + config.asaas.apiUrl + ')');
    console.log('Chave:   ', config.asaas.apiKey.slice(0, 12) + '…');
    console.log('Pedido:  ', pedidoFalso.pedidoId, '—', formatarReais(pedidoFalso.valorTotal));
    console.log('');

    const criadas = [];

    // ---- 1 e 2: cliente + cobrança Pix ----
    const pix = await provedor.criarCobranca({ pedido: pedidoFalso, produto: produto, metodo: 'pix' });
    criadas.push(pix.transacaoId);
    console.log('✓ Cobrança Pix criada:', pix.transacaoId);

    if (pix.pix && pix.pix.copiaECola) {
        console.log('✓ Copia-e-cola recebido (' + pix.pix.copiaECola.length + ' caracteres)');
        console.log('  começa com:', pix.pix.copiaECola.slice(0, 40) + '…');
        console.log('  expira em: ', pix.pix.expiraEm || '(sem data)');
    } else {
        console.log('✗ O Pix veio SEM copia-e-cola — o campo payload em /pixQrCode mudou.');
    }
    console.log('  link da fatura:', pix.linkPagamento || '(nenhum)');

    // ---- 3: consulta de status ----
    const status = await provedor.consultarStatus(pix.transacaoId);
    if (status === 'PENDENTE') {
        console.log('✓ Consulta de status devolveu PENDENTE, como esperado');
    } else {
        console.log('✗ Consulta de status devolveu', status, '— esperava PENDENTE.');
    }

    // ---- 4: cartão ----
    const cartao = await provedor.criarCobranca({ pedido: pedidoFalso, produto: produto, metodo: 'cartao' });
    criadas.push(cartao.transacaoId);
    if (cartao.linkPagamento) {
        console.log('✓ Cobrança no cartão criada com link:', cartao.linkPagamento);
    } else {
        console.log('✗ Cobrança no cartão veio sem invoiceUrl — a compradora ficaria sem para onde ir.');
    }

    // ---- 5: celular recusado pelo Asaas não pode derrubar a venda ----
    const comFoneRuim = Object.assign({}, pedidoFalso, {
        pedidoId: pedidoFalso.pedidoId + '-FONE',
        cpf: '52998224725',            // outro CPF, para forçar um cadastro novo
        telefone: '91999999999'        // 11 dígitos iguais: o Asaas recusa
    });
    try {
        const teimoso = await provedor.criarCobranca({ pedido: comFoneRuim, produto: produto, metodo: 'pix' });
        criadas.push(teimoso.transacaoId);
        console.log('✓ Celular recusado: a cobrança saiu mesmo assim,', teimoso.transacaoId);
    } catch (e) {
        console.log('✗ Celular recusado derrubou a compra:', e.message);
    }

    console.log('\nLimpando o sandbox…');
    for (const id of criadas) await apagar(id);

    console.log('\nFalta testar o webhook: o Asaas só notifica URL pública,');
    console.log('então isso fica para quando a API estiver publicada (ou num túnel).');
}

main().catch(function (erro) {
    console.error('\n✗ Falhou:', erro.message);
    if (erro.response && erro.response.data) {
        console.error('  resposta do Asaas:', JSON.stringify(erro.response.data));
    }
    process.exit(1);
});
