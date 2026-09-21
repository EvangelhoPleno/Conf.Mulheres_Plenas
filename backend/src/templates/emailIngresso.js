/* E-mail do ingresso. HTML com estilos inline e tabelas, porque é o que
   Gmail, Outlook e os apps de celular respeitam. Cores da identidade:
   tijolo #85351E, terracota #B8684F, nude #DFB9A6, rosado #F5E8E2. */
const config = require('../config');
const { evento, formatarReais } = require('../catalogo');
const { escapar } = require('../utils/html');

const COR = { tijolo: '#85351E', terracota: '#B8684F', nude: '#DFB9A6', rosado: '#F5E8E2', papel: '#FBF5F2', texto: '#4A2116' };

function blocoIngresso(codigo, indice, total) {
    const qr = config.apiUrl + '/api/ingressos/' + encodeURIComponent(codigo) + '/qr.png';
    return `
        <tr><td style="padding:0 0 16px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:2px dashed ${COR.nude};border-radius:14px">
                <tr><td style="padding:18px;text-align:center">
                    <p style="margin:0 0 4px;font:700 12px/1.3 Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;color:${COR.terracota}">Ingresso ${indice + 1} de ${total}</p>
                    <img src="${qr}" width="180" height="180" alt="QR Code do ingresso ${escapar(codigo)}" style="display:block;margin:8px auto;border:0">
                    <p style="margin:6px 0 0;font:700 20px/1.2 'Courier New',monospace;letter-spacing:2px;color:${COR.tijolo}">${escapar(codigo)}</p>
                </td></tr>
            </table>
        </td></tr>`;
}

function linhaResumo(rotulo, valor, ultima) {
    const borda = ultima ? '' : `border-bottom:1px solid ${COR.nude};`;
    return `<tr><td style="padding:6px 0;${borda}">${rotulo}</td><td align="right" style="padding:6px 0;${borda}">${valor}</td></tr>`;
}

function emailIngresso(pedido) {
    const primeiroNome = String(pedido.nome).split(' ')[0];
    const linkConfirmacao = config.siteUrl + '/confirmacao.html?pedido=' + encodeURIComponent(pedido.pedidoId);
    const total = pedido.codigos.length;

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ingresso confirmado</title></head>
<body style="margin:0;padding:0;background:${COR.rosado}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COR.rosado}">
<tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${COR.papel};border-radius:18px;overflow:hidden">
        <tr><td style="background:${COR.tijolo};padding:28px 24px;text-align:center">
            <p style="margin:0;font:700 12px/1.3 Arial,sans-serif;letter-spacing:3px;text-transform:uppercase;color:${COR.nude}">${escapar(evento.nome)}</p>
            <h1 style="margin:10px 0 0;font:700 30px/1.15 Georgia,serif;color:${COR.rosado}">Seu ingresso está confirmado!</h1>
        </td></tr>

        <tr><td style="padding:28px 24px 8px;font:16px/1.6 Arial,sans-serif;color:${COR.texto}">
            <p style="margin:0 0 14px">Olá, <strong>${escapar(primeiroNome)}</strong>!</p>
            <p style="margin:0 0 14px">Recebemos o seu pagamento e a sua vaga na <strong>${escapar(evento.nome)}</strong> está garantida. Estamos esperando por você!</p>
            <p style="margin:0 0 20px;padding:14px 16px;background:${COR.rosado};border-left:4px solid ${COR.terracota};border-radius:6px">
                <strong>Na portaria:</strong> apresente este e-mail (no celular ou impresso) com o QR Code de cada ingresso.
            </p>
        </td></tr>

        <tr><td style="padding:0 24px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${pedido.codigos.map(function (c, i) { return blocoIngresso(c, i, total); }).join('')}
            </table>
        </td></tr>

        <tr><td style="padding:4px 24px 8px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font:14px/1.5 Arial,sans-serif;color:${COR.texto}">
                ${linhaResumo('Participante', '<strong>' + escapar(pedido.nome) + '</strong>')}
                ${linhaResumo('Ingresso', escapar(pedido.produto) + ' × ' + pedido.quantidade)}
                ${linhaResumo('Valor pago', formatarReais(pedido.valorTotal))}
                ${linhaResumo('Data', escapar(evento.data))}
                ${linhaResumo('Local', escapar(evento.local))}
                ${linhaResumo('ID da transação', '<span style="font-family:\'Courier New\',monospace">' + escapar(pedido.transacaoId) + '</span>', true)}
            </table>
        </td></tr>

        <tr><td align="center" style="padding:22px 24px 30px">
            <a href="${linkConfirmacao}" style="display:inline-block;padding:14px 28px;background:${COR.tijolo};color:${COR.rosado};border-radius:999px;font:700 14px/1 Arial,sans-serif;letter-spacing:1px;text-transform:uppercase;text-decoration:none">Ver meus ingressos</a>
            <p style="margin:18px 0 0;font:13px/1.5 Arial,sans-serif;color:${COR.terracota}">Guarde este e-mail. Cada QR Code vale uma entrada.</p>
        </td></tr>

        <tr><td style="background:${COR.tijolo};padding:16px 24px;text-align:center;font:12px/1.5 Arial,sans-serif;color:${COR.nude}">
            Realização: ${escapar(evento.realizacao)} · ${escapar(evento.local)}
        </td></tr>
    </table>
</td></tr>
</table>
</body>
</html>`;

    const text = [
        'Olá, ' + primeiroNome + '!',
        '',
        'Seu ingresso para a ' + evento.nome + ' está confirmado.',
        'Apresente este e-mail na portaria.',
        '',
        'Participante: ' + pedido.nome,
        'Ingresso: ' + pedido.produto + ' x' + pedido.quantidade,
        'Códigos: ' + pedido.codigos.join(', '),
        'ID da transação: ' + pedido.transacaoId,
        '',
        'Ver ingressos: ' + linkConfirmacao
    ].join('\n');

    return { assunto: 'Ingresso Confirmado! (Guarde este e-mail)', html, text };
}

module.exports = { emailIngresso };
