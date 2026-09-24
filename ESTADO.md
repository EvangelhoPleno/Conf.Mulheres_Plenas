# Estado do projeto — 24/09/2026

Resumo para retomar o trabalho sem reler o histórico. Evento: **Conferência
Mulheres Plenas, 16 e 17 de outubro de 2026, Paragominas–PA**.

---

## Pagamento: Mercado Pago (desde 24/09)

O Mercado Pago é o **único** gateway. O Asaas e o esqueleto da Sipag foram
**removidos por inteiro** em 24/09: código, testes, scripts, variáveis do
`.env` e documentação. Fora o Mercado Pago, só existe o `mock` (pagamento
simulado, para `npm test` e desenvolvimento local).

| Peça | Estado |
|---|---|
| `mercadoPagoProvider.js` | Pix (`/v1/payments`) e cartão (Checkout Pro), webhook com assinatura HMAC |
| Webhook e `pedidoService` | acham o pedido pelo `external_reference` (= `Pedido_ID`): no cartão o pagamento nasce depois do pedido |
| `/api/saude` | bloco `mercadopago`, `ok:false` sem token ou sem assinatura secreta |
| Conta | produção: `JADISON_S_RIBEIRO` (id 310993389), chave Pix cadastrada |
| Webhook no painel | modo de produção, `https://evangelhoplenoparagominas.com.br/api/webhook`, só o evento **Pagamentos (legacy)** |
| Testes | `npm test` 32 verdes (14 do Mercado Pago, com a API simulada no processo) |
| Site | no cartão, "página segura do Mercado Pago" |

**Provado em 24/09 com o Mercado Pago de TESTE (usuário de teste, sem dinheiro real):**
cartão de ponta a ponta — `npm run mercadopago:ensaio-cartao` → Checkout Pro
logado como compradora de teste → Visa 4235 6477 2802 5682 titular APRO →
aprovado (operação 179631320501) → consulta achou pelo `external_reference` →
PAGO → ingresso `MP26-PFMR-GM76` → e-mail montado.

Descoberto no teste (não redescobrir):
- **Usuário de teste não tem Pix** e **não aceita `/v1/payments` pela API**
  ("Unauthorized use of live credentials", 401) — com qualquer pagador. Só o
  Checkout Pro funciona no teste. **O Pix só se prova com credencial de produção.**
- Com a credencial de teste, o Access Token começa com `APP_USR-` (não `TEST-`);
  é o `/users/me` com a tag `test_user` que diz que é teste. O `/api/saude`
  mostra `ambiente: producao` nesse caso — ele só olha o prefixo.
