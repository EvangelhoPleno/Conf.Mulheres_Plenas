/* =============================================================
   EDITAR: endereço do backend de ingressos (pasta backend/).
   É o ÚNICO lugar do site que precisa mudar quando a API for publicada
   ou quando o domínio próprio chegar.
   Vazio = vendas on-line desligadas (as telas mostram "em breve").
   ============================================================= */
window.MP_CONFIG = {
    apiUrl: 'https://evangelhoplenoparagominas.com.br',
    // chave PÚBLICA do Cloudflare Turnstile (anti-robô no checkout); vazio = desligado.
    // Publique esta antes de pôr TURNSTILE_SECRET_KEY na Vercel (ver backend/.env.example).
    turnstileSiteKey: '0x4AAAAAAFDmt-6hJkeocl16',
    // VAGAS ESGOTADAS só no site (o backend continua igual): true = faixa no
    // topo, lotes com carimbo "esgotado" e checkout fechado. Para reabrir as
    // vendas, troque para false e publique.
    esgotado: false,
    // REABERTURA COM CONTADOR: antes deste instante (horário de Paragominas,
    // -03:00) o site fica fechado como no modo esgotado, mas a faixa do topo,
    // a seção de ingressos e o checkout mostram a contagem regressiva. Ao
    // zerar, a página recarrega sozinha já com as vendas abertas. Depois da
    // hora, não faz nada: pode ficar aqui ou voltar para ''.
    reabertura: '2026-10-05T12:00:00-03:00',
    // ENCERRAMENTO DAS INSCRIÇÕES só no site (o backend segue vendendo até o
    // fim do 2º lote, 15/10, para casos à mão). Antes deste instante a seção
    // de ingressos mostra a contagem regressiva; a partir dele o site entra
    // sozinho no modo fechado com "Inscrições encerradas": faixa no topo,
    // lotes carimbados e checkout bloqueado. Quem está com a página aberta na
    // hora recarrega sozinho. Vazio = sem encerramento marcado.
    encerramento: '2026-10-12T00:00:00-03:00'
};

(function (cfg) {
    var fecha = cfg.encerramento ? new Date(cfg.encerramento).getTime() : NaN;
    if (!isFinite(fecha)) return;
    cfg.encerramentoMs = fecha;
    cfg.encerrado = Date.now() >= fecha;
    cfg.encerrando = !cfg.encerrado;

    // a mesma marca do esgotado (faixa, navbar, lotes fechados, checkout),
    // com .is-encerrado para trocar os textos
    if (cfg.encerrado) {
        document.documentElement.classList.add('is-esgotado', 'is-encerrado');
        return;
    }
    document.documentElement.classList.add('is-encerrando');

    /* Contagem regressiva da seção de ingressos ([data-encerra="dias|horas|
       minutos|segundos"]). Ao zerar, a landing e o checkout recarregam já
       fechados (atraso sorteado de até 6 s, como na reabertura). A tela do
       Pix e a confirmação não recarregam: quem já está pagando termina. */
    function dois(n) { return (n < 10 ? '0' : '') + n; }

    function tique() {
        var falta = fecha - Date.now();
        var s = Math.max(0, Math.ceil(falta / 1000));
        var partes = {
            dias: dois(Math.floor(s / 86400)),
            horas: dois(Math.floor((s % 86400) / 3600)),
            minutos: dois(Math.floor((s % 3600) / 60)),
            segundos: dois(s % 60)
        };
        var els = document.querySelectorAll('[data-encerra]');
        for (var i = 0; i < els.length; i++) {
            els[i].textContent = partes[els[i].getAttribute('data-encerra')] || '';
        }
        if (falta > 0) {
            setTimeout(tique, (falta % 1000) || 1000);
            return;
        }
        var pagina = document.body && document.body.getAttribute('data-pagina');
        if (pagina === 'pagamento' || pagina === 'confirmacao') return;
        setTimeout(function () { location.reload(); }, Math.random() * 6000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tique);
    } else {
        tique();
    }
    // celular que congelou a aba em segundo plano: confere ao voltar
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden && Date.now() >= fecha) tique();
    });
})(window.MP_CONFIG);

(function (cfg) {
    var abre = cfg.reabertura ? new Date(cfg.reabertura).getTime() : NaN;
    cfg.reabrindo = !cfg.esgotado && isFinite(abre) && Date.now() < abre;

    // marca o <html> já no <head>, antes de pintar: a faixa e o resto do modo
    // fechado entram sem piscar o estado de "vendas abertas"
    if (cfg.esgotado || cfg.reabrindo) document.documentElement.classList.add('is-esgotado');
    if (!cfg.reabrindo) return;
    document.documentElement.classList.add('is-reabrindo');

    /* Contagem regressiva: preenche todo [data-reabre-relogio] da página
       (faixa do topo, seção de ingressos, checkout) a cada segundo. Ao zerar,
       recarrega. O atraso sorteado de até 6 s espalha os recarregamentos de
       quem estiver esperando na página, em vez de todos no mesmo segundo. */
    function dois(n) { return (n < 10 ? '0' : '') + n; }

    function texto(ms) {
        var s = Math.max(0, Math.ceil(ms / 1000));
        var h = Math.floor(s / 3600);
        var m = Math.floor((s % 3600) / 60);
        return (h ? dois(h) + ':' : '') + dois(m) + ':' + dois(s % 60);
    }

    function tique() {
        var falta = abre - Date.now();
        var els = document.querySelectorAll('[data-reabre-relogio]');
        for (var i = 0; i < els.length; i++) {
            els[i].textContent = falta > 0 ? texto(falta) : 'abrindo…';
        }
        if (falta > 0) {
            setTimeout(tique, (falta % 1000) || 1000);
        } else {
            setTimeout(function () { location.reload(); }, Math.random() * 6000);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tique);
    } else {
        tique();
    }
})(window.MP_CONFIG);

// abrindo o site no próprio computador, usa o backend local (npm run dev)
if (!window.MP_CONFIG.apiUrl && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    window.MP_CONFIG.apiUrl = 'http://localhost:3000';
}
