/* Entrada da API na Vercel.

   A Vercel serve o site estático da raiz e transforma cada arquivo de api/
   numa função. O vercel.json manda todo /api/... para cá, e o Express
   resolve o resto: /api/checkout, /api/webhook, /api/pedidos/:id ...

   O código fica em backend/; este arquivo só o acorda. */
const { criarApp } = require('../backend/src/app');

module.exports = criarApp();