- O Mastercard 5031 4332 1540 6351 foi recusado pela página ("não aceita este
  meio"); o Visa passou.
- A página do Checkout Pro também oferece saldo em conta e Débito Virtual CAIXA
  (só boleto e Pix foram excluídos). Pagam na hora; deixado assim.

**No ar desde 24/09, 12:13 (deploy `9a4ec76` READY).** Vercel: `PAYMENT_PROVIDER=mercadopago`,
`MERCADOPAGO_ACCESS_TOKEN` e `MERCADOPAGO_WEBHOOK_SECRET` (só Production); as
`ASAAS_*` foram apagadas. Conferido no ar: `/api/saude` `ok:true` com
`credencial` e `webhookAssinado` true, planilha e Resend ligados; 4 páginas
200; webhook sem assinatura 401, `/api/dev` 404, admin 401, `.env` 404, CORS
estranho sem permissão; 1º lote aberto e o card mostrando "27/09 a 06/10".

Pix de produção provado em 24/09 (`npm run mercadopago:testar -- --producao`):
QR gerado na conta JADISON_S_RIBEIRO, consulta PENDENTE, cancelado.

**Provado em produção em 24/09:** "Simular" do webhook no painel → **200**
(assinatura confere); **compra real de R$ 55 no Pix pelo site** → pago →
e-mail do ingresso entregue → pedido PAGO na planilha.

**QR Code do ingresso removido (deploy `e9ccd28`):** não há leitor na
portaria e o QR só repetia o código. E-mail e `confirmacao.html` mostram o
código em destaque e mandam apresentar o e-mail na portaria. A rota
`/api/ingressos/:codigo/qr.png` continua existindo, sem uso na tela.

**Reembolso provado em produção em 24/09:** 2ª compra real de R$ 55 no Pix
(Nubank) → PAGO → ingresso `MP26-2YJQ-PN4S` → e-mail → **Devolver dinheiro** no
painel (operação 179642872509) → webhook → pedido **REEMBOLSADO** na planilha,
sozinho. Com a devolução total o Mercado Pago **devolve a tarifa** (0,99% no Pix,
R$ 0,54 em R$ 55): teste de compra + estorno custa zero. No app do Nubank a
devolução aparece como um Pix vindo do Mercado Pago, não como "estorno".

A 1ª compra de teste (operação **179634462601**, 09:18 de 24/09) foi
**resolvida à mão**: o valor saiu por um Pix comum do Jadison para ele mesmo, não
por "Devolver dinheiro". No Mercado Pago ela segue `approved` (e a tarifa de
R$ 0,54 não voltou); a linha foi apagada da planilha, então não entra em total
nenhum. **Não estornar de novo.**

E-mail com logo e tema testado em 24/09 (`npm run email:testar`): chegou na
**caixa de entrada** do Gmail, logo carregando.

**Falta:** divulgar o link no domingo, 27/09. Opcional: uma compra real no
**cartão** (o único caminho ainda não provado com dinheiro de verdade) e o estorno.

Tela do Pix: avisa que o recebedor aparece como **Jadison S. Ribeiro** (o Pix
mostra o titular da conta; só uma conta no CNPJ da igreja mudaria isso).
Links "Ingressos": o `id="setores"` fica no **título** da seção, não nos cards.

---

## O que já está no ar e provado

**https://evangelhoplenoparagominas.com.br** — site e API no mesmo domínio.
(`conf-mulheres-plenas.vercel.app` continua respondendo, como endereço interno.)

| Peça | Estado |
|---|---|
| Vercel | projeto `conf-mulheres-plenas`, implanta da branch `main`, Root Directory na raiz |
| API | `api/index.js` acorda o Express de `backend/`; `vercel.json` manda `/api/...` para ele |
| Pagamento | Mercado Pago — ver a seção acima |
| Webhook | cadastrado no painel do Mercado Pago (modo de produção) |
| Planilha | Google Sheets gravando (`/api/saude` mostra `planilha: google-sheets`) |
| E-mail | Resend no domínio próprio, **Verified** (sa-east-1). Teste no Gmail em 23/09: SPF, DKIM e DMARC **PASS** nos três |
| Variáveis | as 12 + `EMAIL_REPLY_TO`. Atenção: `EMAIL_FROM` e `EMAIL_REPLY_TO` foram criadas **só em Production** |
| Domínio | **https://evangelhoplenoparagominas.com.br** — site, API e e-mail, tudo no domínio próprio desde 23/09 |
| Git | remote **sem token na URL**; autenticação no Git Credential Manager (cofre do Windows). `git push` funciona direto |
| GitHub Pages | **desligado** em 23/09 — `github.io` devolve 404 |
| Repositório | **público** — foi privado por algumas horas em 23/09 e isso quebrou o deploy (ver armadilha); voltou a ser público e o push implanta de novo |
| `www` | responde com **308** para a raiz |

**Ensaio completo feito em 22/09 e depois limpo:** compra pelo site → cobrança
no gateway anterior → Pix com QR → pedido na planilha → pagamento → webhook 200 → ingresso
`MP26-XXXX-XXXX` → e-mail entregue → aba Resumo somando certo.

### Lotes (as datas moram em TRÊS lugares e têm que andar juntas)

| Lote | Janela | Preço |
|---|---|---|
| 1º | **24/09** a 06/10 (card anuncia 27/09, texto fixo na linha ~470 do `index.html`) | R$ 55,00 |
| 2º | 07/10 a 15/10 | R$ 65,00 |

- `backend/src/catalogo.js`, linha ~31 — o que a API vende (e recusa)
- `index.html`, linhas 458 e 482, `data-inicio` / `data-fim` — o selo da landing
- `backend/test/fluxo.test.js`, linhas 61-64 — as quatro datas cravadas

Se mudar uma e esquecer a outra, o teste `janela de venda de cada lote` falha.
Ele existe para isso: o teste é a trava, não um quarto lugar que "também"
precisa mudar. Mexeu nos dois primeiros, o teste quebra de propósito — aí
você ajusta as linhas 61-64 e, se moveu as bordas, os `new Date(...)` das
linhas 66-73 (mês é base zero: `new Date(2026, 8, 27)` é 27 de setembro).

---

## O que falta, em ordem

### 1. Domínio — CONCLUÍDO em 23/09

**`evangelhoplenoparagominas.com.br`**. Correção de 23/09: a delegação no
TLD `.br` é **`d.sec.dns.br` / `f.sec.dns.br`** (conjunto assinado com
DNSSEC), não `a.auto.dns.br` / `b.auto.dns.br` como estava escrito aqui.
Os `auto` ainda respondem com uma cópia velha do template de fábrica —
**não conferir DNS por eles**, dão resposta errada com ar de autoritativa.

**Os três registros de fábrica saíram da zona** (o null MX, o `v=spf1 -all`
da raiz e o `_dmarc p=reject`). Confirmado nos dois autoritativos. O
`p=reject` que trabalhava contra nós não existe mais.

#### Metade do e-mail: FEITA em 23/09

Zona hoje (4 registros, conferidos em `d.sec` e `f.sec`):

| Nome | Tipo | Valor |
|---|---|---|
| `resend._domainkey` | TXT | chave DKIM do Resend |
| `send` | CNAME | `send.forge.rmta.net` |
| `rsend` | CNAME | `rsend-sae1.forge.rmta.net` |
| `_dmarc` | TXT | `v=DMARC1; p=none; rua=mailto:jadisonribeiro1996@gmail.com` |

O setup novo do Resend dispensa MX e SPF próprios: o CNAME do `send.`
entrega os dois (MX de bounce `feedback.forge.rmta.net` e o SPF do Resend).
Não falta registro nenhum.

Resend **Verified**, região São Paulo (`sa-east-1`). Remetente
`ingressos@evangelhoplenoparagominas.com.br`, reply-to no Gmail do Jadison —
sem MX na raiz, resposta sem reply-to volta pro remetente.

Teste de 23/09 (`npm run email:testar`): entregue, e o "Mostrar original" do
Gmail deu **SPF PASS, DKIM PASS alinhado ao domínio, DMARC PASS**.

Quando o DMARC tiver alguns dias de relatório limpo, dá para apertar o
`p=none` para `p=quarantine` no Registro.br.


#### Provado em produção no domínio novo (23/09)

| Verificação | Resultado |
|---|---|
| `config.js` servido | aponta para o domínio próprio |
| `/api/saude` | gateway, Google Sheets e Resend de pé |
| Trava de janela | `POST /api/checkout` devolve **409**, "abre em 27/09" |
| Acentuação | UTF-8 correto ponta a ponta |
| Certificado | emitido pela Vercel alguns minutos depois do `A` |

Registros `A` na raiz: `216.198.79.1` e `64.29.17.1` (faixa nova; o
`76.76.21.21` ainda funciona mas é a antiga).

`ALLOWED_ORIGINS` **foi criada na Vercel** e não existe no Git. Sem ela, em
produção a única origem liberada é a do `SITE_URL` — o checkout do Pages
teria quebrado por CORS no instante do deploy. Hoje vale
`conf-mulheres-plenas.vercel.app` e o `www`.

**Parcialmente verificado (23/09, auditoria):** o `EMAIL_FROM` gravado em
Production é `Ingressos Conferência <ingressos@evangelhoplenoparagominas.com.br>`
— o remetente configurado está no domínio próprio, e o domínio está `verified`
no Resend. O que continua **não verificado** é a entrega de uma compra real:
a trava de 27/09 impede o teste, e `/api/saude` não expõe o remetente.

### 2. Limpeza de segredo — FEITA em 23/09

- Token da Vercel revogado e substituído; o novo vive em `backend/.env`
- Token do GitHub revogado. **Não foi substituído no projeto, e nem precisa:**
  o `git push` autentica pelo Git Credential Manager, que tem credencial
  OAuth própria no cofre do Windows. O remote não carrega segredo nenhum.
- `backend/.env.vercel` **apagado** (40 linhas, 12 chaves, todas já na
  Vercel). Sobraram só `backend/.env` e `.env.example`.

Fica valendo: o `VERCEL_TOKEN` em `backend/.env` é o que dá acesso ao
projeto na Vercel e está em texto claro no disco. O site não precisa dele
para funcionar — é ferramenta de manutenção. Revogar quando o projeto
estabilizar depois de 27/09.

E nunca pôr token na URL do remote: era o que bloqueava o `git push`.

### 3. Antes de divulgar (domingo, 27/09) — FEITO

Em 23/09: GitHub Pages desligado (`github.io` devolve 404), `github.io`
removido do `ALLOWED_ORIGINS`, repositório fechado (privado) e `www`
redirecionando para a raiz com 308.

Sobrou um endereço público de venda, que é o certo.

Zona de DNS final, 7 registros:

| Nome | Tipo | Valor |
|---|---|---|
| (raiz) | A | `216.198.79.1` |
| (raiz) | A | `64.29.17.1` |
| `www` | CNAME | `dc089d8ac3330511.vercel-dns-017.com` |
| `resend._domainkey` | TXT | chave DKIM |
| `send` | CNAME | `send.forge.rmta.net` |
| `rsend` | CNAME | `rsend-sae1.forge.rmta.net` |
| `_dmarc` | TXT | `v=DMARC1; p=none; rua=...` |

O Registro.br **republica a zona de forma assíncrona**: logo depois de
salvar, o serial do SOA ainda é o antigo e o registro novo não existe. Não é
erro, é fila — esperar alguns minutos. E conferir sempre em `d.sec.dns.br`,
nunca em `a.auto.dns.br`.

### 4. Mercado Pago em produção

1. Na Vercel: `PAYMENT_PROVIDER=mercadopago`, `MERCADOPAGO_ACCESS_TOKEN`
   (produção) e `MERCADOPAGO_WEBHOOK_SECRET` — **e redeployar**. Apagar as
   `ASAAS_*` de lá.
2. `/api/saude` tem que dizer `"pagamento": "mercadopago"` e
   `"mercadopago": { "credencial": true, "webhookAssinado": true }`, com `ok:true`.
3. No painel, Webhooks → **Simular**: tem que voltar 200 (ID inexistente é
   ignorado de propósito).
4. Compra real no Pix pelo site, R$ 55, e estorno pelo painel — é ela que
   prova o Pix, o webhook assinado e o e-mail de ponta a ponta.

### 5. Varredura de segurança de 23/09 (tudo passou)

Conferido **em produção**, no domínio novo:

| Porta | Resposta |
|---|---|
| `/api/dev/simular-pagamento` | 404 (só existe com `PAYMENT_PROVIDER=mock`) |
| `/api/admin/...` sem token e com token errado | 401 |
| `/api/webhook` sem token | 401 |
| rota inventada | 404 |
| CORS de origem estranha | sem permissão |
| `/backend/.env` pela web | 404 |

E no repositório: `.env` e `.env.vercel` fora do Git, remote sem token na
URL, os 4 registros de e-mail no ar.

Tudo o que estava pendente aqui foi feito no mesmo dia — ver item 2.

### 6. Opcional

O contador "X de 350 vendidos" da landing nunca aparece: `/api/produtos` não
devolve o campo `vagas`. Dá para ligar contando os pedidos PAGOS da planilha.

---

## Auditoria de 24/09 (depois do Mercado Pago no ar)

`npm test` 36 verdes (eram 32) e `auditar-portas` 16/16. **No ar desde 24/09,
12:58 (deploy `235b4d4` READY).** Conferido no ar: `/api/saude` `ok:true`, as 4
páginas 200, `ESTADO.md`/runbooks/testes/scripts 404, os três cabeçalhos
presentes, simulador 404, admin e webhook 401, CORS estranho sem permissão,
checkout com dado inválido 422 e o `script.js` novo servido.

### Corrigido

| Achado | Risco | Correção |
|---|---|---|
| Cartão recusado e depois aprovado, com o webhook do aprovado perdido | `consultarPedido` tratava RECUSADO como final e não perguntava mais ao Mercado Pago: a página dizia "não aprovado" para quem **pagou**, e ela comprava de novo (cobrança dobrada) | RECUSADO não encerra a consulta. Teste novo em `mercadopago.test.js` falhava antes (`RECUSADO`) e passa agora |
| `PAYMENT_PROVIDER` ausente em produção cai no `mock` | o `/api/dev/simular-pagamento` abria ao público: ingresso PAGO na planilha e no e-mail sem dinheiro nenhum | em produção o mock não vende (503) e o simulador é 404. `test/producao.test.js` provou 201/200 antes, 503/404 depois |
| `/api/saude` dizia `ok:true` com planilha em memória, e-mail desligado ou pagamento simulado em produção | monitoração cega para as três falhas que mais custam | nesses casos `ok:false` (e o `auditar-portas` confere) |
| Landing decidia o lote pelo fuso de quem vê | em Manaus/Acre/fora do Brasil o link do lote vencido ficava aceso e o do aberto, apagado, na hora da virada | `script.js` usa UTC-3 fixo como o `catalogo.js`; comparados 86.400 minutos (20/09–20/10) em UTC e UTC-3: 0 divergências |
| Domínio de venda servia `ESTADO.md`, runbooks, testes e scripts | exposição desnecessária (Gmail, ID da conta MP, mapa dos tokens) | `.vercelignore` exclui `*.md`, `backend/test`, `backend/scripts`, `.env.example`. `backend/src/` continua público: a função precisa dele no pacote |
| Sem cabeçalhos de segurança nas páginas | checkout (com CPF) podia ser embutido em iframe de terceiros | `vercel.json`: `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` |
| `testar-email.js` com `valorTotal: 55` | o e-mail de teste mostrava R$ 0,55 (o valor é em centavos) | `5500` |
| `SITE_URL` padrão apontava para o GitHub Pages desligado | sem a variável, links de e-mail e retorno do cartão iam para um 404 | padrão = domínio próprio (também no `.env.example`) |
| `req.corpoBruto` guardado em todo JSON | sobra da assinatura do Asaas; ninguém lia | removido |

Se a API cair num deploy futuro, o `.vercelignore` é o primeiro suspeito:
a função só precisa de `api/` e `backend/src/`.

### Não mexido, de propósito

- `/api/ingressos/:codigo/qr.png`: parece morto, mas os e-mails enviados **antes** de `e9ccd28`
  (incluindo a compra real de 24/09) carregam a imagem por essa rota.
- `AUDITORIA.md` descreve o estado de antes (GitHub Pages, PDF da Sipag): documento, não apago sem perguntar.
- `backend/tmp/`: prévias de e-mail de teste, fora do Git e do deploy.

---

## Auditoria completa de 23/09 (PROMPT-AUDITORIA.md)

`npm test` (26) e `npm run auditar` (61) verdes antes e depois.

### Corrigido

**A janela de venda era decidida pelo fuso do servidor.** `catalogo.js` montava
as bordas com `new Date(ano, mes, dia)`. Na Vercel, que roda em UTC, o 1º lote
abriria às 21 h de 26/09 e fecharia às 21 h de 06/10, não às 23:59.

O estrago não era abrir cedo: era a noite de **06/10, das 21:00 às 23:59**. A
landing (que usa o fuso do navegador, o certo) ainda mostra "vendas abertas" a
R$ 55 e deixa clicável só o lote 1 — que a API já recusa com 409 — enquanto o
lote 2, que a API já aceita, está sem link. **Ninguém consegue comprar durante
as 3 h em que o preço vira.** O mesmo nas últimas 3 h de 15/10, a véspera do
evento. Agora as bordas são instantes absolutos (UTC-3 fixo) e o teste as crava
em UTC, então o mesmo erro não volta: rodando com `TZ=UTC`, o teste novo falha
contra o código antigo e passa contra o corrigido. **No ar desde 23/09** (deploy
`7ce2305`).

### Provado nesta auditoria

| O quê | Como |
|---|---|
| Os 7 registros de DNS | consultados em `d.sec.dns.br` (200.160.0.14); todos intactos, SOA serial 2026266003 |
| Resend | API `/domains`: `verified`, `sa-east-1`, domínio próprio |
| `EMAIL_FROM` em produção | `Ingressos Conferência <ingressos@evangelhoplenoparagominas.com.br>` — o remetente **está** no domínio próprio |
| As 14 variáveis | todas presentes em Production; nenhuma que o código lê está faltando |
| `ALLOWED_ORIGINS` | `conf-mulheres-plenas.vercel.app` + `www...`; mais a origem do `SITE_URL`, somada pelo código |
| Portas fechadas | `/api/dev/simular-pagamento` 404, admin e webhook 401 sem token e com token errado, `/backend/.env` 404, CORS estranho sem permissão |
| Trava de janela no ar | `POST /api/checkout` devolve 409 |
| Segredo no Git | nenhum, nem no histórico: só `.env.example` |
| Código morto | procurado e **não encontrado**: as 8 dependências são usadas, as 12 imagens são referenciadas |

### Pendente, e é o mais urgente

**1. O `git push` não implantava — RESOLVIDO em 23/09.** Desde que o
repositório virou privado, todo deploy voltava `BLOCKED` com
`seatBlock.blockCode = TEAM_ACCESS_REQUIRED`: o projeto fica sob um *team* e a
conta é Hobby, que não aceita membro de time. Nem o botão Redeploy funcionava.
Os 5 commits daquele intervalo nunca foram ao ar — por sorte eram só `.md`.

**Saída tomada: o repositório voltou a ser público**, que é o único estado em
que este projeto comprovadamente implanta. Conferido antes de abrir: nenhum
segredo versionado, nem no histórico — só `.env.example`. O que protege o site
são as variáveis no painel da Vercel, não a privacidade do código. Se um dia
fechar de novo, o deploy volta a quebrar: a alternativa grátis é deploy pela
CLI com um token **de conta** (o do `.env` é escopado ao projeto e o CLI recusa).

Deploy `7ce2305` **READY** em 23/09, com a correção do fuso. Verificado no ar:
`/api/saude` de pé, checkout devolvendo 409, as 4 páginas em 200 e as 6 portas
fechadas.

**3. Dois ingressos podiam sair com códigos diferentes — CORRIGIDO.** Os
códigos eram sorteados, e o webhook e a consulta da página de pagamento podem
cair em instâncias diferentes: se as duas lessem o pedido ainda `PENDENTE`,
cada uma sorteava um par. O e-mail saía com o da primeira (a idempotência do
Resend segura o segundo) e a planilha ficava com o da segunda — a mulher
chegava na portaria com um código que a planilha não conhecia. Agora os
códigos são **derivados do `Pedido_ID`**: as duas instâncias chegam ao mesmo
resultado e a corrida deixa de importar. No ar desde 23/09 (`456d3e0`).

**4. Falha de e-mail não era retentada — CORRIGIDO.** `emailEnviado: ERRO`
ficava parado esperando alguém reparar na coluna da planilha, com o dinheiro
já dentro. Agora `ERRO` conta como pendente e cada consulta tenta de novo; a
chave de idempotência do Resend impede o e-mail dobrado.

---

## Comandos (rodam na RAIZ do repositório, não em `backend/`)

```bash
npm test                 # 36 testes (o Mercado Pago simulado no processo)
npm run auditar          # com credencial de TESTE: checkout, webhook assinado + portas fechadas
npm run mercadopago:testar          # fala com a API de verdade (Pix só em produção, e cancela)
npm run mercadopago:ensaio-cartao   # compra no cartão pelo Checkout Pro, paga à mão
npm run planilha:testar  # acesso e permissão na planilha
npm run email:testar -- voce@gmail.com   # dispara um ingresso falso ([TESTE] no assunto)
npm run dev              # API local em http://localhost:3000
```

O `.env` fica em `backend/.env` (o `config.js` aponta o caminho na mão).

---

## Armadilhas já pagas — não redescobrir

| O quê | Por quê |
|---|---|
| `google-spreadsheet` só com `import()` | é ESM; o carregador da Vercel não aceita `require()` e a API morria inteira |
| Chave Pix na conta | sem ela o Pix não gera QR |
| Sem `GOOGLE_*` em produção | o checkout recusa com 503 de propósito: pedido em memória na Vercel = dinheiro cobrado e ingresso nenhum |
| `onboarding@resend.dev` | só entrega para o dono da conta Resend, e mesmo assim no spam (resolvido em 23/09) |
| `a.auto.dns.br` responde pelo domínio | e responde **errado** — a delegação real é `d.sec`/`f.sec`. Conferir DNS por ele dá diagnóstico falso |
| Variável nova na Vercel sem redeploy | fica gravada e a função continua com a antiga até o próximo deploy |
| Previews da Vercel | têm proteção de login e devolvem 302; só a URL de produção é aberta |
| Fuso do servidor na janela de venda | `new Date(ano, mes, dia)` usa o fuso de quem roda. A Vercel roda em UTC e a máquina de desenvolvimento está em UTC-3, igual a Paragominas: o erro passava despercebido no teste e deslocava a venda em 3 h no ar. Corrigido em 23/09 — as bordas agora são instantes absolutos |
| `addRow({ insert: true })` na planilha | vira `INSERT_ROWS`, e o Google copia o formato da linha de cima: a 1ª venda herdava o cabeçalho marrom e as seguintes, dela. A API grava com `insert: false` (próxima linha vazia, branca) desde 24/09; `npm run planilha:preparar` pinta de branco o que já tiver herdado |
| `TZ=` no Windows | o Node desta máquina só respeita `TZ=UTC`; `TZ=America/Belem`, `Asia/Tokyo` etc. caem silenciosamente no fuso da máquina. Conferir com `getTimezoneOffset()` antes de confiar num teste "em outro fuso" |
| Ler variável da Vercel pela API | `/v9/projects/.../env` devolve o valor **cifrado** mesmo com `decrypt=true`; quem devolve texto claro é `/v1/projects/.../env/<id>`, um id por vez. E variável do tipo `sensitive` (hoje só `EMAIL_REPLY_TO`) **nunca** devolve valor — `undefined` ali significa "não revelado", não "vazio" |
| Token na URL do remote | `git push` era bloqueado por vazamento de credencial; a saída é remote limpo + Git Credential Manager |
| Repositório privado em conta Hobby | **derruba o deploy inteiro.** Em 23/09 o repo virou privado e todo push passou a voltar `BLOCKED`: `seatBlock.blockCode` = `TEAM_ACCESS_REQUIRED`, "the commit author doesn't have permission to create deployments". O projeto fica sob um *team*, e Hobby não aceita membro de time — nem o botão Redeploy funciona, ele só oferece *Upgrade to Pro*. **Saída tomada: repositório de volta a público.** O motivo está em `readyStateReason`/`seatBlock`, não em `errorCode`/`blockedReason` |
| Deploy `BLOCKED` não pode ser reimplantado | a API responde `deployment_can_never_deploy` — "please try again from a fresh commit". Não adianta insistir no redeploy: resolva a causa e faça um commit novo (vazio serve) |
| `VERCEL_TOKEN` do `.env` é escopado ao projeto | serve para a API do projeto (deployments, variáveis), mas **o CLI não autentica com ele**: o `vercel` chama `/v2/user` primeiro e recebe `User not found`. Para usar o CLI, gerar um token de conta |

---

## Onde as coisas moram

```
novo-evento/
  index.html  checkout.html  pagamento.html  confirmacao.html
  config.js                  endereço da API para o site
  script.js  pedido.js       landing / telas de compra
  api/index.js               entrada da API na Vercel
  vercel.json                manda /api/... para a função
  package.json               dependências e comandos (raiz)
  PROMPT-AUDITORIA.md        runbook de auditoria completa (fases, regras,
                             limpeza e formato do relatorio)
  backend/
    .env                     segredos (fora do Git)
    src/catalogo.js          lotes, preços e janelas
    src/config.js            lê o .env e valida
    src/routes/              publicas, webhook, admin
    src/services/            pagamento/, sheetsService, emailService, pedidoService
    scripts/                 auditar-mercadopago, auditar-portas, testar-mercadopago, ensaio-cartao, testar-email, planilha
    test/                    26 testes
```
