/* Envio de e-mail pelo Resend. Sem RESEND_API_KEY, só registra no console
   (e, fora de produção, grava o HTML em tmp/ para abrir no navegador). */
const fs = require('fs');
const path = require('path');
const { Resend } = require('resend');
const config = require('../config');
const { emailIngresso } = require('../templates/emailIngresso');

let resend = null;

// opcoes.reenvio: envio manual pelo admin, que precisa passar pela trava de duplicidade
async function enviarIngresso(pedido, opcoes) {
    const email = emailIngresso(pedido);
    const { html, text } = email;
    // pedidos do pagamento simulado ficam marcados para ninguém confundir com venda real
    const assunto = (String(pedido.transacaoId).startsWith('mock_') ? '[TESTE] ' : '') + email.assunto;

    if (!config.email.configurado) {
        console.log('[email] RESEND_API_KEY vazio: e-mail NÃO enviado. Para:', pedido.email, '|', assunto);
        if (config.ambiente === 'development') {
            try {
                const pasta = path.join(__dirname, '..', '..', 'tmp');
                fs.mkdirSync(pasta, { recursive: true });
                const arquivo = path.join(pasta, 'email-' + pedido.pedidoId + '.html');
                fs.writeFileSync(arquivo, html);
                console.log('[email] prévia em', arquivo);
            } catch (e) { /* a prévia é só conveniência */ }
        }
        return { enviado: false, simulado: true };
    }

    if (!resend) resend = new Resend(config.email.resendApiKey);
    // fixada antes das tentativas: no reenvio, as repetições têm de ser o mesmo envio
    const chave = 'ingresso-' + pedido.pedidoId + (opcoes && opcoes.reenvio ? '-' + Date.now() : '');

    /* O Resend aceita poucos envios por segundo por conta; numa leva de
       pagamentos juntos ele responde "rate_limit_exceeded". E o webhook e a
       página de pagamento podem mandar o MESMO ingresso ao mesmo tempo
       ("concurrent_idempotent_requests"). Os dois passam esperando um pouco. */
    const PASSAGEIROS = ['rate_limit_exceeded', 'concurrent_idempotent_requests', 'internal_server_error', 'application_error'];
    function enviarUmaVez() {
        return resend.emails.send({
            from: config.email.remetente,
            to: [pedido.email],
            replyTo: config.email.responderPara || undefined,
            subject: assunto,
            html,
            text
        }, {
            // o Resend ignora repetições com a mesma chave por 24h: evita e-mail
            // duplicado se o webhook e a consulta de status chegarem juntos
            idempotencyKey: chave
        });
    }

    let resposta;
    for (let tentativa = 1; tentativa <= 4; tentativa++) {
        resposta = await enviarUmaVez();
        const erro = resposta.error;
        if (!erro || !PASSAGEIROS.includes(erro.name) || tentativa === 4) break;
        await new Promise(function (r) { setTimeout(r, 800 * tentativa + Math.random() * 700); });
    }
    const { data, error } = resposta;

    if (error) {
        const falha = new Error('Resend: ' + (error.message || error.name));
        falha.detalhe = error;
        throw falha;
    }
    return { enviado: true, id: data && data.id };
}

module.exports = { enviarIngresso };
