# Estado do projeto — 23/09/2026

Resumo para retomar o trabalho sem reler o histórico. Evento: **Conferência
Mulheres Plenas, 16 e 17 de outubro de 2026, Paragominas–PA**.

---

## O que já está no ar e provado

**https://evangelhoplenoparagominas.com.br** — site e API no mesmo domínio.
(`conf-mulheres-plenas.vercel.app` continua respondendo, como endereço interno.)

| Peça | Estado |
|---|---|
| Vercel | projeto `conf-mulheres-plenas`, implanta da branch `main`, Root Directory na raiz |
| API | `api/index.js` acorda o Express de `backend/`; `vercel.json` manda `/api/...` para ele |
| Pagamento | Asaas **SANDBOX** (`PAYMENT_PROVIDER=asaas`) |
| Webhook | cadastrado no Asaas e **testado no ar: status 200** |
| Planilha | Google Sheets gravando (`/api/saude` mostra `planilha: google-sheets`) |
| E-mail | Resend no domínio próprio, **Verified** (sa-east-1). Teste no Gmail em 23/09: SPF, DKIM e DMARC **PASS** nos três |
| Variáveis | as 12 + `EMAIL_REPLY_TO`. Atenção: `EMAIL_FROM` e `EMAIL_REPLY_TO` foram criadas **só em Production** |
| Domínio | **https://evangelhoplenoparagominas.com.br** — site, API e e-mail, tudo no domínio próprio desde 23/09 |
| Git | remote **sem token na URL**; autenticação no Git Credential Manager (cofre do Windows). `git push` funciona direto |
| GitHub Pages | **desligado** em 23/09 — `github.io` devolve 404 |

**Ensaio completo feito em 22/09 e depois limpo:** compra pelo site → cobrança
no Asaas → Pix com QR → pedido na planilha → pagamento → webhook 200 → ingresso
`MP26-XXXX-XXXX` → e-mail entregue → aba Resumo somando certo.

### Lotes (as datas moram em DOIS lugares e têm que andar juntas)

| Lote | Janela | Preço |
|---|---|---|
| 1º | 27/09 a 06/10 | R$ 55,00 |
| 2º | 07/10 a 15/10 | R$ 65,00 |

- `backend/src/catalogo.js` — o que a API vende
- `index.html`, atributos `data-inicio` / `data-fim` — o que a landing mostra

Se mudar uma e esquecer a outra, o teste `janela de venda de cada lote` falha.
Ele existe para isso.

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
| `/api/saude` | Asaas, Google Sheets e Resend de pé |
| Trava de janela | `POST /api/checkout` devolve **409**, "abre em 27/09" |
| Acentuação | UTF-8 correto ponta a ponta |
| Certificado | emitido pela Vercel alguns minutos depois do `A` |

Registros `A` na raiz: `216.198.79.1` e `64.29.17.1` (faixa nova; o
`76.76.21.21` ainda funciona mas é a antiga).

`ALLOWED_ORIGINS` **foi criada na Vercel** e não existe no Git. Sem ela, em
produção a única origem liberada é a do `SITE_URL` — o checkout do Pages
teria quebrado por CORS no instante do deploy. Hoje vale
`conf-mulheres-plenas.vercel.app` e o `www`.

**Não verificado:** de que endereço o ingresso chega numa compra real. A
trava de 27/09 impede o teste, e `/api/saude` não expõe o remetente.

### 2. Limpeza de segredo (fazer agora — o resto já está pronto)

- Revogar o token da Vercel em Settings → Tokens (ele foi exposto num chat)
- Revogar o token do GitHub: ele ficou em texto puro na URL do remote, dentro
  do `.git/config`. Já foi retirado de lá em 23/09 e a autenticação passou
  para o Git Credential Manager, mas o token em si continua válido
- Apagar a linha `VERCEL_TOKEN` de `backend/.env`
- Apagar o arquivo `backend/.env.vercel` (tem todos os segredos em claro)

Nenhum dos dois está no Git.

### 3. Antes de divulgar (domingo, 27/09) — Pages FEITO

