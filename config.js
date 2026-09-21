/* =============================================================
   EDITAR: endereço do backend de ingressos (pasta backend/).
   É o ÚNICO lugar do site que precisa mudar quando a API for publicada
   ou quando o domínio próprio chegar.
   Vazio = vendas on-line desligadas (as telas mostram "em breve").
   ============================================================= */
window.MP_CONFIG = {
    apiUrl: ''  // ex.: 'https://mulheres-plenas-api.vercel.app'
};

// abrindo o site no próprio computador, usa o backend local (npm run dev)
if (!window.MP_CONFIG.apiUrl && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    window.MP_CONFIG.apiUrl = 'http://localhost:3000';
}
