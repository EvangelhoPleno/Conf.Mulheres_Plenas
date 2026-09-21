# Backend de ingressos — Conferência Mulheres Plenas 2026

Node.js + Express. Cria a cobrança, recebe o aviso de pagamento, registra na planilha do Google e envia o ingresso por e-mail (Resend).

Funciona **hoje, sem conta bancária e sem domínio**: com o `.env` vazio, roda em modo de teste (pagamento simulado, pedidos em memória, e-mail só no console).

```
site (GitHub Pages)                         backend (Vercel)
checkout.html  ── POST /api/checkout ──►  cria pedido PENDENTE + cobrança no gateway
pagamento.html ── GET /api/pedidos/:id ─►  Pix (QR) ou link do cartão; consulta a cada 5s
                  gateway ── POST /api/webhook ──► PAGO → planilha → e-mail com QR Codes
confirmacao.html ◄── ingressos (códigos MP26-XXXX-XXXX)
```

## Rodar no computador

```bash
cd backend
npm install
cp .env.example .env      # pode deixar como está para testar
npm run dev               # API em http://localhost:3000
npm test                  # testes do fluxo completo
```

Em outro terminal, sirva o site pela raiz do repositório (ex.: `python -m http.server 5500`) e abra `http://localhost:5500`. O `config.js` já aponta para a API local quando o endereço é `localhost`. Os e-mails de teste são salvos em `backend/tmp/` para abrir no navegador.

## Rotas

| Rota | Uso |
|---|---|
| `GET /api/saude` | O que está ligado (gateway, planilha, e-mail) |
| `GET /api/produtos` | Ingressos e preços (fonte: `src/catalogo.js`) |
| `POST /api/checkout` | `{ produto, quantidade?, metodo, nome, email, cpf, telefone? }` |
| `GET /api/pedidos/:pedidoId` | Status do pedido (sem CPF; e-mail mascarado) |
| `POST /api/webhook` | Aviso de pagamento do gateway |
| `GET /api/ingressos/:codigo/qr.png` | Imagem do QR Code do ingresso |
| `POST /api/dev/simular-pagamento/:pedidoId` | Só no modo de teste |
| `GET /api/admin/pedidos/:pedidoId` | Pedido completo. `Authorization: Bearer ADMIN_TOKEN` |
| `POST /api/admin/pedidos/:pedidoId/reenviar-email` | Reenvia o ingresso |

## Onde editar

- **Preços, lotes, data e local do evento:** `src/catalogo.js` (o preço vale só dali; o site nunca manda valor).
- **Texto do e-mail:** `src/templates/emailIngresso.js`.
- **Endereço da API no site:** `config.js` na raiz do repositório.

## Colocar no ar

### 1. Google Sheets
1. No [Google Cloud Console](https://console.cloud.google.com/), crie um projeto e ative a **Google Sheets API**.
2. Em *IAM e administrador > Contas de serviço*, crie uma conta (sem papéis) e, em *Chaves > Adicionar chave > JSON*, baixe o arquivo.
3. Salve o arquivo como **`backend/credenciais-google.json`**. Ele já está no `.gitignore`.
4. Na planilha, clique em **Compartilhar** e adicione o `client_email` do JSON como **Editor**.
5. No `.env`: `GOOGLE_SHEET_ID=<link da planilha>` (pode ser o link inteiro).
6. `npm run planilha:preparar` → cria ou completa a aba **Pedidos** e a aba **Resumo**, sem mexer nas outras abas.
7. `npm run planilha:testar` → confere o acesso e grava e apaga uma linha de teste.

O sistema procura a aba pelo **nome "Pedidos"**, então a planilha pode ter outras abas. Não mude os nomes das colunas; colunas extras depois da Q podem ser criadas à vontade.

Na Vercel não existe o arquivo JSON: cadastre `GOOGLE_SERVICE_ACCOUNT_EMAIL` (`client_email`) e `GOOGLE_PRIVATE_KEY` (`private_key`).

> Use uma planilha **separada para testes**: pedidos simulados também aparecem como PAGO (com ID `mock_...`).

### 2. Resend
1. Crie a conta em [resend.com](https://resend.com) e gere uma API key → `RESEND_API_KEY`.
2. **Sem domínio**, o remetente precisa ser `onboarding@resend.dev`, e o Resend só entrega para o e-mail dono da conta. Dá para testar, mas não para vender.
3. **Com o domínio:** em *Domains*, adicione o domínio, crie os registros DNS indicados e troque `EMAIL_FROM` para `Ingressos Conferência <ingressos@seudominio.com.br>`.

### 3. Vercel (hospedagem da API, gratuita)
1. Em [vercel.com](https://vercel.com), importe o repositório do GitHub e defina **Root Directory = `backend`**.
2. Em *Settings > Environment Variables*, cadastre as variáveis do `.env` e também `NODE_ENV=production`, `API_URL=https://<projeto>.vercel.app` e `ADMIN_TOKEN`.
3. Depois do deploy, confira `https://<projeto>.vercel.app/api/saude`.
4. No site, coloque esse endereço em `config.js` (`apiUrl`) e publique. Os ingressos da landing passam a mostrar os preços da API.

## Quando chegar o domínio

1. `SITE_URL=https://seudominio.com.br` (e o domínio em `ALLOWED_ORIGINS`, se o site responder em mais de um endereço, como `www`).
2. Opcional: um subdomínio para a API (ex.: `api.seudominio.com.br` apontado para a Vercel) → atualizar `API_URL` e o `config.js`.
3. Verificar o domínio no Resend e trocar `EMAIL_FROM`.
4. Atualizar a URL do webhook no painel do gateway.

## Quando a conta de pagamento for definida

Toda a integração fica em `src/services/pagamento/`. O restante do sistema não muda.

**Se for Sipag:** o arquivo `sipagProvider.js` já tem a estrutura (autenticação, cobrança, consulta, webhook), mas os nomes de rotas e campos estão marcados com `CONFIRMAR`, porque dependem da documentação da conta. Com a documentação em mãos:
1. Ajustar `autenticar`, `montarPayload`, `criarCobranca`, `consultarStatus`, `mapearStatus` e `validarWebhook`.
2. Mudar `INTEGRACAO_REVISADA` para `true`. Enquanto estiver `false`, o checkout responde "vendas indisponíveis" e não manda nada ao banco.
3. `PAYMENT_PROVIDER=sipag` e as chaves `SIPAG_*`.
4. Cadastrar o webhook no painel: `https://<api>/api/webhook?token=<SIPAG_WEBHOOK_SECRET>`.
5. Fazer uma compra real de valor baixo antes de divulgar.

**Se for outro gateway** (Mercado Pago, Asaas, Efí, PagSeguro...): criar `outroProvider.js` com a mesma interface (descrita em `pagamento/index.js`) e registrar em `PROVEDORES`.

## Segurança

- O `.env` está no `.gitignore`. Nunca faça commit dele.
- O webhook nunca é tratado como prova de pagamento: o status é sempre **reconsultado no gateway** antes de liberar o ingresso.
- Aprovar o mesmo pedido de novo não gera novos códigos. O e-mail usa chave de idempotência no Resend.
- Se o webhook se perder, a própria página de pagamento consulta o gateway e conclui o pedido.
- Se a planilha falhar ao processar o webhook, a API responde 500 de propósito para o gateway tentar de novo.
- A chave do Google é lida com `.replace(/\\n/g, '\n')`, que transforma o `\n` digitado em quebra de linha. O trecho da especificação (`replace(/\n/g, ' ')`) faria o contrário e quebraria a chave.
