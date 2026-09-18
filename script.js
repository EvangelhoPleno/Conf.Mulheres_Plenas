/* =============================================================
   CONFERÊNCIA MULHERES PLENAS '26 — comportamento da página
   Depende de GSAP + ScrollTrigger + Lenis (CDN no index.html), mas a página
   continua funcionando se algum deles não carregar: só perde as animações.
   ============================================================= */
(function () {
    'use strict';

    /* ---------------------------------------------------------
       EDITAR: links e vídeo. Os links preenchem todo elemento com
       data-link="..." — assim a URL de compra fica num lugar só.
       --------------------------------------------------------- */
    var CONFIG = {
        links: {
            ingressos: '',  // ex.: 'https://www.sympla.com.br/evento/...'
            caravana: '',   // ex.: 'https://wa.me/5591999999999?text=Quero%20montar%20uma%20caravana'
            upgrade: ''
        },
        videoRecapYoutubeId: ''  // só o ID: em youtube.com/watch?v=AbC123, é 'AbC123'
    };

    var reduzirMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var temGsap = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
    var lenis = null;
    var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

    /* ---------------------------------------------------------
       LINKS DE COMPRA + repasse de UTMs da URL
       --------------------------------------------------------- */
    function configurarLinks() {
        var params = new URLSearchParams(window.location.search);

        document.querySelectorAll('[data-link]').forEach(function (a) {
            var url = CONFIG.links[a.dataset.link];
            if (!url) return;

            try {
                var destino = new URL(url);
                // repassa ?utm_source=... e afins para a plataforma de venda
                params.forEach(function (valor, chave) {
                    if (!destino.searchParams.has(chave)) destino.searchParams.set(chave, valor);
                });
                a.href = destino.toString();
            } catch (e) {
                a.href = url;
            }
            a.target = '_blank';
            a.rel = 'noopener';
        });
    }

    /* ---------------------------------------------------------
       ROLAGEM SUAVE (Lenis) ligada ao ScrollTrigger
       --------------------------------------------------------- */
    function iniciarRolagem() {
        if (temGsap) {
            gsap.registerPlugin(ScrollTrigger);
            // a barra de endereço do iOS dispara resize ao rolar; sem isso a
            // galeria recalcula no meio do gesto e dá um tranco
            ScrollTrigger.config({ ignoreMobileResize: true });
        }

        if (reduzirMovimento || typeof window.Lenis === 'undefined') return;

        lenis = new Lenis({
            duration: 1.2,
            easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); }
        });

        if (temGsap) {
            lenis.on('scroll', ScrollTrigger.update);
            gsap.ticker.add(function (tempo) { lenis.raf(tempo * 1000); });
            gsap.ticker.lagSmoothing(0);
        } else {
            var loop = function (tempo) {
                lenis.raf(tempo);
                requestAnimationFrame(loop);
            };
            requestAnimationFrame(loop);
        }
    }

    function travarRolagem(travar) {
        if (lenis) {
            if (travar) lenis.stop(); else lenis.start();
        }
        document.body.classList.toggle('sem-rolagem', travar);
    }

    function rolarPara(alvo) {
        var margem = parseFloat(getComputedStyle(alvo).scrollMarginTop) || 0;
        if (lenis) {
            lenis.scrollTo(alvo, { offset: -margem });
        } else {
            alvo.scrollIntoView({ behavior: reduzirMovimento ? 'auto' : 'smooth' });
        }
    }

    function configurarAncoras() {
        document.querySelectorAll('a[href^="#"]').forEach(function (a) {
            a.addEventListener('click', function (e) {
                var href = a.getAttribute('href');
                if (href.length < 2) return;
                var alvo = document.getElementById(href.slice(1));
                if (!alvo) return;

                e.preventDefault();
                if (a.hasAttribute('data-fechar-menu')) definirMenu(false);
                rolarPara(alvo);
                history.replaceState(null, '', href);
            });
        });
    }

    /* ---------------------------------------------------------
       NAVBAR: fundo ao rolar, some descendo e volta subindo
       --------------------------------------------------------- */
    var navbar = document.querySelector('.navbar');
    var menuAberto = false;

    function configurarNavbar() {
        var ultimoY = window.scrollY;
        var agendado = false;

        function atualizar() {
            agendado = false;
            var y = window.scrollY;
            var delta = y - ultimoY;

            navbar.classList.toggle('is-scrolled', y > 40);

            if (delta > 6 && y > window.innerHeight * 0.6 && !menuAberto) {
                navbar.classList.add('is-hidden');
            } else if (delta < -6 || y < 80) {
                navbar.classList.remove('is-hidden');
            }

            if (Math.abs(delta) > 6) ultimoY = y;
        }

        window.addEventListener('scroll', function () {
            if (!agendado) {
                agendado = true;
                requestAnimationFrame(atualizar);
            }
        }, { passive: true });

        atualizar();
    }

    /* ---------------------------------------------------------
       MENU (mobile e tablet)
       --------------------------------------------------------- */
    var menuBtn = document.querySelector('.nav-menu-btn');
    var menuOverlay = document.getElementById('menuOverlay');

    function definirMenu(abrir) {
        if (!menuOverlay || menuAberto === abrir) return;
        menuAberto = abrir;
        menuOverlay.classList.toggle('is-open', abrir);
        menuOverlay.setAttribute('aria-hidden', String(!abrir));
        menuBtn.setAttribute('aria-expanded', String(abrir));
        menuBtn.setAttribute('aria-label', abrir ? 'Fechar menu' : 'Abrir menu');
        travarRolagem(abrir);

        if (abrir) {
            menuOverlay.querySelector('.menu-fechar').focus({ preventScroll: true });
        } else {
            menuBtn.focus({ preventScroll: true });
        }
    }

    function configurarMenu() {
        if (!menuBtn || !menuOverlay) return;
        menuBtn.addEventListener('click', function () { definirMenu(true); });
        menuOverlay.querySelector('.menu-fechar').addEventListener('click', function () { definirMenu(false); });
    }

    /* ---------------------------------------------------------
       MÍDIA AUSENTE: troca imagem/vídeo quebrado pelo rótulo
       --------------------------------------------------------- */
    function configurarMidias() {
        function marcar(el) {
            var caixa = el.closest('.midia');
            if (caixa) caixa.classList.add('is-missing');
        }

        document.querySelectorAll('.midia img').forEach(function (img) {
            if (img.complete && img.naturalWidth === 0) {
                marcar(img);
            } else {
                img.addEventListener('error', function () { marcar(img); }, { once: true });
            }
        });

        document.querySelectorAll('.midia video').forEach(function (video) {
            if (video.error || video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) {
                marcar(video);
            } else {
                video.addEventListener('error', function () { marcar(video); }, { once: true });
            }
        });
    }

    /* limiar fixo por célula (ruído + matriz de Bayer), com semente fixa para
       o desenho dos pixels ser sempre o mesmo */
    function gerarLimiares(colunas, linhas, semente, pesoRuido) {
        var limiares = new Float32Array(colunas * linhas);
        for (var y = 0; y < linhas; y++) {
            for (var x = 0; x < colunas; x++) {
                semente = (semente * 16807) % 2147483647;
                var ruido = (semente - 1) / 2147483646;
                var ordem = (BAYER[(y % 4) * 4 + (x % 4)] + 0.5) / 16;
                limiares[y * colunas + x] = pesoRuido * ruido + (1 - pesoRuido) * ordem;
            }
        }
        return limiares;
    }

    /* ---------------------------------------------------------
       ENTRADA — abertura de ~5 segundos a cada acesso
       Luzes passeando, pétalas no ar, as três pétalas da logo chegando
       girando, o coração batendo e soltando pétalas, ramos se desenhando, o
       nome escrito por uma "caneta" de luz e, na saída, a tela se desfaz em
       pixels enquanto o coração voa girando até o lugar dele no hero.
       Toca inteira mesmo com "reduzir movimento" ligado: é curta e tem pular.
       --------------------------------------------------------- */

    // pétalas, pontos e brilhos desenhados num canvas, no ritmo do GSAP
    function criarParticulas(canvas) {
        var ctx = canvas.getContext('2d');
        var cores = ['#F5E8E2', '#DFB9A6', '#B8684F'];
        var lista = [];
        var largura = 0;
        var altura = 0;

        function medir() {
            var dpr = Math.min(window.devicePixelRatio || 1, 2);
            largura = window.innerWidth;
            altura = window.innerHeight;
            canvas.width = Math.round(largura * dpr);
            canvas.height = Math.round(altura * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        function sortear(min, max) {
            return min + Math.random() * (max - min);
        }

        function corQualquer() {
            return cores[Math.floor(Math.random() * cores.length)];
        }

        // partícula de fundo (vida 0): sobe balançando e volta por baixo ao sair
        function flutuante(emQualquerAltura) {
            return {
                tipo: Math.random() < 0.7 ? 'petala' : 'ponto',
                x: sortear(0, largura),
                y: emQualquerAltura ? sortear(0, altura) : altura + 20,
                vx: sortear(-8, 8),
                vy: sortear(-40, -14),
                giro: sortear(0, 6.28),
                vGiro: sortear(-1.2, 1.2),
                tamanho: sortear(3, 8),
                cor: corQualquer(),
                alfa: 0,
                alfaMax: sortear(0.25, 0.7),
                fase: sortear(0, 6.28),
                vida: 0
            };
        }

        function explosao(x, y, quantidade, forca) {
            for (var i = 0; i < quantidade; i++) {
                var angulo = Math.random() * Math.PI * 2;
                var velocidade = sortear(0.35, 1) * forca;
                var sorteio = Math.random();
                lista.push({
                    tipo: sorteio < 0.55 ? 'petala' : (sorteio < 0.8 ? 'brilho' : 'ponto'),
                    x: x,
                    y: y,
                    vx: Math.cos(angulo) * velocidade,
                    vy: Math.sin(angulo) * velocidade,
                    giro: angulo,
                    vGiro: sortear(-4, 4),
                    tamanho: sortear(3, 9),
                    cor: corQualquer(),
                    alfa: 1,
                    vida: sortear(0.9, 1.6),
                    idade: 0,
                    arrasto: sortear(2.2, 3.4)
                });
            }
        }

        function desenhar(p) {
            var s = p.tamanho;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.giro);
            ctx.globalAlpha = p.alfa;
            ctx.fillStyle = p.cor;
            ctx.beginPath();
            if (p.tipo === 'petala') {
                ctx.moveTo(0, -s);
                ctx.bezierCurveTo(s * 0.9, -s * 0.2, s * 0.5, s, 0, s);
                ctx.bezierCurveTo(-s * 0.5, s, -s * 0.9, -s * 0.2, 0, -s);
            } else if (p.tipo === 'brilho') {
                ctx.moveTo(0, -s);
                ctx.quadraticCurveTo(0, 0, s, 0);
                ctx.quadraticCurveTo(0, 0, 0, s);
                ctx.quadraticCurveTo(0, 0, -s, 0);
                ctx.quadraticCurveTo(0, 0, 0, -s);
            } else {
                ctx.arc(0, 0, s * 0.3, 0, Math.PI * 2);
            }
            ctx.fill();
            ctx.restore();
        }

        function quadro(tempo, delta) {
            var dt = Math.min(delta, 50) / 1000;
            ctx.clearRect(0, 0, largura, altura);

            for (var i = lista.length - 1; i >= 0; i--) {
                var p = lista[i];
                if (!p.vida) {
                    p.fase += dt;
                    p.x += (p.vx + Math.sin(p.fase * 1.3) * 14) * dt;
                    p.y += p.vy * dt;
                    p.alfa = Math.min(p.alfaMax, p.alfa + dt * 0.6);
                    if (p.y < -20 || p.x < -30 || p.x > largura + 30) {
                        lista[i] = flutuante(false);
                        continue;
                    }
                } else {
                    p.idade += dt;
                    if (p.idade >= p.vida) {
                        lista.splice(i, 1);
                        continue;
                    }
                    var freio = Math.exp(-p.arrasto * dt);
                    p.vx *= freio;
                    p.vy = p.vy * freio + 30 * dt;
                    p.x += p.vx * dt;
                    p.y += p.vy * dt;
                    p.alfa = 1 - p.idade / p.vida;
                }
                p.giro += p.vGiro * dt;
                desenhar(p);
            }
        }

        medir();
        var quantidade = largura < 768 ? 34 : 70;
        for (var i = 0; i < quantidade; i++) lista.push(flutuante(true));

        window.addEventListener('resize', medir);
        gsap.ticker.add(quadro);

        return {
            explosao: explosao,
            parar: function () {
                gsap.ticker.remove(quadro);
                window.removeEventListener('resize', medir);
            }
        };
    }

    function executarEntrada(aoTerminar) {
        var raiz = document.documentElement;
        var entrada = document.getElementById('entrada');
        if (!entrada || !raiz.classList.contains('entrada-ativa')) {
            aoTerminar(false);
            return;
        }

        // avisa a trava do <head> que a abertura começou e não deve ser cortada
        window.MP_ENTRADA_RODANDO = true;
        if (!location.hash) window.scrollTo(0, 0);
        travarRolagem(true);

        var terminou = false;
        var limpezas = [];
        var botaoPular = entrada.querySelector('.entrada-pular');

        function finalizar(coracaoPousou) {
            if (terminou) return;
            terminou = true;
            limpezas.forEach(function (limpar) { limpar(); });
            document.removeEventListener('keydown', teclaPular);
            raiz.classList.remove('entrada-ativa');
            entrada.remove();
            travarRolagem(false);
            aoTerminar(coracaoPousou);
            if (temGsap) ScrollTrigger.refresh();
        }

        function teclaPular(e) {
            if (e.key === 'Escape') pular();
        }

        var pular = function () {};
        document.addEventListener('keydown', teclaPular);
        botaoPular.addEventListener('click', function () { pular(); });

        // sem GSAP (CDN fora do ar): composição parada e saída suave
        if (!temGsap) {
            var sairSimples = function () {
                entrada.classList.add('is-saindo');
                setTimeout(function () { finalizar(false); }, 420);
            };
            var espera = setTimeout(sairSimples, 2200);
            pular = function () {
                clearTimeout(espera);
                sairSimples();
            };
            return;
        }

        function pegar(seletor) {
            return entrada.querySelector(seletor);
        }

        function pegarTodos(seletor) {
            return Array.prototype.slice.call(entrada.querySelectorAll(seletor));
        }

        var conteudo = pegar('.entrada-conteudo');
        var coracao = pegar('.entrada-coracao');
        var flutua = pegar('.entrada-flutua');
        var camadas = pegarTodos('.entrada-camada');
        var petalaClara = pegar('.entrada-petala-clara');
        var ondas = pegarTodos('.entrada-onda');
        var anel = pegar('.entrada-anel');
        var anelGiro = pegar('.entrada-anel-giro');
        var luzes = pegarTodos('.entrada-luz');
        var clarao = pegar('.entrada-clarao');
        var ramos = pegarTodos('.entrada-ramo');
        var tracosRamos = pegarTodos('.entrada-ramo path');
        var conferencia = pegar('.entrada-conferencia');
        var nome = pegar('.entrada-nome');
        var caneta = pegar('.entrada-caneta');
        var ano = pegar('.entrada-ano');
        var canvasParticulas = pegar('.entrada-particulas');
        var canvasPixels = pegar('.entrada-pixels');

        var particulas = criarParticulas(canvasParticulas);
        limpezas.push(particulas.parar);

        function estourarDoCoracao(quantidade, forca) {
            var r = coracao.getBoundingClientRect();
            particulas.explosao(r.left + r.width / 2, r.top + r.height / 2, quantidade, forca);
        }

        // movimentos contínuos: luzes passeando, ramos balançando, anel girando
        var continuos = [
            gsap.to(luzes[0], { xPercent: 22, yPercent: 18, duration: 3.2, ease: 'sine.inOut', yoyo: true, repeat: -1 }),
            gsap.to(luzes[1], { xPercent: -20, yPercent: -16, duration: 2.8, ease: 'sine.inOut', yoyo: true, repeat: -1 }),
            gsap.to(anelGiro, { rotation: 360, svgOrigin: '100 100', duration: 16, ease: 'none', repeat: -1 })
        ];
        ramos.forEach(function (ramo, i) {
            continuos.push(gsap.to(ramo, { rotation: i ? -5 : 5, duration: 2.2 + i * 0.4, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
        });
        // o coração só começa a flutuar depois das batidas
        var flutuacao = gsap.to(flutua, { y: -9, rotation: 2, duration: 1.3, ease: 'sine.inOut', yoyo: true, repeat: -1, paused: true });
        continuos.push(flutuacao);
        limpezas.push(function () {
            continuos.forEach(function (animacao) { animacao.kill(); });
        });

        // com mouse, luzes e ramos acompanham o cursor em profundidades diferentes
        if (window.matchMedia('(pointer: fine)').matches) {
            var seguidores = luzes.map(function (luz) {
                return { alvo: luz, fundo: 70 };
            }).concat(ramos.map(function (ramo) {
                return { alvo: ramo, fundo: 30 };
            })).map(function (item) {
                return {
                    fundo: item.fundo,
                    x: gsap.quickTo(item.alvo, 'x', { duration: 1.2, ease: 'power3' }),
                    y: gsap.quickTo(item.alvo, 'y', { duration: 1.2, ease: 'power3' })
                };
            });
            var paralaxe = function (e) {
                var nx = e.clientX / window.innerWidth - 0.5;
                var ny = e.clientY / window.innerHeight - 0.5;
                seguidores.forEach(function (s) {
                    s.x(nx * s.fundo);
                    s.y(ny * s.fundo);
                });
            };
            window.addEventListener('pointermove', paralaxe);
            limpezas.push(function () { window.removeEventListener('pointermove', paralaxe); });
        }

        // "CONFERÊNCIA" letra por letra
        var texto = conferencia.textContent.trim();
        conferencia.textContent = '';
        var letras = texto.split('').map(function (caractere) {
            var span = document.createElement('span');
            span.textContent = caractere;
            conferencia.appendChild(span);
            return span;
        });

        var tl = gsap.timeline({ paused: true });

        // 1. o ambiente acende e a cena inteira se aproxima devagar
        tl.fromTo(luzes, { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 1.4, ease: 'power2.out', stagger: 0.15 }, 0)
          .fromTo(canvasParticulas, { opacity: 0 }, { opacity: 1, duration: 1 }, 0)
          .fromTo(conteudo, { scale: 1.1 }, { scale: 1, duration: 3.7, ease: 'power1.out' }, 0);

        // 2. as pétalas chegam girando, desfocadas, e se encaixam com rebote
        var chegada = [
            { x: -190, y: -90, r: -170 },
            { x: 210, y: -150, r: 150 },
            { x: 120, y: 210, r: 120 }
        ];
        camadas.forEach(function (camada, i) {
            tl.fromTo(camada,
                { xPercent: chegada[i].x, yPercent: chegada[i].y, rotation: chegada[i].r, scale: 0.3, opacity: 0, filter: 'blur(10px)' },
                { xPercent: 0, yPercent: 0, rotation: 0, scale: 1, opacity: 1, filter: 'blur(0px)', duration: 1.05, ease: 'back.out(1.5)' },
                0.08 + i * 0.12);
        });

        // 3. batidas: o coração pulsa, a tela clareia e ele solta pétalas
        [
            { inicio: 1.15, escala: 1.2, quantidade: 30, forca: 680 },
            { inicio: 1.62, escala: 1.1, quantidade: 18, forca: 480 }
        ].forEach(function (batida, i) {
            tl.to(coracao, { scale: batida.escala, duration: 0.13, ease: 'power2.out', overwrite: 'auto' }, batida.inicio)
              .to(coracao, { scale: 1, duration: 0.45, ease: 'elastic.out(1, 0.4)', overwrite: 'auto' }, batida.inicio + 0.13)
              // immediateRender: false — sem isso a onda e o clarão aparecem parados antes da batida
              .fromTo(ondas[i], { scale: 0.7, opacity: 0.85 }, { scale: 2.9, opacity: 0, duration: 1.2, ease: 'power2.out', immediateRender: false }, batida.inicio)
              .fromTo(clarao, { opacity: i ? 0.55 : 0.9 }, { opacity: 0, duration: 0.8, ease: 'power2.out', immediateRender: false }, batida.inicio)
              .call(estourarDoCoracao, [batida.quantidade, batida.forca], batida.inicio);
        });
        tl.call(function () { flutuacao.play(); }, null, 2.1);

        // 4. anel de texto entra girando e os ramos se desenham nos cantos
        tl.fromTo(anel, { opacity: 0, scale: 0.6, rotation: -90 }, { opacity: 1, scale: 1, rotation: 0, duration: 1.5, ease: 'expo.out' }, 1.2)
          .fromTo(tracosRamos, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.5, ease: 'power2.inOut', stagger: 0.06 }, 0.7);

        // 5. "CONFERÊNCIA" salta letra por letra, do centro para as pontas
        tl.fromTo(letras,
            { yPercent: 140, opacity: 0, rotation: function (i) { return i % 2 ? 25 : -25; }, filter: 'blur(6px)' },
            { yPercent: 0, opacity: 1, rotation: 0, filter: 'blur(0px)', duration: 0.7, ease: 'back.out(2)', stagger: { each: 0.04, from: 'center' } },
            1.3)
          .fromTo(conferencia, { letterSpacing: '1em' }, { letterSpacing: '0.55em', duration: 1.6, ease: 'power3.out' }, 1.3);

        // 6. o nome é escrito por uma caneta de luz que solta faíscas
        var ultimaFaisca = 0;
        tl.fromTo(nome, { clipPath: 'inset(0 100% 0 0)', y: 12 }, { clipPath: 'inset(0 0% 0 0)', y: 0, duration: 1.15, ease: 'power2.inOut' }, 1.8)
          .fromTo(caneta, { left: '0%' }, {
              left: '100%',
              duration: 1.15,
              ease: 'power2.inOut',
              onUpdate: function () {
                  var agora = performance.now();
                  if (agora - ultimaFaisca < 40) return;
                  ultimaFaisca = agora;
                  var r = caneta.getBoundingClientRect();
                  particulas.explosao(r.left + r.width / 2, r.top + Math.random() * r.height, 2, 150);
              }
          }, 1.8)
          .to(caneta, { opacity: 1, duration: 0.12 }, 1.8)
          .to(caneta, { opacity: 0, duration: 0.3 }, 2.75);

        // 7. "2026" aparece, dá um pulinho com brilhos e o coração bate de leve
        tl.fromTo(ano, { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 0.55, ease: 'power2.inOut' }, 2.55)
          .fromTo(ano, { scale: 1 }, { scale: 1.15, duration: 0.14, ease: 'power1.out', yoyo: true, repeat: 1, immediateRender: false }, 3.1)
          .call(function () {
              var r = ano.getBoundingClientRect();
              particulas.explosao(r.right - r.width * 0.15, r.top + r.height * 0.4, 14, 340);
          }, null, 3.1)
          .to(coracao, { scale: 1.08, duration: 0.12, ease: 'power2.out', overwrite: 'auto' }, 3.2)
          .to(coracao, { scale: 1, duration: 0.33, ease: 'power2.inOut', overwrite: 'auto' }, 3.32)
          .addLabel('saida', 3.7)
          .call(sair, null, 'saida');

        function sair() {
            flutuacao.pause();
            var alvo = document.querySelector('.hero-coracao');
            var destino = alvo && alvo.getBoundingClientRect();
            var pousar = !!destino && destino.width > 0 && destino.bottom > 0 && destino.top < window.innerHeight;

            estourarDoCoracao(44, 1150);

            var saida = gsap.timeline({ onComplete: function () { finalizar(pousar); } });
            saida.to([conferencia, nome, ano], { y: -30, opacity: 0, filter: 'blur(6px)', duration: 0.45, ease: 'power2.in', stagger: 0.05 }, 0)
                 .to(anel, { opacity: 0, scale: 1.35, duration: 0.5, ease: 'power2.in' }, 0)
                 .to(luzes.concat(ramos, [clarao]), { opacity: 0, duration: 0.35 }, 0)
                 .to(flutua, { y: 0, rotation: 0, duration: 0.35, ease: 'power2.out' }, 0)
                 .add(dissolver(), 0.05)
                 .to(canvasParticulas, { opacity: 0, duration: 0.45 }, 0.6);

            if (pousar) {
                var origem = coracao.getBoundingClientRect();
                var escalaAtual = gsap.getProperty(coracao, 'scale');
                saida.to(coracao, {
                    x: destino.left + destino.width / 2 - (origem.left + origem.width / 2),
                    y: destino.top + destino.height / 2 - (origem.top + origem.height / 2),
                    scale: escalaAtual * destino.width / origem.width,
                    rotation: 360,
                    duration: 1,
                    ease: 'power3.inOut'
                }, 0)
                // no fundo claro do hero a pétala volta à cor tijolo
                .to(petalaClara, { opacity: 0, duration: 0.6, ease: 'power1.inOut' }, 0.3);
            } else {
                saida.to(coracao, { scale: 0.6, opacity: 0, duration: 0.6, ease: 'power2.in' }, 0);
            }
        }

        // a tela vira uma grade de pixels tijolo que some do centro para fora
        function dissolver() {
            var ctx = canvasPixels.getContext('2d');
            var celula = window.innerWidth < 768 ? 12 : 16;
            var colunas = Math.ceil(window.innerWidth / celula);
            var linhas = Math.ceil(window.innerHeight / celula);
            canvasPixels.width = colunas;
            canvasPixels.height = linhas;

            var cor = getComputedStyle(raiz).getPropertyValue('--tijolo').trim() || '#85351E';
            var limiares = gerarLimiares(colunas, linhas, 777, 0.64);
            var cx = (colunas - 1) / 2;
            var cy = (linhas - 1) / 2;
            var raioMax = Math.sqrt(cx * cx + cy * cy);
            var pesos = new Float32Array(colunas * linhas);
            for (var y = 0; y < linhas; y++) {
                for (var x = 0; x < colunas; x++) {
                    var dist = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / raioMax;
                    pesos[y * colunas + x] = 0.45 * dist + 0.55 * limiares[y * colunas + x];
                }
            }

            var estado = { p: 0 };
            function pintar() {
                var limite = estado.p * 1.02;
                ctx.clearRect(0, 0, colunas, linhas);
                ctx.fillStyle = cor;
                for (var yy = 0; yy < linhas; yy++) {
                    for (var xx = 0; xx < colunas; xx++) {
                        if (pesos[yy * colunas + xx] >= limite) ctx.fillRect(xx, yy, 1, 1);
                    }
                }
            }

            pintar();
            entrada.classList.add('is-dissolvendo');
            return gsap.to(estado, { p: 1, duration: 0.9, ease: 'sine.inOut', onUpdate: pintar });
        }

        pular = function () {
            if (tl.time() < tl.labels.saida - 0.05) {
                tl.seek(tl.labels.saida - 0.02, true).play();
            }
        };

        // começa quando as imagens e as fontes estiverem prontas (no máximo 0,8s)
        var imagens = pegarTodos('img').map(function (img) {
            return img.decode ? img.decode().catch(function () {}) : Promise.resolve();
        });
        var fontes = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
        Promise.race([
            Promise.all(imagens.concat([fontes])),
            new Promise(function (resolver) { setTimeout(resolver, 800); })
        ]).then(function () { tl.play(); });
    }

    /* ---------------------------------------------------------
       BORDA PONTILHADA DO RODAPÉ
       Uma célula fica na cor da seção de cima quando o limiar dela passa da
       "escuridão" daquela linha — que cresce de cima para baixo e, com a
       rolagem, avança: os pixels se desmancham enquanto o rodapé entra.
       --------------------------------------------------------- */
    function configurarDither(canvas, semente) {
        if (!canvas || !canvas.getContext) return;
        var ctx = canvas.getContext('2d');
        // a cor vem do próprio canvas: herda do rodapé ou vem de .dither--topo/base
        var cor = getComputedStyle(canvas).getPropertyValue('--dither-cor').trim() || '#F5E8E2';
        // só o rodapé "revela" a borda ao ser alcançado; as outras já nascem prontas
        var rodape = canvas.closest('footer');

        var colunas = 0;
        var linhas = 0;
        var limiares = null;
        var progresso = 1;
        var desenhado = -1;

        function medir() {
            var celula = window.innerWidth < 768 ? 6 : 8;
            var novasColunas = Math.ceil(canvas.clientWidth / celula);
            var novasLinhas = Math.max(6, Math.round(canvas.clientHeight / celula));
            if (novasColunas === colunas && novasLinhas === linhas) return;

            colunas = novasColunas;
            linhas = novasLinhas;
            canvas.width = colunas;
            canvas.height = linhas;
            limiares = gerarLimiares(colunas, linhas, semente, 0.55);

            desenhado = -1;
            desenhar();
        }

        function desenhar() {
            if (!limiares || Math.abs(progresso - desenhado) < 0.004) return;
            desenhado = progresso;

            ctx.clearRect(0, 0, colunas, linhas);
            ctx.fillStyle = cor;
            for (var y = 0; y < linhas; y++) {
                var t = y / (linhas - 1);
                var escuro = Math.min(1, Math.max(0, t * 1.3 - 0.15 - (1 - progresso) * 0.5));
                var linha = y * colunas;
                for (var x = 0; x < colunas; x++) {
                    if (limiares[linha + x] >= escuro) ctx.fillRect(x, y, 1, 1);
                }
            }
        }

        medir();
        canvas.classList.add('is-ready');

        var espera;
        window.addEventListener('resize', function () {
            clearTimeout(espera);
            espera = setTimeout(medir, 150);
        });

        if (rodape && temGsap && !reduzirMovimento) {
            progresso = 0;
            desenhado = -1;
            desenhar();
            ScrollTrigger.create({
                trigger: rodape,
                start: 'top bottom',
                end: 'top 35%',
                onUpdate: function (self) {
                    progresso = self.progress;
                    desenhar();
                },
                onRefresh: function (self) {
                    progresso = self.progress;
                    desenhar();
                }
            });
        }
    }

    function configurarDithers() {
        // semente diferente por borda, senão as três repetem o mesmo desenho.
        // O rodapé fica com a semente original, para o desenho dele não mudar.
        Array.prototype.forEach.call(document.querySelectorAll('.dither'), function (canvas, i) {
            var semente = canvas.closest('footer') ? 20260 : 20260 + (i + 1) * 977;
            configurarDither(canvas, semente);
        });
    }

    /* ---------------------------------------------------------
       REVELAÇÃO DE TEXTO: palavra a palavra, com barra por linha
       --------------------------------------------------------- */
    function dividirPalavras(el) {
        Array.prototype.slice.call(el.childNodes).forEach(function (no) {
            if (no.nodeType === Node.TEXT_NODE) {
                var frag = document.createDocumentFragment();
                no.textContent.split(/(\s+)/).forEach(function (parte) {
                    if (!parte) return;
                    if (/^\s+$/.test(parte)) {
                        frag.appendChild(document.createTextNode(parte));
                    } else {
                        var span = document.createElement('span');
                        span.className = 'reveal-word';
                        span.textContent = parte;
                        frag.appendChild(span);
                    }
                });
                no.parentNode.replaceChild(frag, no);
            } else if (no.nodeType === Node.ELEMENT_NODE && no.tagName !== 'BR') {
                dividirPalavras(no);
            }
        });
    }

    function montarBarras(el) {
        el.querySelectorAll('.reveal-barra').forEach(function (b) { b.remove(); });

        var base = el.getBoundingClientRect();
        var linhas = [];

        el.querySelectorAll('.reveal-word').forEach(function (palavra) {
            var r = palavra.getBoundingClientRect();
            var topo = r.top - base.top;
            var linha = null;
            for (var i = 0; i < linhas.length; i++) {
                if (Math.abs(linhas[i].topo - topo) < r.height * 0.5) {
                    linha = linhas[i];
                    break;
                }
            }
            if (!linha) {
                linha = { topo: topo, fundo: topo + r.height, palavras: [] };
                linhas.push(linha);
            }
            linha.fundo = Math.max(linha.fundo, topo + r.height);
            linha.palavras.push(palavra);
        });

        linhas.sort(function (a, b) { return a.topo - b.topo; }).forEach(function (linha, i) {
            var atraso = (i * 0.12).toFixed(2) + 's';
            linha.palavras.forEach(function (p) { p.style.setProperty('--atraso', atraso); });

            var barra = document.createElement('span');
            barra.className = 'reveal-barra';
            barra.setAttribute('aria-hidden', 'true');
            barra.style.top = linha.topo + 'px';
            barra.style.height = (linha.fundo - linha.topo) + 'px';
            barra.style.setProperty('--atraso', atraso);
            el.appendChild(barra);
        });
    }

    function configurarRevelacao() {
        var alvos = Array.prototype.slice.call(document.querySelectorAll('[data-revelar]'));
        if (!alvos.length || reduzirMovimento || !('IntersectionObserver' in window)) return;

        alvos.forEach(function (el) {
            dividirPalavras(el);
            el.classList.add('reveal-ready');
        });

        function medir() {
            alvos.forEach(function (el) {
                if (!el.classList.contains('is-revealed')) montarBarras(el);
            });
        }

        medir();
        // a quebra de linha muda quando a fonte web termina de carregar
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(medir);

        var espera;
        window.addEventListener('resize', function () {
            clearTimeout(espera);
            espera = setTimeout(medir, 150);
        });

        var observador = new IntersectionObserver(function (entradas) {
            entradas.forEach(function (entrada) {
                if (!entrada.isIntersecting) return;
                entrada.target.classList.add('is-revealed');
                observador.unobserve(entrada.target);
            });
        }, { rootMargin: '0px 0px -12% 0px' });

        alvos.forEach(function (el) { observador.observe(el); });
    }

    /* ---------------------------------------------------------
       ANIMAÇÕES COM GSAP
       --------------------------------------------------------- */

    /* O coração do hero tem três camadas por pétala: .petala (rolagem),
       .petala-mouse (mouse) e a img (chegada). Cada movimento mexe numa
       camada só, então as animações não brigam pelo mesmo transform. */

    // chegada das pétalas no hero — só quando o coração da abertura não pousou nele
    function animarChegadaPetalas() {
        var chegada = [
            { x: -80, y: -30, r: -45 },
            { x: 80, y: -70, r: 40 },
            { x: 50, y: 90, r: 30 }
        ];
        gsap.utils.toArray('.hero-coracao .petala img').forEach(function (img, i) {
            gsap.from(img, {
                xPercent: chegada[i].x,
                yPercent: chegada[i].y,
                rotation: chegada[i].r,
                opacity: 0,
                duration: 1.7,
                ease: 'expo.out',
                delay: 0.1 + i * 0.14
            });
        });
    }

    function configurarPetalas() {
        var camadas = gsap.utils.toArray('.hero-coracao .petala');
        if (camadas.length !== 3) return;

        // ao rolar, as pétalas se abrem devagar
        var abertura = [
            { x: -12, y: -6, r: -12 },
            { x: 12, y: -12, r: 12 },
            { x: 8, y: 12, r: 8 }
        ];
        camadas.forEach(function (camada, i) {
            gsap.to(camada, {
                xPercent: abertura[i].x,
                yPercent: abertura[i].y,
                rotation: abertura[i].r,
                ease: 'none',
                scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }
            });
        });

        // com mouse, cada pétala acompanha o cursor numa profundidade diferente
        if (!window.matchMedia('(pointer: fine)').matches) return;
        var hero = document.querySelector('.hero');
        var profundidade = [14, 24, 34];
        var movedores = camadas.map(function (camada) {
            var alvo = camada.querySelector('.petala-mouse');
            return {
                x: gsap.quickTo(alvo, 'x', { duration: 0.9, ease: 'power3' }),
                y: gsap.quickTo(alvo, 'y', { duration: 0.9, ease: 'power3' })
            };
        });

        hero.addEventListener('pointermove', function (e) {
            var r = hero.getBoundingClientRect();
            var nx = (e.clientX - r.left) / r.width - 0.5;
            var ny = (e.clientY - r.top) / r.height - 0.5;
            movedores.forEach(function (m, i) {
                m.x(nx * profundidade[i]);
                m.y(ny * profundidade[i]);
            });
        });

        hero.addEventListener('pointerleave', function () {
            movedores.forEach(function (m) {
                m.x(0);
                m.y(0);
            });
        });
    }

    // montada pausada: os elementos já ficam escondidos atrás da abertura
    // e a animação toca quando ela termina
    function prepararEntradaHero() {
        var tl = gsap.timeline({ paused: true });

        tl.from('.hero-anel', { opacity: 0, duration: 1.4, ease: 'power2.out' }, 0)
          .from('.hero-halo', { opacity: 0, scale: 0.6, duration: 1.4, ease: 'power3.out' }, 0)
          .from('.hero-topo .faixa', { yPercent: 80, rotation: -12, opacity: 0, duration: 0.7, ease: 'back.out(1.8)' }, 0.1)
          .from('.hero-ano', { scale: 0.4, opacity: 0, duration: 0.6, ease: 'back.out(2)' }, 0.35)
          .fromTo('.hero-titulo img', { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 1.3, ease: 'power3.inOut' }, 0.2)
          .from(['.hero-frase', '.hero-info', '.hero .btn-cta'], { y: 20, opacity: 0, duration: 0.7, ease: 'power3.out', stagger: 0.1 }, 0.95);

        return tl;
    }

    function animarGaleria() {
        var coluna = document.querySelector('.galeria-col');
        var cartoes = gsap.utils.toArray('.galeria-card');
        if (!coluna || !cartoes.length) return;

        var tl = gsap.timeline({
            scrollTrigger: {
                trigger: coluna,
                start: 'top top',
                end: 'bottom bottom',
                scrub: 0.6
            }
        });

        var passo = 0.45;
        tl.fromTo('.galeria-titulo', { scale: 0.85 }, {
            scale: 1.05,
            ease: 'none',
            duration: cartoes.length * passo + 1
        }, 0);

        cartoes.forEach(function (cartao, i) {
            tl.fromTo(cartao, {
                z: -1400,
                yPercent: 40,
                rotationX: gsap.utils.random(-25, 25),
                rotationY: gsap.utils.random(-30, 30),
                rotationZ: gsap.utils.random(-12, 12),
                opacity: 0
            }, {
                z: 0,
                yPercent: 0,
                rotationX: 0,
                rotationY: 0,
                rotationZ: gsap.utils.random(-6, 6),
                opacity: 1,
                duration: 1,
                ease: 'power2.out'
            }, i * passo);
        });
    }

    function animarSecoes() {
        // folhas balançam e sobem devagar enquanto a seção passa
        gsap.utils.toArray('[data-flutuar]').forEach(function (folha, i) {
            var secao = folha.closest('section') || folha.parentElement;
            gsap.fromTo(folha, { yPercent: -10, rotation: i % 2 ? -5 : 5 }, {
                yPercent: 10,
                rotation: i % 2 ? 5 : -5,
                ease: 'none',
                scrollTrigger: { trigger: secao, start: 'top bottom', end: 'bottom top', scrub: true }
            });
        });

        gsap.utils.toArray('.espera-item').forEach(function (item, i) {
            gsap.fromTo(item, { xPercent: i % 2 ? 8 : -8, opacity: 0.15 }, {
                xPercent: 0,
                opacity: 1,
                ease: 'none',
                scrollTrigger: { trigger: item, start: 'top 95%', end: 'top 60%', scrub: true }
            });
        });

        // faixas de título "coladas" ao entrar na tela
        gsap.utils.toArray('.lineup-titulo .faixa, .upgrade-titulo .faixa').forEach(function (faixa, i) {
            gsap.from(faixa, {
                scale: 1.3,
                opacity: 0,
                rotation: i % 2 ? 8 : -8,
                duration: 0.7,
                ease: 'back.out(1.8)',
                scrollTrigger: { trigger: faixa, start: 'top 85%' }
            });
        });

        gsap.from('.lineup-item', {
            y: 48,
            opacity: 0,
            duration: 0.8,
            ease: 'power3.out',
            stagger: 0.06,
            scrollTrigger: { trigger: '.lineup-trilho', start: 'top 85%' }
        });

        gsap.utils.toArray('.setor-cards').forEach(function (lista) {
            gsap.from(lista.children, {
                y: 40,
                opacity: 0,
                duration: 0.7,
                ease: 'power3.out',
                stagger: 0.08,
                scrollTrigger: { trigger: lista, start: 'top 88%' }
            });
        });

        gsap.from('.rodape-logo', {
            y: 30,
            opacity: 0,
            duration: 1,
            ease: 'power3.out',
            scrollTrigger: { trigger: '.rodape', start: 'top 70%' }
        });
    }

    // devolve a animação do hero, pausada, para tocar depois da abertura
    function iniciarAnimacoes() {
        if (!temGsap || reduzirMovimento) return null;

        configurarPetalas();
        var heroTl = prepararEntradaHero();
        animarGaleria();
        animarSecoes();

        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
        }
        window.addEventListener('load', function () { ScrollTrigger.refresh(); });

        return heroTl;
    }

    /* ---------------------------------------------------------
       CARROSSEL DO LINE-UP (mobile e tablet)
       --------------------------------------------------------- */
    function configurarCarrossel() {
        var trilho = document.querySelector('.lineup-trilho');
        var anterior = document.querySelector('.lineup-anterior');
        var proximo = document.querySelector('.lineup-proximo');
        if (!trilho || !anterior || !proximo) return;

        function passo() {
            var item = trilho.querySelector('.lineup-item');
            var gap = parseFloat(getComputedStyle(trilho).columnGap) || 0;
            return item ? item.getBoundingClientRect().width + gap : trilho.clientWidth * 0.8;
        }

        function atualizar() {
            anterior.disabled = trilho.scrollLeft < 4;
            proximo.disabled = trilho.scrollLeft + trilho.clientWidth >= trilho.scrollWidth - 4;
        }

        anterior.addEventListener('click', function () { trilho.scrollBy({ left: -passo(), behavior: 'smooth' }); });
        proximo.addEventListener('click', function () { trilho.scrollBy({ left: passo(), behavior: 'smooth' }); });
        trilho.addEventListener('scroll', atualizar, { passive: true });
        window.addEventListener('resize', atualizar);
        atualizar();
    }

    /* ---------------------------------------------------------
       MODAIS (bio do line-up e vídeo)
       --------------------------------------------------------- */
    var modalAberto = null;
    var focoAnterior = null;

    function abrirModal(modal) {
        focoAnterior = document.activeElement;
        modalAberto = modal;
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        travarRolagem(true);
        modal.querySelector('.modal-fechar').focus({ preventScroll: true });
    }

    function fecharModal() {
        if (!modalAberto) return;
        var modal = modalAberto;
        modalAberto = null;
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        travarRolagem(false);

        // tira o iframe para o vídeo parar de tocar
        if (modal.id === 'videoModal') {
            setTimeout(function () {
                modal.querySelector('.video-modal-frame').replaceChildren();
            }, 300);
        }

        if (focoAnterior) focoAnterior.focus({ preventScroll: true });
    }

    function configurarModais() {
        var bioModal = document.getElementById('bioModal');
        var videoModal = document.getElementById('videoModal');

        document.querySelectorAll('[data-fechar-modal]').forEach(function (el) {
            el.addEventListener('click', fecharModal);
        });

        if (bioModal) {
            var bioNome = bioModal.querySelector('.bio-nome');
            var bioTexto = bioModal.querySelector('.bio-texto');

            document.querySelectorAll('.lineup-card').forEach(function (cartao) {
                cartao.addEventListener('click', function () {
                    var modelo = document.getElementById(cartao.dataset.bio);
                    bioNome.textContent = cartao.querySelector('.lineup-nome').textContent;
                    bioTexto.replaceChildren(modelo ? modelo.content.cloneNode(true) : '');
                    bioModal.querySelector('.bio-card').scrollTop = 0;
                    abrirModal(bioModal);
                });
            });
        }

        var recapBtn = document.getElementById('recapBtn');
        if (videoModal && recapBtn) {
            recapBtn.addEventListener('click', function () {
                var moldura = videoModal.querySelector('.video-modal-frame');
                var id = CONFIG.videoRecapYoutubeId;

                if (id) {
                    var iframe = document.createElement('iframe');
                    iframe.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?autoplay=1&rel=0';
                    iframe.title = 'Vídeo da última edição';
                    iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
                    iframe.allowFullscreen = true;
                    moldura.replaceChildren(iframe);
                } else {
                    var aviso = document.createElement('p');
                    aviso.className = 'video-modal-vazio';
                    aviso.textContent = 'Configure o ID do vídeo em CONFIG.videoRecapYoutubeId, no script.js.';
                    moldura.replaceChildren(aviso);
                }

                abrirModal(videoModal);
            });
        }
    }

    /* ---------------------------------------------------------
       VAGAS VENDIDAS (seção de ingressos)
       O painel começa com hidden e SÓ é revelado quando chega um número
       real. Sem dado, fica só a frase das 700 vagas — o site nunca mostra
       contador inventado. A origem, nesta ordem:
         1) window.MP_CONFIG.vagas = { total: 700, vendidos: 128 }
         2) campo "vagas" da resposta de GET /api/produtos:
            { "vagas": { "total": 700, "vendidos": 128 } }
       --------------------------------------------------------- */
    function configurarVagas() {
        var painel = document.getElementById('vagasPainel');
        if (!painel) return;

        var barra = document.getElementById('vagasBarra');
        var cheio = document.getElementById('vagasBarraCheio');
        var elVendidos = document.getElementById('vagasVendidos');
        var elTotal = document.getElementById('vagasTotal');
        var elPct = document.getElementById('vagasPct');
        if (!barra || !cheio || !elVendidos || !elTotal || !elPct) return;

        function numero(v) {
            return typeof v === 'number' && isFinite(v) && v >= 0;
        }

        function mostrar(vendidos, total) {
            if (!numero(vendidos)) return;
            if (!numero(total) || total <= 0) total = parseInt(painel.dataset.total, 10) || 700;

            var v = Math.min(Math.round(vendidos), total);
            var pct = Math.round((v / total) * 100);

            elVendidos.textContent = v.toLocaleString('pt-BR');
            elTotal.textContent = total.toLocaleString('pt-BR');
            elPct.textContent = pct + '%';
            barra.setAttribute('aria-valuenow', String(pct));
            barra.setAttribute('aria-valuetext', v + ' de ' + total + ' ingressos vendidos');
            painel.hidden = false;

            // dois quadros depois do reveal, para a transição sair do zero
            requestAnimationFrame(function () {
                requestAnimationFrame(function () { cheio.style.width = pct + '%'; });
            });
        }

        var cfg = window.MP_CONFIG && window.MP_CONFIG.vagas;
        if (cfg && numero(cfg.vendidos)) {
            mostrar(cfg.vendidos, cfg.total);
            return;
        }

        var api = window.MP_CONFIG && window.MP_CONFIG.apiUrl;
        if (!api || !window.fetch) return;

        fetch(api.replace(/\/+$/, '') + '/api/produtos')
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (dados) {
                if (dados && dados.vagas) mostrar(dados.vagas.vendidos, dados.vagas.total);
            })
            .catch(function () { /* sem API: fica só a frase das 700 vagas */ });
    }

    /* ---------------------------------------------------------
       ENTRADAS AO ROLAR (fotos da galeria, frase e ingressos)
       As animações são de CSS e TERMINAM no estado natural do elemento.
       Aqui só marcamos com .is-dentro quando o bloco entra na tela: se o
       observador não rodar, o conteúdo simplesmente já está visível.
       Quando o GSAP está cuidando das seções (movimento normal), saímos
       e deixamos ele trabalhar, para as duas animações não brigarem.
       --------------------------------------------------------- */
    function configurarEntradas(ligar) {
        var alvos = Array.prototype.slice.call(document.querySelectorAll('[data-entrada]'));
        if (!ligar || !alvos.length || !('IntersectionObserver' in window)) return;

        var observador = new IntersectionObserver(function (entradas) {
            entradas.forEach(function (entrada) {
                if (!entrada.isIntersecting) return;
                entrada.target.classList.add('is-dentro');
                observador.unobserve(entrada.target);
            });
        }, { rootMargin: '0px 0px -10% 0px' });

        alvos.forEach(function (el) { observador.observe(el); });
    }

    /* ---------------------------------------------------------
       FAQ
       --------------------------------------------------------- */
    function configurarFaq() {
        document.querySelectorAll('.faq-pergunta').forEach(function (btn, i) {
            var resposta = btn.nextElementSibling;
            if (!resposta) return;

            resposta.id = resposta.id || 'faq-resposta-' + (i + 1);
            btn.setAttribute('aria-controls', resposta.id);
            resposta.inert = true;

            btn.addEventListener('click', function () {
                var abrir = btn.getAttribute('aria-expanded') !== 'true';
                btn.setAttribute('aria-expanded', String(abrir));
                resposta.classList.toggle('is-open', abrir);
                resposta.inert = !abrir;
            });
        });
    }

    /* ---------------------------------------------------------
       TECLADO: Esc fecha modal ou menu
       --------------------------------------------------------- */
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        if (modalAberto) fecharModal();
        else if (menuAberto) definirMenu(false);
    });

    /* ---------------------------------------------------------
       INÍCIO — o script é carregado com defer, então o DOM já existe
       --------------------------------------------------------- */
    configurarLinks();
    iniciarRolagem();
    configurarAncoras();
    configurarNavbar();
    configurarMenu();
    configurarMidias();
    configurarRevelacao();
    var heroTl = iniciarAnimacoes();
    // sem GSAP (ou com menos movimento) as entradas ficam por conta do CSS
    configurarEntradas(!heroTl);
    configurarVagas();
    configurarDithers();
    configurarCarrossel();
    configurarModais();
    configurarFaq();

    executarEntrada(function (coracaoPousou) {
        if (!heroTl) return;
        if (!coracaoPousou) animarChegadaPetalas();
        heroTl.play();
    });
})();
