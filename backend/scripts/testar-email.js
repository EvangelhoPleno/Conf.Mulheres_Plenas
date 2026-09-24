/* Dispara um e-mail de ingresso de mentira para conferir domínio e entrega.
   Uso: npm run email:testar -- destino@exemplo.com
   O pedido é falso e o transacaoId começa com mock_, então o assunto sai
   marcado com [TESTE] e ninguém confunde com venda real. */
const config = require('../src/config');
const { enviarIngresso } = require('../src/services/emailService');

const destino = process.argv[2];

if (!destino || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(destino)) {
    console.error('Falta o destino. Ex.: npm run email:testar -- voce@gmail.com');
    process.exit(1);
}

const pedido = {
    pedidoId: 'TESTE-' + Date.now(),
    nome: 'Participante de Teste',
    email: destino,
    produto: '1º Lote — Conferência Mulheres Plenas',
    quantidade: 1,
    valorTotal: 5500,   // centavos
    codigos: ['MP26-TEST-0001'],
    transacaoId: 'mock_teste_dominio'
};

(async function () {
    console.log('Remetente :', config.email.remetente);
    console.log('Responder :', config.email.responderPara || '(vazio — respostas voltam)');
    console.log('Destino   :', destino);
    console.log('Site no e-mail:', config.siteUrl);
    console.log('');

    if (!config.email.configurado) {
        console.error('RESEND_API_KEY vazio no backend/.env — nada seria enviado de verdade.');
        process.exit(1);
    }

    try {
        const r = await enviarIngresso(pedido);
        console.log('Enviado. id do Resend:', r.id);
        console.log('');
        console.log('Agora no Gmail: abrir o e-mail → ⋮ → "Mostrar original".');
        console.log('SPF, DKIM e DMARC têm que dizer PASS nos três.');
    } catch (e) {
        console.error('Falhou:', e.message);
        if (e.detalhe) console.error(JSON.stringify(e.detalhe, null, 2));
        process.exit(1);
    }
})();
