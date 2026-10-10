/* =============================================================
   PORTARIA — confirmação de entrada no dia da conferência.
   Lista dos ingressos PAGOS vinda de /api/portaria/lista (senha da
   portaria). A busca é toda no celular: só confirmar/desfazer vai ao
   servidor, que relê a planilha e avisa se outro celular já confirmou.

   Duas abas: "Buscar" (busca + últimas confirmadas) e "Confirmadas"
   (histórico completo, com desfazer). Toda confirmação aparece na hora,
   sem recarregar: o estado local é atualizado com a resposta do servidor.
   ============================================================= */
(function () {
    'use strict';

    var API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://localhost:3000/api' : '/api';
    var ATUALIZAR_MS = 20000;
    var FECHAR_AVISO_MS = 2500;
    var MAX_RESULTADOS = 40;
    var RECENTES = 6;
    // o que este celular acabou de gravar vale por cima da lista do servidor
    // durante este tempo: outra instância da Vercel pode responder com uma
    // cópia de segundos atrás, e a entrada "voltaria" a não confirmada
    var LOCAL_VALE_MS = 30000;
    var NOVO_MS = 60000;  // selo "agora" na entrada recém-confirmada

    var sessao = carregar();
    var ingressos = [];
    var porCodigo = {};
    var locais = {};      // codigo -> { entrada, em }
    var animados = {};    // a entrada nova desliza só uma vez, não a cada redesenho
    var aba = 'buscar';
    var filtro = 'todas';
    var ultimoCodigo = null;
    var aguardandoDesfazer = null;
    var timerAviso = null;
    var timerLista = null;
    var timerToast = null;

    function $(s) { return document.querySelector(s); }
    function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }

    function el(tag, classe, texto) {
        var e = document.createElement(tag);
        if (classe) e.className = classe;
        if (texto != null) e.textContent = texto;
        return e;
    }

    /* ---------- sessão guardada no celular ---------- */
    function carregar() {
        try { return JSON.parse(localStorage.getItem('mp-portaria') || '{}') || {}; } catch (e) { return {}; }
    }
    function salvar() {
        try { localStorage.setItem('mp-portaria', JSON.stringify(sessao)); } catch (e) { /* aba anônima */ }
    }

    // link portaria.html#senha=...: guarda e tira da barra de endereço
    var hash = /[#&]senha=([^&]+)/.exec(location.hash);
    if (hash) {
        sessao.senha = decodeURIComponent(hash[1]);
        salvar();
        history.replaceState(null, '', location.pathname + location.search);
    }

    function api(caminho, corpo) {
        var opcoes = { headers: { Authorization: 'Bearer ' + (sessao.senha || '') }, cache: 'no-store' };
        if (corpo) {
            opcoes.method = 'POST';
            opcoes.headers['Content-Type'] = 'application/json';
            opcoes.body = JSON.stringify(corpo);
        }
        return fetch(API + caminho, opcoes).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (dados) {
                dados.status = r.status;
                return dados;
            });
        });
    }

    function tela(nome) {
        $$('[data-tela]').forEach(function (e) { e.hidden = e.dataset.tela !== nome; });
    }

    /* ---------- entrar / sair ---------- */
    function mostrarEntrar(erro) {
        var form = $('[data-form-entrar]');
        form.senha.value = sessao.senha || '';
        form.por.value = sessao.por || '';
        var caixa = $('[data-erro-entrar]');
        caixa.textContent = erro || '';
        caixa.hidden = !erro;
        clearTimeout(timerLista);
        tela('entrar');
        (sessao.senha ? form.por : form.senha).focus();
    }

    $('[data-form-entrar]').addEventListener('submit', function (e) {
        e.preventDefault();
        sessao.senha = this.senha.value.trim();
        sessao.por = this.por.value.trim().slice(0, 30);
        salvar();
        iniciar();
    });

    $('[data-sair]').addEventListener('click', function () {
        sessao = {};
        salvar();
        mostrarEntrar();
    });

    function iniciar() {
        if (!sessao.senha || !sessao.por) return mostrarEntrar();
        var botao = $('[data-form-entrar] .botao');
        botao.classList.add('is-carregando');
        atualizarLista().then(function (ok) {
            botao.classList.remove('is-carregando');
            if (!ok) return;
            $('[data-por]').textContent = sessao.por;
            tela('lista');
            irPara('buscar');
        });
    }

    /* ---------- dados ---------- */
    function atualizarLista() {
        clearTimeout(timerLista);
        return api('/portaria/lista').then(function (dados) {
            if (dados.status === 401 || dados.status === 503) {
                mostrarEntrar(dados.status === 401 ? 'Senha incorreta.' : 'A portaria ainda não foi ligada no servidor.');
                return false;
            }
            if (dados.status !== 200) throw new Error(dados.erro || 'falhou');
            receber(dados.ingressos);
            sinal(true);
            desenhar();
            agendar();
            return true;
        }).catch(function () {
            sinal(false);
            agendar();
            if ($('[data-tela="lista"]').hidden) mostrarEntrar('Sem conexão com o servidor. Confira a internet e tente de novo.');
            return false;
        });
    }

    function receber(lista) {
        var agora = Date.now();
        var novos = {};
        ingressos.forEach(function (i) { if (i.novo) novos[i.codigo] = i.novo; });
        ingressos = lista.map(function (i) {
            i.busca = normalizar(i.nome);
            i.codigoBusca = i.codigo.replace(/[^A-Z0-9]/g, '');
            var local = locais[i.codigo];
            if (local && agora - local.em < LOCAL_VALE_MS) i.entrada = local.entrada;
            if (novos[i.codigo]) i.novo = novos[i.codigo];
            return i;
        });
        porCodigo = {};
        ingressos.forEach(function (i) { porCodigo[i.codigo] = i; });
        agrupar();
    }

    function gravarLocal(i, entrada) {
        i.entrada = entrada;
        i.novo = entrada ? Date.now() : 0;
        locais[i.codigo] = { entrada: entrada, em: Date.now() };
    }

    function agendar() {
        clearTimeout(timerLista);
        timerLista = setTimeout(function () {
            if (!document.hidden) atualizarLista(); else agendar();
        }, ATUALIZAR_MS);
    }

    document.addEventListener('visibilitychange', function () {
        if (!document.hidden && !$('[data-tela="lista"]').hidden) atualizarLista();
    });

    /* Mais de um ingresso no mesmo CPF: quem comprou para outras pessoas
       com os próprios dados. Cada ingresso entra separado, e a porta precisa
       ver "ingresso 2 de 3" e quantos ainda restam. */
    function agrupar() {
        var grupos = {};
        ingressos.forEach(function (i) {
            var chave = i.cpf.length === 11 ? i.cpf : 'nome:' + i.busca;
            (grupos[chave] = grupos[chave] || []).push(i);
        });
        Object.keys(grupos).forEach(function (chave) {
            var g = grupos[chave].sort(function (a, b) { return a.codigo < b.codigo ? -1 : 1; });
            g.forEach(function (i, n) { i.grupo = g; i.posicao = n + 1; });
        });
    }

    function semUso(i) {
        return i.grupo.filter(function (x) { return !x.entrada; }).length;
    }

    /* "09/10 19:08:42 · Ana" -> partes (os segundos podem faltar) */
    function lerEntrada(texto) {
        var p = /^(\d\d)\/(\d\d) (\d\d):(\d\d)(?::(\d\d))?(?: · (.*))?$/.exec(texto || '');
        if (!p) return { dia: '', hora: '', por: '', ordem: '' };
        return {
            dia: p[1] + '/' + p[2],
            hora: p[3] + ':' + p[4],
            por: p[6] || '',
            ordem: p[2] + p[1] + p[3] + p[4] + (p[5] || '00')
        };
    }

    function confirmadas() {
        return ingressos.filter(function (i) { return i.entrada; }).sort(function (a, b) {
            return lerEntrada(b.entrada).ordem.localeCompare(lerEntrada(a.entrada).ordem) || (b.novo || 0) - (a.novo || 0);
        });
    }

    function minha(i) {
        return lerEntrada(i.entrada).por === sessao.por;
    }

    /* ---------- desenho ---------- */
    function desenhar() {
        placar();
        buscar();
        desenharRecentes();
        desenharConfirmadas();
    }

    function sinal(ok) {
        var s = $('[data-sinal]');
        s.classList.toggle('is-off', !ok);
        s.textContent = ok ? 'ao vivo' : 'sem conexão';
    }

    function placar() {
        var presentes = ingressos.filter(function (i) { return i.entrada; }).length;
        var pct = ingressos.length ? Math.round((presentes / ingressos.length) * 100) : 0;
        $('[data-presentes]').textContent = presentes;
        $('[data-total]').textContent = ingressos.length;
        $('[data-porcento]').textContent = pct + '%';
        $('[data-barra]').style.width = pct + '%';
        $('[data-conta]').textContent = presentes;
    }

    function mascararCpf(cpf) {
        if (cpf.length !== 11) return '';
        return '•••.' + cpf.slice(3, 6) + '.' + cpf.slice(6, 9) + '-••';
    }

    function linhaDetalhe(i) {
        var det = el('p', 'item-detalhe', i.codigo);
        if (mascararCpf(i.cpf)) {
            det.appendChild(document.createTextNode(' · '));
            det.appendChild(el('span', 'item-cpf', 'CPF ' + mascararCpf(i.cpf)));
        }
        return det;
    }

    function seloGrupo(i) {
        if (i.grupo.length < 2) return null;
        var entraram = i.grupo.length - semUso(i);
        return el('p', 'item-grupo', 'ingresso ' + i.posicao + ' de ' + i.grupo.length + ' neste CPF' +
            (entraram ? ' · ' + entraram + ' já ' + (entraram > 1 ? 'entraram' : 'entrou') : ''));
    }

    function botaoDesfazer(i) {
        var b = el('button', 'botao-desfazer', 'desfazer');
        b.type = 'button';
        b.setAttribute('aria-label', 'Desfazer a entrada de ' + i.nome);
        b.addEventListener('click', function () { perguntarDesfazer(i); });
        return b;
    }

    // resultado da busca (tudo por textContent: o nome vem do que a compradora digitou)
    function cartaoBusca(i) {
        var li = el('li', 'item' + (i.entrada ? ' is-dentro' : ''));
        var info = el('div', 'item-info');
        info.appendChild(el('p', 'item-nome', i.nome));
        info.appendChild(linhaDetalhe(i));
        var g = seloGrupo(i);
        if (g) info.appendChild(g);
        li.appendChild(info);

        if (i.entrada) {
            var e = lerEntrada(i.entrada);
            info.appendChild(el('p', 'item-selo', '✓ entrou às ' + (e.hora || i.entrada) + (e.por ? ' · ' + e.por : '')));
            li.appendChild(botaoDesfazer(i));
        } else {
            var b = el('button', 'botao item-confirmar', 'Confirmar entrada');
            b.type = 'button';
            b.addEventListener('click', function () { confirmar(i, b); });
            li.appendChild(b);
        }
        return li;
    }

    // linha do histórico: hora grande à esquerda
    function linhaEntrada(i) {
        var e = lerEntrada(i.entrada);
        var novo = i.novo && Date.now() - i.novo < NOVO_MS;
        var li = el('li', 'entrada' + (novo ? ' is-novo' : ''));
        if (novo && !animados[i.codigo + i.novo]) {
            li.classList.add('is-chegando');
            setTimeout(function () { animados[i.codigo + i.novo] = true; }, 600);
        }
        var hora = el('div', 'entrada-hora');
        hora.appendChild(el('strong', null, e.hora || '—'));
        hora.appendChild(el('small', null, novo ? 'agora' : e.dia));
        li.appendChild(hora);

        var info = el('div', 'item-info');
        info.appendChild(el('p', 'item-nome', i.nome));
        info.appendChild(linhaDetalhe(i));
        var g = seloGrupo(i);
        if (g) info.appendChild(g);
        if (e.por) info.appendChild(el('p', 'entrada-por', 'confirmado por ' + (e.por === sessao.por ? 'você' : e.por)));
        li.appendChild(info);
        li.appendChild(botaoDesfazer(i));
        return li;
    }

    /* ---------- busca ---------- */
    function normalizar(t) {
        return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    }

    function combina(i, q) {
        var digitos = q.replace(/\D/g, '');
        var compacto = q.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (compacto.length >= 4 && i.codigoBusca.indexOf(compacto) > -1) return true;
        if (digitos.length >= 3 && digitos.length === q.replace(/[\s.\-]/g, '').length) {
            return i.cpf.indexOf(digitos) > -1;
        }
        var partes = normalizar(q).split(' ');
        return partes.every(function (p) { return i.busca.indexOf(p) > -1; });
    }

    var busca = $('[data-busca]');

    function buscar() {
        var q = busca.value.trim();
        var lista = $('[data-resultados]');
        var dica = $('[data-dica]');
        $('[data-limpar]').hidden = !q;
        lista.textContent = '';
        $('[data-recentes]').hidden = !!q || !confirmadas().length;

        if (!q) {
            dica.textContent = 'Busque pelo nome, por números do CPF ou pelo código do ingresso.';
            dica.hidden = false;
            return;
        }
        if (q.replace(/\s/g, '').length < 3) {
            dica.textContent = 'Continue digitando: pelo menos 3 letras ou números.';
            dica.hidden = false;
            return;
        }
        var achados = ingressos.filter(function (i) { return combina(i, q); }).sort(function (a, b) {
            // os ingressos do mesmo CPF ficam juntos e em ordem (1 de 3, 2 de 3...)
            if (a.grupo === b.grupo) return a.posicao - b.posicao;
            return a.grupo[0].busca.localeCompare(b.grupo[0].busca);
        });
        if (!achados.length) {
            dica.textContent = 'Ninguém encontrado entre os pagos. Tente outra parte do nome, o CPF ou o código do e-mail.';
            dica.hidden = false;
            return;
        }
        dica.hidden = achados.length <= MAX_RESULTADOS;
        dica.textContent = achados.length + ' encontradas: mostrando ' + MAX_RESULTADOS + '. Digite mais para filtrar.';
        achados.slice(0, MAX_RESULTADOS).forEach(function (i) { lista.appendChild(cartaoBusca(i)); });
    }

    function desenharRecentes() {
        var lista = $('[data-recentes-lista]');
        lista.textContent = '';
        confirmadas().slice(0, RECENTES).forEach(function (i) { lista.appendChild(linhaEntrada(i)); });
    }

    function desenharConfirmadas() {
        var todas = confirmadas();
        var minhas = todas.filter(minha);
        $('[data-conta-todas]').textContent = todas.length;
        $('[data-conta-minhas]').textContent = minhas.length;
        $$('[data-filtro]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.filtro === filtro)); });

        var mostrar = filtro === 'minhas' ? minhas : todas;
        var lista = $('[data-confirmadas]');
        var dica = $('[data-dica-confirmadas]');
        lista.textContent = '';
        dica.hidden = mostrar.length > 0;
        dica.textContent = filtro === 'minhas'
            ? 'Você ainda não confirmou nenhuma entrada.'
            : 'Nenhuma entrada confirmada ainda. Elas aparecem aqui na hora, a mais recente no topo.';
        mostrar.forEach(function (i) { lista.appendChild(linhaEntrada(i)); });
    }

    busca.addEventListener('input', buscar);
    $('[data-limpar]').addEventListener('click', function () {
        busca.value = '';
        buscar();
        busca.focus();
    });

    /* ---------- abas ---------- */
    function irPara(nome) {
        aba = nome;
        $$('[data-aba]').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.aba === nome)); });
        $$('[data-painel]').forEach(function (p) { p.hidden = p.dataset.painel !== nome; });
        window.scrollTo(0, 0);
        if (nome === 'buscar') busca.focus();
    }

    $$('[data-aba]').forEach(function (b) {
        b.addEventListener('click', function () { irPara(b.dataset.aba); });
    });
    $('[data-ver-todas]').addEventListener('click', function () { irPara('confirmadas'); });
    $$('[data-filtro]').forEach(function (b) {
        b.addEventListener('click', function () {
            filtro = b.dataset.filtro;
            desenharConfirmadas();
        });
    });

    /* ---------- confirmar ---------- */
    function ocupado(botao, sim) {
        if (!botao) return;
        botao.disabled = sim;
        botao.classList.toggle('is-carregando', sim);
    }

    function confirmar(i, botao) {
        ocupado(botao, true);
        api('/portaria/entrada', { codigo: i.codigo, por: sessao.por }).then(function (r) {
            ocupado(botao, false);
            i = porCodigo[i.codigo] || i;  // a lista pode ter sido renovada no meio
            if (r.status === 200 || r.status === 409) {
                gravarLocal(i, r.entrada);
                if (r.status === 409) i.novo = 0;
                ultimoCodigo = i.codigo;
                desenhar();
                sinal(true);
                if (r.status === 200) {
                    var resta = semUso(i);
                    aviso('ok', 'Entrada confirmada', i.nome, 'às ' + lerEntrada(r.entrada).hora + ' · ' + i.codigo, true,
                        resta ? 'Este CPF tem mais ' + resta + (resta > 1 ? ' ingressos' : ' ingresso') + ' sem uso (acompanhantes).' : '');
                } else {
                    var e = lerEntrada(r.entrada);
                    aviso('ja', 'Este ingresso já entrou', i.nome,
                        'Entrada registrada às ' + (e.hora || r.entrada) + (e.por ? ', por ' + e.por : '') + '.', false);
                }
            } else if (r.status === 401) {
                mostrarEntrar('A senha da portaria mudou. Entre de novo.');
            } else {
                aviso('erro', 'Não confirmou', i.nome, r.erro || 'Tente de novo.', false);
            }
        }).catch(function () {
            ocupado(botao, false);
            sinal(false);
            aviso('erro', 'Sem conexão', i.nome, 'A entrada NÃO foi registrada. Confira a internet e toque de novo.', false);
        });
    }

    /* ---------- desfazer ---------- */
    function perguntarDesfazer(i) {
        aguardandoDesfazer = i;
        var e = lerEntrada(i.entrada);
        $('[data-pergunta-nome]').textContent = i.nome;
        $('[data-pergunta-detalhe]').textContent = i.codigo + ' · entrou às ' + (e.hora || i.entrada) + (e.por ? ' · ' + e.por : '');
        $('[data-pergunta]').hidden = false;
        $('[data-pergunta-nao]').focus();
    }

    function fecharPergunta() {
        aguardandoDesfazer = null;
        $('[data-pergunta]').hidden = true;
    }

    $('[data-pergunta-nao]').addEventListener('click', fecharPergunta);
    $('[data-pergunta-sim]').addEventListener('click', function () {
        if (aguardandoDesfazer) desfazer(aguardandoDesfazer, this);
    });

    function desfazer(i, botao) {
        ocupado(botao, true);
        api('/portaria/desfazer', { codigo: i.codigo }).then(function (r) {
            ocupado(botao, false);
            i = porCodigo[i.codigo] || i;
            if (r.status !== 200) {
                fecharPergunta();
                aviso('erro', 'Não desfez', i.nome, r.erro || 'Tente de novo.', false);
                return;
            }
            gravarLocal(i, null);
            fecharPergunta();
            fecharAviso();
            desenhar();
            toast('Entrada de ' + i.nome.split(' ')[0] + ' desfeita.');
        }).catch(function () {
            ocupado(botao, false);
            fecharPergunta();
            aviso('erro', 'Sem conexão', i.nome, 'A entrada NÃO foi desfeita. Confira a internet e tente de novo.', false);
        });
    }

    /* ---------- aviso grande ---------- */
    function aviso(tipo, titulo, nome, detalhe, podeDesfazer, extra) {
        clearTimeout(timerAviso);
        var a = $('[data-aviso]');
        a.className = 'aviso aviso--' + tipo;
        $('[data-aviso-icone]').textContent = tipo === 'ok' ? '✓' : '!';
        $('[data-aviso-titulo]').textContent = titulo;
        $('[data-aviso-nome]').textContent = nome;
        $('[data-aviso-detalhe]').textContent = detalhe || '';
        $('[data-aviso-extra]').textContent = extra || '';
        $('[data-aviso-extra]').hidden = !extra;
        $('[data-aviso-desfazer]').hidden = !podeDesfazer;
        $('[data-aviso-ok]').textContent = tipo === 'ok' ? 'Próxima' : 'Entendi';

        // confirmação fecha sozinha (sem pressa quando há acompanhantes), com
        // a barrinha mostrando o tempo; "já entrou" e erro esperam o toque
        var tempo = $('[data-aviso-tempo]');
        tempo.style.animation = 'none';
        tempo.hidden = tipo !== 'ok';
        a.hidden = false;
        if (tipo === 'ok') {
            var ms = extra ? FECHAR_AVISO_MS * 2 : FECHAR_AVISO_MS;
            void tempo.offsetWidth;  // reinicia a animação
            tempo.style.animation = 'avisoTempo ' + ms + 'ms linear forwards';
            timerAviso = setTimeout(proxima, ms);
        }
        $('[data-aviso-ok]').focus();
    }

    function fecharAviso() {
        clearTimeout(timerAviso);
        $('[data-aviso]').hidden = true;
    }

    // fecha e deixa a busca pronta para a próxima pessoa da fila; com
    // acompanhantes ainda sem entrar, a busca fica (os outros ingressos do
    // mesmo CPF continuam na tela)
    function proxima() {
        var limpar = $('[data-aviso]').classList.contains('aviso--ok') && $('[data-aviso-extra]').hidden;
        fecharAviso();
        if (limpar) busca.value = '';
        buscar();
        if (aba === 'buscar') busca.focus();
    }

    $('[data-aviso-ok]').addEventListener('click', proxima);
    $('[data-aviso-desfazer]').addEventListener('click', function () {
        clearTimeout(timerAviso);
        $('[data-aviso-tempo]').style.animation = 'none';
        var i = porCodigo[ultimoCodigo];
        if (i) desfazer(i, this);
    });

    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        if (!$('[data-pergunta]').hidden) fecharPergunta();
        else if (!$('[data-aviso]').hidden) proxima();
    });

    function toast(texto) {
        var t = $('[data-toast]');
        clearTimeout(timerToast);
        t.textContent = texto;
        t.hidden = false;
        timerToast = setTimeout(function () { t.hidden = true; }, 3000);
    }

    // o selo "agora" some sozinho
    setInterval(function () {
        if (!$('[data-tela="lista"]').hidden) { desenharRecentes(); desenharConfirmadas(); }
    }, 15000);

    iniciar();
})();
