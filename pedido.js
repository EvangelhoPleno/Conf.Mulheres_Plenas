/* =============================================================
   TELAS DE COMPRA — checkout.html, pagamento.html, confirmacao.html
   Conversa com o backend (endereço em config.js). Cada página diz
   quem é em <body data-pagina="...">.
   ============================================================= */
(function () {
    'use strict';

    var API = ((window.MP_CONFIG && window.MP_CONFIG.apiUrl) || '').replace(/\/+$/, '');
    var params = new URLSearchParams(location.search);

    /* ---------- utilidades ---------- */
    function $(seletor, raiz) { return (raiz || document).querySelector(seletor); }
    function $$(seletor, raiz) { return Array.prototype.slice.call((raiz || document).querySelectorAll(seletor)); }

    function mostrar(estado) {
        $$('[data-estado]').forEach(function (el) { el.hidden = el.dataset.estado !== estado; });
    }

    function reais(centavos) {
        return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function preencher(campos) {
        Object.keys(campos).forEach(function (chave) {
            $$('[data-resumo="' + chave + '"]').forEach(function (el) { el.textContent = campos[chave]; });
        });
    }

    function api(caminho, opcoes) {
        opcoes = opcoes || {};
        var controle = new AbortController();
        var limite = setTimeout(function () { controle.abort(); }, 25000);

        return fetch(API + '/api' + caminho, {
            method: opcoes.method || 'GET',
            headers: opcoes.corpo ? { 'Content-Type': 'application/json' } : undefined,
            body: opcoes.corpo ? JSON.stringify(opcoes.corpo) : undefined,
            signal: controle.signal
        }).then(function (resposta) {
            return resposta.json().catch(function () { return {}; }).then(function (dados) {
                if (!resposta.ok) {
                    var erro = new Error(dados.erro || 'Erro ' + resposta.status);
                    erro.status = resposta.status;
                    erro.dados = dados;
                    throw erro;
                }
                return dados;
            });
        }, function () {
            var erro = new Error('Sem conexão com o servidor. Verifique sua internet e tente de novo.');
            erro.status = 0;
            throw erro;
        }).finally(function () { clearTimeout(limite); });
    }

    function idDoPedido() {
        var id = params.get('pedido') || '';
        return /^MP[A-Za-z0-9_-]{16}$/.test(id) ? id : '';
    }

    function marcarTeste(simulado) {
        $$('[data-aviso-teste]').forEach(function (el) { el.hidden = !simulado; });
    }

    /* =========================================================
       1. CHECKOUT
       ========================================================= */
    function iniciarCheckout() {
        var indisponivel = function (mensagem) {
            if (mensagem) $('[data-estado="indisponivel"] [data-mensagem]').textContent = mensagem;
            mostrar('indisponivel');
        };

        if (!API) return indisponivel();

        var produtoId = params.get('produto') || '';
        var form = $('.pedido-form');
        var produto = null;

        api('/produtos').then(function (dados) {
            produto = dados.produtos.filter(function (p) { return p.id === produtoId; })[0];
            if (!produto) {
                return indisponivel('Esse ingresso não está disponível. Volte e escolha uma das opções.');
            }

            marcarTeste(dados.simulado);
            preencher({
                produto: produto.setor + ' · ' + produto.tipo,
                lote: produto.lote,
                unitario: reais(produto.precoUnitario)
            });

            // só mostra as formas de pagamento que o gateway atual aceita
            $$('[data-metodo]').forEach(function (el) {
                el.hidden = dados.metodos.indexOf(el.dataset.metodo) === -1;
            });
            var primeiro = $('[data-metodo]:not([hidden]) input');
            if (primeiro) primeiro.checked = true;

            configurarQuantidade(produto);
            mostrar('pronto');
        }).catch(function (erro) {
            indisponivel(erro.status === 0
                ? 'Não conseguimos falar com o servidor de vendas agora. Tente de novo em alguns minutos.'
                : 'As vendas estão temporariamente indisponíveis. Tente de novo em alguns minutos.');
        });

        function quantidadeAtual() {
            var campo = $('#quantidade');
            return produto.quantidadeMin === produto.quantidadeMax ? produto.quantidadeMin : Number(campo.value) || 0;
        }

        function atualizarTotal() {
            var qtd = quantidadeAtual();
            preencher({ quantidade: String(qtd), total: reais(produto.precoUnitario * qtd) });
        }

        function configurarQuantidade(p) {
            var bloco = $('[data-bloco-quantidade]');
            var campo = $('#quantidade');
            if (p.quantidadeMin !== p.quantidadeMax) {
                bloco.hidden = false;
                campo.min = p.quantidadeMin;
                campo.max = p.quantidadeMax;
                campo.value = p.quantidadeMin;
                $('[data-dica-quantidade]').textContent = 'Mínimo ' + p.quantidadeMin + ', máximo ' + p.quantidadeMax + ' pessoas. Para mais, fale com a organização.';
                $$('[data-qtd]', bloco).forEach(function (botao) {
                    botao.addEventListener('click', function () {
                        var novo = Math.min(p.quantidadeMax, Math.max(p.quantidadeMin, (Number(campo.value) || 0) + Number(botao.dataset.qtd)));
                        campo.value = novo;
                        atualizarTotal();
                    });
                });
                campo.addEventListener('input', atualizarTotal);
            }
            atualizarTotal();
        }

        /* máscaras */
        $('#cpf').addEventListener('input', function (e) {
            var d = e.target.value.replace(/\D/g, '').slice(0, 11);
            e.target.value = d
                .replace(/^(\d{3})(\d)/, '$1.$2')
                .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
                .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
        });

        $('#telefone').addEventListener('input', function (e) {
            var d = e.target.value.replace(/\D/g, '').slice(0, 11);
            if (d.length > 10) e.target.value = d.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, '($1) $2-$3');
            else if (d.length > 6) e.target.value = d.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, '($1) $2-$3');
            else if (d.length > 2) e.target.value = d.replace(/^(\d{2})(\d*)/, '($1) $2');
            else e.target.value = d;
        });

        function cpfValido(valor) {
            var cpf = valor.replace(/\D/g, '');
            if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
            for (var pos = 9; pos < 11; pos++) {
                var soma = 0;
                for (var i = 0; i < pos; i++) soma += Number(cpf[i]) * (pos + 1 - i);
                if (((soma * 10) % 11) % 10 !== Number(cpf[pos])) return false;
            }
            return true;
        }

        function mostrarErros(erros) {
            $$('[data-erro]', form).forEach(function (el) {
                var msg = erros[el.dataset.erro] || '';
                el.textContent = msg;
                var campo = el.closest('.campo');
                if (campo) campo.classList.toggle('is-invalido', Boolean(msg));
            });
            var primeiro = Object.keys(erros)[0];
            var alvo = primeiro && form.querySelector('[name="' + primeiro + '"]');
            if (alvo) alvo.focus();
        }

        function validar() {
            var erros = {};
            var nome = form.nome.value.trim().replace(/\s+/g, ' ');
            if (nome.length < 5 || nome.split(' ').length < 2) erros.nome = 'Informe o nome completo.';
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.value.trim())) erros.email = 'Informe um e-mail válido.';
            if (!cpfValido(form.cpf.value)) erros.cpf = 'CPF inválido.';
            var tel = form.telefone.value.replace(/\D/g, '');
            if (tel && (tel.length < 10 || tel.length > 11)) erros.telefone = 'Informe o WhatsApp com DDD.';
            var qtd = quantidadeAtual();
            if (qtd < produto.quantidadeMin || qtd > produto.quantidadeMax) {
                erros.quantidade = 'Escolha entre ' + produto.quantidadeMin + ' e ' + produto.quantidadeMax + '.';
            }
            if (!form.aceite.checked) erros.aceite = 'Marque para continuar.';
            return erros;
        }

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var botao = form.querySelector('[type="submit"]');
            var avisoErro = $('[data-aviso-erro]');
            if (botao.classList.contains('is-carregando')) return;

            avisoErro.hidden = true;
            var erros = validar();
            mostrarErros(erros);
            if (Object.keys(erros).length) return;

            botao.classList.add('is-carregando');
            var metodo = form.querySelector('[name="metodo"]:checked');

            api('/checkout', {
                method: 'POST',
                corpo: {
                    produto: produto.id,
                    quantidade: quantidadeAtual(),
                    metodo: metodo ? metodo.value : undefined,
                    nome: form.nome.value,
                    email: form.email.value,
                    cpf: form.cpf.value,
                    telefone: form.telefone.value
                }
            }).then(function (pedido) {
                try { sessionStorage.setItem('mp-pedido-' + pedido.pedidoId, JSON.stringify(pedido)); } catch (err) { /* sem storage, a próxima página busca na API */ }
                location.href = 'pagamento.html?pedido=' + encodeURIComponent(pedido.pedidoId);
            }).catch(function (erro) {
                botao.classList.remove('is-carregando');
                if (erro.dados && erro.dados.erros) mostrarErros(erro.dados.erros);
                avisoErro.textContent = erro.message;
                avisoErro.hidden = false;
                avisoErro.scrollIntoView({ block: 'center', behavior: 'smooth' });
            });
        });
    }

    /* =========================================================
       2. PAGAMENTO
       ========================================================= */
    function iniciarPagamento() {
        var pedidoId = idDoPedido();
        if (!API || !pedidoId) return mostrar('erro');

        var INTERVALO = 5000;
        var LIMITE = 40 * 60 * 1000;  // depois disso, para de consultar sozinha
        var inicio = Date.now();
        var timer = null;
        var montado = false;

        function irParaConfirmacao() {
            location.replace('confirmacao.html?pedido=' + encodeURIComponent(pedidoId));
        }

        function falhou(status) {
            var textos = {
                RECUSADO: ['Pagamento não aprovado', 'O banco não aprovou o pagamento e nada foi cobrado. Você pode tentar de novo com outra forma de pagamento.'],
                EXPIRADO: ['O prazo do Pix acabou', 'O código Pix expirou antes do pagamento. Faça um novo pedido para gerar outro código.'],
                CANCELADO: ['Pedido cancelado', 'Este pedido foi cancelado. Se foi engano, faça um novo pedido.'],
                REEMBOLSADO: ['Pedido reembolsado', 'O valor deste pedido foi devolvido. Em caso de dúvida, fale com a organização.']
            }[status] || ['Pagamento não concluído', 'Faça um novo pedido para tentar de novo.'];
            $('[data-falhou-titulo]').textContent = textos[0];
            $('[data-falhou-texto]').textContent = textos[1];
            mostrar('falhou');
        }

        function montar(pedido) {
            montado = true;
            marcarTeste(pedido.simulado);
            preencher({
                produto: pedido.produto,
                nome: pedido.nome,
                email: pedido.email,
                quantidade: String(pedido.quantidade),
                total: reais(pedido.valorTotal)
            });

            if (pedido.metodo === 'pix' && pedido.pix) {
                $('[data-pix-qr]').src = pedido.pix.qrCode;
                $('[data-pix-codigo]').value = pedido.pix.copiaECola;
                $('[data-bloco="pix"]').hidden = false;
            } else if (pedido.simulado) {
                // teste: não existe página de banco, o simulador fica aqui mesmo
                $('[data-bloco="cartao-simulado"]').hidden = false;
            } else if (pedido.linkPagamento) {
                $$('[data-link-pagamento]').forEach(function (a) { a.href = pedido.linkPagamento; });
                var chave = 'mp-redirecionado-' + pedidoId;
                var jaFoi = false;
                try { jaFoi = sessionStorage.getItem(chave) === '1'; sessionStorage.setItem(chave, '1'); } catch (e) { /* segue */ }

                // primeira vez: manda para o banco. Voltando de lá: espera a confirmação.
                if (!jaFoi) {
                    mostrar('redirecionando');
                    location.href = pedido.linkPagamento;
                    return;
                }
                $('[data-bloco="cartao-retorno"]').hidden = false;
            }

            // no modo de teste o simulador aparece para Pix e cartão
            $('[data-simulador]').hidden = !pedido.simulado;
            mostrar('pronto');
        }

        function tratar(pedido) {
            if (pedido.status === 'PAGO') return irParaConfirmacao();
            if (pedido.status !== 'PENDENTE') return falhou(pedido.status);
            if (!montado) montar(pedido);
            agendar();
        }

        function consultar() {
            if (document.hidden) return agendar();
            api('/pedidos/' + encodeURIComponent(pedidoId))
                .then(function (pedido) { pedido.simulado = saude.simulado; tratar(pedido); })
                .catch(function (erro) {
                    if (erro.status === 404 && !montado) return mostrar('erro');
                    agendar();  // falha passageira: tenta de novo
                });
        }

        function agendar() {
            clearTimeout(timer);
            if (Date.now() - inicio > LIMITE) return;
            timer = setTimeout(consultar, INTERVALO);
        }

        document.addEventListener('visibilitychange', function () {
            if (!document.hidden && montado) { clearTimeout(timer); consultar(); }
        });

        $('[data-copiar]').addEventListener('click', function (e) {
            var botao = e.currentTarget;
            var campo = $('[data-pix-codigo]');
            var ok = function () {
                botao.textContent = 'Copiado!';
                setTimeout(function () { botao.textContent = 'Copiar'; }, 2500);
            };
            if (navigator.clipboard) {
                navigator.clipboard.writeText(campo.value).then(ok, function () { campo.select(); });
            } else {
                campo.select();
                try { document.execCommand('copy'); ok(); } catch (err) { /* usuária copia na mão */ }
            }
        });

        $('[data-simular]').addEventListener('click', function (e) {
            var botao = e.currentTarget;
            botao.classList.add('is-carregando');
            api('/dev/simular-pagamento/' + encodeURIComponent(pedidoId), { method: 'POST' })
                .then(irParaConfirmacao)
                .catch(function () { botao.classList.remove('is-carregando'); });
        });

        // primeira carga: usa o que o checkout deixou guardado (sem esperar a API)
        var saude = { simulado: false };
        api('/saude').then(function (s) { saude = s; }).catch(function () {}).finally(function () {
            var guardado = null;
            try { guardado = JSON.parse(sessionStorage.getItem('mp-pedido-' + pedidoId) || 'null'); } catch (e) { /* segue */ }
            if (guardado && guardado.status === 'PENDENTE') {
                guardado.simulado = saude.simulado;
                tratar(guardado);
            } else {
                consultar();
            }
        });
    }

    /* =========================================================
       3. CONFIRMAÇÃO
       ========================================================= */
    function iniciarConfirmacao() {
        var pedidoId = idDoPedido();
        if (!API || !pedidoId) return mostrar('erro');

        try { sessionStorage.removeItem('mp-pedido-' + pedidoId); } catch (e) { /* segue */ }

        Promise.all([
            api('/pedidos/' + encodeURIComponent(pedidoId)),
            api('/saude').catch(function () { return {}; })
        ]).then(function (resultado) {
            var pedido = resultado[0];
            if (pedido.status === 'PENDENTE') {
                return location.replace('pagamento.html?pedido=' + encodeURIComponent(pedidoId));
            }
            if (pedido.status !== 'PAGO') return mostrar('erro');

            marcarTeste(resultado[1].simulado);
            $('[data-texto-email]').textContent = pedido.emailEnviado
                ? pedido.nome + ', enviamos seus ingressos para ' + pedido.email + '. Confira também a caixa de spam.'
                : pedido.nome + ', guarde esta página: seus ingressos estão aqui e também serão enviados para ' + pedido.email + '.';

            preencher({
                produto: pedido.produto,
                quantidade: String(pedido.quantidade),
                total: reais(pedido.valorTotal),
                criadoEm: pedido.criadoEm,
                transacaoId: pedido.transacaoId
            });

            var lista = $('[data-ingressos]');
            lista.textContent = '';
            pedido.ingressos.forEach(function (ingresso, i) {
                var li = document.createElement('li');
                li.className = 'ingresso';

                var num = document.createElement('span');
                num.className = 'ingresso-num';
                num.textContent = 'Ingresso ' + (i + 1) + ' de ' + pedido.ingressos.length;

                var img = document.createElement('img');
                img.src = ingresso.qr;
                img.alt = 'QR Code do ingresso ' + ingresso.codigo;
                img.width = 190;
                img.height = 190;

                var codigo = document.createElement('span');
                codigo.className = 'ingresso-codigo';
                codigo.textContent = ingresso.codigo;

                li.append(num, img, codigo);
                lista.appendChild(li);
            });

            mostrar('pronto');
        }).catch(function (erro) {
            if (erro.status === 0) {
                $('[data-estado="erro"] [data-mensagem]').textContent = erro.message;
            }
            mostrar('erro');
        });

        $('[data-imprimir]').addEventListener('click', function () { window.print(); });
    }

    var paginas = { checkout: iniciarCheckout, pagamento: iniciarPagamento, confirmacao: iniciarConfirmacao };
    var iniciar = paginas[document.body.dataset.pagina];
    if (iniciar) iniciar();
})();
