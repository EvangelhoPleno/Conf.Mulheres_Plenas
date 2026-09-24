/* Ensaio do cartao pelo Checkout Pro, como a compradora faz
   (npm run mercadopago:ensaio-cartao).

   Sobe a API so neste computador, com a janela do lote aberta, pedidos em
   memoria e e-mail so no console. Cria um pedido de 1 ingresso no cartao,
   mostra o link do Mercado Pago e fica consultando o pedido a cada 5 s, do
   mesmo jeito que a pagina de pagamento faz, ate virar PAGO (ou 15 minutos).

   Com credencial de teste, o Mercado Pago so aceita pagamento feito na pagina
   dele, logado como uma conta de COMPRADOR de teste — pela API ele recusa com
   "Unauthorized use of live credentials". Por isso este ensaio e manual. */
process.env.PAYMENT_PROVIDER = 'mercadopago';
process.env.GOOGLE_SHEET_ID = '';
process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = '';
process.env.GOOGLE_CREDENTIALS_FILE = 'nao-existe.json';
process.env.RESEND_API_KEY = '';
process.env.API_URL = 'http://localhost:3996';
// o retorno do Mercado Pago cai aqui, e nao no site no ar, que nao conhece este pedido
process.env.SITE_URL = 'http://localhost:3996';

const http = require('http');
const handler = require('../../api/index.js');
const catalogo = require('../src/catalogo');

catalogo.buscarProduto('lote-1').vendaDe = '2026-01-01';

const BASE = 'http://localhost:3996/api';
const LIMITE_MS = 15 * 60 * 1000;

async function main() {
    const r = await fetch(BASE + '/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            produto: 'lote-1', quantidade: 1, metodo: 'cartao',
            nome: 'Maria de Teste', email: 'maria.teste@exemplo.com.br',
            cpf: '249.715.637-92', telefone: '(91) 98888-7777'
        })
    });
    const pedido = await r.json();
    if (r.status !== 201) throw new Error('checkout devolveu ' + r.status + ': ' + JSON.stringify(pedido));

    console.log('\nPedido ' + pedido.pedidoId + ' criado (R$ 55,00, 1 ingresso). Abra este link na janela');
    console.log('anonima em que voce entrou com a conta de COMPRADOR de teste:\n');
    console.log('  ' + pedido.linkPagamento + '\n');
    console.log('Cartao de teste (Novo cartao): Visa 4235 6477 2802 5682   CVV 123   validade 11/30   titular APRO');
    console.log('CPF, se pedir: 12345678909\n');
    console.log('Esperando o pagamento (ate 15 min)...');

    const inicio = Date.now();
    let ultimo = '';
    while (Date.now() - inicio < LIMITE_MS) {
        await new Promise(function (ok) { setTimeout(ok, 5000); });
        const atual = await (await fetch(BASE + '/pedidos/' + pedido.pedidoId)).json();
        if (atual.status !== ultimo) {
            console.log('  status: ' + atual.status);
            ultimo = atual.status;
        }
        if (atual.status === 'PAGO') {
            console.log('\nPAGO. Ingresso emitido: ' + atual.ingressos.map(function (i) { return i.codigo; }).join(', '));
            return true;
        }
    }
    console.log('\nTempo esgotado sem pagamento aprovado.');
    return false;
}

const servidor = http.createServer(handler).listen(3996, async function () {
    let passou = false;
    try { passou = await main(); } catch (e) { console.error('\nINTERROMPIDO:', e.message); }
    servidor.close();
    process.exit(passou ? 0 : 1);
});
