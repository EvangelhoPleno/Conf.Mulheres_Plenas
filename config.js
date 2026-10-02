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
    esgotado: true
};

// marca o <html> já no <head>, antes de pintar: a faixa e o resto do modo
// esgotado entram sem piscar o estado de "vendas abertas"
if (window.MP_CONFIG.esgotado) document.documentElement.classList.add('is-esgotado');

// abrindo o site no próprio computador, usa o backend local (npm run dev)
if (!window.MP_CONFIG.apiUrl && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    window.MP_CONFIG.apiUrl = 'http://localhost:3000';
}
