/* =========================================================
   SUPORTE PLENO (botão flutuante de WhatsApp)
   Monta sozinho o botão e o painel em qualquer página que carregar este
   arquivo. A pessoa escolhe o tipo de suporte, preenche o nome e o que
   mais quiser, e o WhatsApp abre com a mensagem pronta para o número abaixo.
   Nada vai para o servidor: é só um link wa.me com o texto.

   EDITAR: NUMERO (com 55 + DDD) e a lista TIPOS. *negrito* é do WhatsApp.
   pedirCompra: mostra o campo "e-mail ou nº do pedido" para aquele tipo.
   ========================================================= */
(function () {
    var NUMERO = '5591982106431';

    var TIPOS = [
        { id: 'pagamento', rotulo: 'Dificuldade com o pagamento', pedirCompra: true },
        { id: 'ingresso', rotulo: 'Não recebi meu ingresso', pedirCompra: true },
        { id: 'dados', rotulo: 'Corrigir nome ou e-mail do ingresso', pedirCompra: true },
        { id: 'duvidas', rotulo: 'Dúvidas sobre o evento', pedirCompra: false },
        { id: 'outro', rotulo: 'Outro assunto', pedirCompra: false }
    ];

    var ICONE_WHATS = '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path fill="currentColor" d="M16.04 3C8.86 3 3.03 8.82 3.03 16c0 2.3.6 4.54 1.74 6.52L3 29l6.66-1.74A12.95 12.95 0 0 0 16.04 29C23.2 29 29.03 23.18 29.03 16S23.2 3 16.04 3Zm0 23.76c-1.95 0-3.86-.52-5.53-1.51l-.4-.24-3.95 1.03 1.05-3.85-.26-.4A10.7 10.7 0 0 1 5.3 16c0-5.93 4.82-10.75 10.75-10.75S26.78 10.07 26.78 16s-4.82 10.76-10.74 10.76Zm5.9-8.05c-.32-.16-1.91-.94-2.2-1.05-.3-.11-.51-.16-.73.16-.21.32-.83 1.05-1.02 1.27-.19.21-.37.24-.7.08-.32-.16-1.36-.5-2.59-1.6-.96-.85-1.6-1.9-1.8-2.23-.18-.32-.02-.5.15-.65.14-.15.32-.38.48-.56.16-.19.21-.32.32-.54.11-.21.05-.4-.03-.56-.08-.16-.73-1.75-1-2.4-.26-.63-.53-.54-.73-.55h-.62c-.21 0-.56.08-.86.4-.29.32-1.12 1.1-1.12 2.68s1.15 3.1 1.31 3.32c.16.21 2.26 3.45 5.47 4.84.77.33 1.36.53 1.83.68.77.24 1.47.21 2.02.13.62-.09 1.91-.78 2.18-1.54.27-.75.27-1.4.19-1.54-.08-.13-.29-.21-.61-.37Z"/></svg>';

    function el(tag, classe, html) {
        var no = document.createElement(tag);
        if (classe) no.className = classe;
        if (html) no.innerHTML = html;
        return no;
    }

    function montar() {
        var raiz = el('div', 'suporte');

        var botao = el('button', 'suporte-botao',
            '<img class="suporte-botao-logo" src="assets/imagens/marca/coracao-160.png" alt="" width="160" height="160">' +
            '<span class="suporte-botao-texto"><strong>Suporte Pleno</strong><small>Fale com a gente</small></span>' +
            '<span class="suporte-botao-whats">' + ICONE_WHATS + '<span class="suporte-botao-x" aria-hidden="true">&#x2715;</span></span>');
        botao.type = 'button';
        botao.setAttribute('aria-label', 'Abrir o Suporte Pleno no WhatsApp');
        botao.setAttribute('aria-expanded', 'false');
        botao.setAttribute('aria-controls', 'suportePainel');

        var opcoes = TIPOS.map(function (t, i) {
            return '<label class="suporte-opcao"><input type="radio" name="suporteTipo" value="' + t.id + '"' +
                (i === 0 ? ' required' : '') + '><span>' + t.rotulo + '</span></label>';
        }).join('');

        var painel = el('form', 'suporte-painel');
        painel.id = 'suportePainel';
        painel.setAttribute('role', 'dialog');
        painel.setAttribute('aria-labelledby', 'suporteTitulo');
        painel.hidden = true;
        painel.tabIndex = -1;
        painel.setAttribute('data-lenis-prevent', '');
        painel.innerHTML =
            '<button class="suporte-fechar" type="button" aria-label="Fechar">&#x2715;</button>' +
            '<p class="suporte-kicker">Conferência Mulheres Plenas</p>' +
            '<h2 class="suporte-titulo" id="suporteTitulo">Suporte Pleno</h2>' +
            '<p class="suporte-intro">Conte pra gente como podemos ajudar. A mensagem vai pronta para o nosso WhatsApp.</p>' +
            '<fieldset class="suporte-tipos"><legend>Qual o assunto?</legend>' + opcoes + '</fieldset>' +
            '<label class="suporte-campo">Seu nome<input type="text" name="nome" autocomplete="name" maxlength="80" required></label>' +
            '<label class="suporte-campo" data-campo-compra hidden>E-mail usado na compra ou nº do pedido<input type="text" name="compra" autocomplete="email" maxlength="120"></label>' +
            '<label class="suporte-campo"><span>Mensagem <small>(opcional)</small></span><textarea name="mensagem" rows="3" maxlength="600"></textarea></label>' +
            '<button class="suporte-enviar" type="submit">' + ICONE_WHATS + 'Falar no WhatsApp</button>';

        raiz.appendChild(painel);
        raiz.appendChild(botao);
        document.body.appendChild(raiz);

        var campoCompra = painel.querySelector('[data-campo-compra]');
        var inputCompra = campoCompra.querySelector('input');

        // Nas páginas do pedido o código já está na URL: vem preenchido.
        var pedidoUrl = new URLSearchParams(location.search).get('pedido');
        if (pedidoUrl) inputCompra.value = pedidoUrl.slice(0, 120);

        function tipoEscolhido() {
            var marcado = painel.querySelector('input[name="suporteTipo"]:checked');
            if (!marcado) return null;
            return TIPOS.filter(function (t) { return t.id === marcado.value; })[0];
        }

        function abrir() {
            painel.hidden = false;
            raiz.classList.add('is-aberto');
            botao.setAttribute('aria-expanded', 'true');
            // Foco no painel, não na primeira opção: no iPhone o foco numa
            // opção desenha um quadrado em volta dela. O Tab entra nas opções.
            painel.focus();
        }

        function fechar(devolverFoco) {
            painel.hidden = true;
            raiz.classList.remove('is-aberto');
            botao.setAttribute('aria-expanded', 'false');
            if (devolverFoco) botao.focus();
        }

        botao.addEventListener('click', function () {
            if (painel.hidden) abrir(); else fechar(false);
        });
        painel.querySelector('.suporte-fechar').addEventListener('click', function () { fechar(true); });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !painel.hidden) fechar(true);
        });
        document.addEventListener('click', function (e) {
            if (!painel.hidden && !raiz.contains(e.target)) fechar(false);
        });

        painel.addEventListener('change', function (e) {
            if (e.target.name !== 'suporteTipo') return;
            var tipo = tipoEscolhido();
            campoCompra.hidden = !(tipo && tipo.pedirCompra);
        });

        painel.addEventListener('submit', function (e) {
            e.preventDefault();
            var tipo = tipoEscolhido();
            var nome = painel.nome.value.trim();
            var compra = campoCompra.hidden ? '' : inputCompra.value.trim();
            var mensagem = painel.mensagem.value.trim();

            var linhas = [
                '*Suporte Pleno* 🤎',
                'Conferência Mulheres Plenas',
                '',
                '*Assunto:* ' + tipo.rotulo,
                '*Nome:* ' + nome
            ];
            if (compra) linhas.push('*E-mail / pedido:* ' + compra);
            if (mensagem) linhas.push('', '*Mensagem:*', mensagem);

            window.open('https://wa.me/' + NUMERO + '?text=' + encodeURIComponent(linhas.join('\n')), '_blank', 'noopener');
            fechar(true);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', montar);
    } else {
        montar();
    }
})();
