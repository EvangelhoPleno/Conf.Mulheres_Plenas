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
    reabertura: '2026-10-05T12:00:00-03:00'
};

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