O GitHub Pages foi desligado em 23/09 (`github.io` devolve 404) e o
`github.io` saiu do `ALLOWED_ORIGINS`. Sobrou um endereço público de venda,
que é o certo.

Falta: fechar o repositório (privado), e o `www` redirecionando para a raiz
— na Vercel com "Redirecionar para" a raiz, e um `CNAME www ->
dc089d8ac3330511.vercel-dns-017.com.` no Registro.br. Hoje quem digitar
`www.` bate em erro.

### 4. Asaas de produção — tem a mesma data-limite da venda

**Isto não é "quando der": em 27/09 a janela do 1º lote abre sozinha, pelo
relógio.** Se a conta de produção não estiver ligada até lá, as primeiras
compras rodam em **sandbox** — a compradora vê o QR, o pedido entra na
planilha, o ingresso é emitido, e o dinheiro nunca chega.

Se até 26/09 o Asaas não tiver aprovado, empurrar a data de abertura nos
**dois** lugares (`catalogo.js` e `index.html`) em vez de abrir a venda.

Quando aprovar:

1. Gerar a chave de produção **sem permissão de saque** e sem expiração curta
   (chargeback chega até ~90 dias depois)
2. Na Vercel: `ASAAS_API_URL=https://api.asaas.com/v3` e a chave `$aact_prod_`
3. Cadastrar o webhook na conta de produção — mesma URL, mesmo
   `ASAAS_WEBHOOK_TOKEN`, mesmos 6 eventos, v3, não sequencial
4. Conferir se a conta tem **chave Pix ativa** (sem ela o primeiro QR falha)
5. Cobrança real de teste de **R$ 5,00 ou mais** (o Asaas recusa R$ 1,00)

### 5. Opcional

O contador "X de 350 vendidos" da landing nunca aparece: `/api/produtos` não
devolve o campo `vagas`. Dá para ligar contando os pedidos PAGOS da planilha.

---

## Comandos (rodam na RAIZ do repositório, não em `backend/`)

```bash
npm test                 # 26 testes de unidade
npm run auditar          # 61 verificações: compra inteira no sandbox + portas fechadas
npm run asaas:testar     # só o Asaas, ponta a ponta
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
| Cobrança mínima do Asaas: **R$ 5,00** | R$ 1,00 é recusado — o teste em produção precisa ser maior |
| Chave Pix na conta | sem ela o primeiro QR do Pix falha com 400 |
| Celular "implausível" (11 dígitos iguais) | o Asaas recusa com `invalid_mobilePhone` e derrubava a compra; agora o cadastro é refeito sem telefone |
| Prefixo da chave × URL | `$aact_hmlg_` só com sandbox, `$aact_prod_` só com produção; trocado dá 401 sem explicação |
| Sem `GOOGLE_*` em produção | o checkout recusa com 503 de propósito: pedido em memória na Vercel = dinheiro cobrado e ingresso nenhum |
| `onboarding@resend.dev` | só entrega para o dono da conta Resend, e mesmo assim no spam (resolvido em 23/09) |
| `a.auto.dns.br` responde pelo domínio | e responde **errado** — a delegação real é `d.sec`/`f.sec`. Conferir DNS por ele dá diagnóstico falso |
| Variável nova na Vercel sem redeploy | fica gravada e a função continua com a antiga até o próximo deploy |
| Previews da Vercel | têm proteção de login e devolvem 302; só a URL de produção é aberta |
| Data cravada no `receiveInCash` | a auditoria tinha `paymentDate: '2026-09-22'` fixo e passou a falhar com 400 no dia seguinte ao ensaio; o Asaas exige data entre a criação da cobrança e hoje |
| Token na URL do remote | `git push` era bloqueado por vazamento de credencial; a saída é remote limpo + Git Credential Manager |

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
  backend/
    .env                     segredos (fora do Git)
    src/catalogo.js          lotes, preços e janelas
    src/config.js            lê o .env e valida
    src/routes/              publicas, webhook, admin
    src/services/            pagamento/, sheetsService, emailService, pedidoService
    scripts/                 auditar-fluxo, auditar-portas, testar-asaas, testar-email, planilha
    test/                    26 testes
```
