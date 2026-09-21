/* Servidor local: npm run dev */
const config = require('./src/config');
const { criarApp } = require('./src/app');
const { pagamento } = require('./src/services/pagamento');
const { pedidos } = require('./src/services/sheetsService');

criarApp().listen(config.porta, function () {
    console.log('API de ingressos em http://localhost:' + config.porta);
    console.log('  pagamento:', pagamento().nome, pagamento().simulado ? '(SIMULADO)' : '');
    console.log('  pedidos:  ', pedidos().tipo);
    console.log('  e-mail:   ', config.email.configurado ? 'Resend' : 'desligado (só console)');
    console.log('  site:     ', config.siteUrl);
    console.log('  CORS:     ', config.origensPermitidas.join(', '));
});
