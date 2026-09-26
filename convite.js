/* =========================================================
   CONVIDAR UMA AMIGA (botões com data-convite)
   Abre o WhatsApp com o texto pronto; a pessoa só escolhe o contato.
   A imagem chega pela pré-visualização do link (og:image no index.html:
   assets/imagens/compartilhamento-convite.jpg), que o WhatsApp monta
   sozinho. Anexar a foto pelo próprio botão não é confiável: no iPhone o
   WhatsApp descarta o texto quando recebe imagem junto.

   EDITAR: os textos abaixo. *negrito* e _itálico_ são do WhatsApp.
   data-convite="comprei" usa o segundo texto (página de confirmação).
   ========================================================= */
(function () {
    var SITE = 'https://evangelhoplenoparagominas.com.br';

    var TEXTOS = {
        padrao: [
            '🤎 *Amiga, esse convite é pra você!*',
            '',
            'Nos dias *16 e 17 de outubro* vai acontecer em Paragominas a *Conferência Mulheres Plenas* 🌿',
            '',
            'Dois dias para sermos _moldadas pelo Espírito e movidas pelo Propósito_. Deus não está apenas nos consertando: Ele restaura a nossa história e nos torna *plenas*. ✨',
            '',
            'Eu não quero viver isso sem você. Bora juntas? 🙌',
            'As vagas são limitadas, garanta a sua aqui:',
            '👉 ' + SITE
        ],
        comprei: [
            '🤎 *Amiga, acabei de garantir meu lugar na Conferência Mulheres Plenas!*',
            '',
            'Dias *16 e 17 de outubro*, em Paragominas 🌿 Dois dias para sermos _moldadas pelo Espírito e movidas pelo Propósito_.',
            '',
            'Seria lindo viver isso ao seu lado. Vem comigo? 🙌',
            'As vagas são limitadas, garanta a sua aqui:',
            '👉 ' + SITE
        ]
    };

    document.querySelectorAll('[data-convite]').forEach(function (botao) {
        var texto = (TEXTOS[botao.dataset.convite] || TEXTOS.padrao).join('\n');
        botao.href = 'https://wa.me/?text=' + encodeURIComponent(texto);
    });
})();
