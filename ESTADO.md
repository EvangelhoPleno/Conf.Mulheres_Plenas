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
| Repositório | **privado** desde 23/09; a Vercel continua implantando pelo GitHub App |
| `www` | responde com **308** para a raiz |

**Ensaio completo feito em 22/09 e depois limpo:** compra pelo site → cobrança
no Asaas → Pix com QR → pedido na planilha → pagamento → webhook 200 → ingresso
`MP26-XXXX-XXXX` → e-mail entregue → aba Resumo somando certo.

### Lotes (as datas moram em TRÊS lugares e têm que andar juntas)

| Lote | Janela | Preço |
|---|---|---|
| 1º | 27/09 a 06/10 | R$ 55,00 |
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

### 4. Asaas de produção — DUAS etapas pendentes, não uma

**Situação em 23/09** (conferida no painel):

| Etapa | Estado |
|---|---|
| Preenchimento dos Dados Comerciais | **Aprovado** |
| Envio de documentos | **Em análise** |
| Aprovação geral | **Pendente** — só começa depois das anteriores |
| Chave Pix | bloqueada, depende da mesma fila |

**Decisão tomada em 23/09: manter a abertura em 27/09 e reavaliar no sábado,
26/09.** O endereço ainda não foi divulgado, então a exposição é pequena.

**Isto não é "quando der": em 27/09 a janela do 1º lote abre sozinha, pelo
relógio.** Se a conta não estiver aprovada até lá, a compradora recebe um QR
de **sandbox**, que o banco dela não reconhece: ela não consegue pagar, o
pedido fica pendente na planilha e o ingresso não sai.

#### O que fazer no sábado, 26/09

Se a aprovação geral **não** tiver saído, adiar a abertura. Mudança sugerida:
1º lote de `2026-10-01` a `2026-10-06`, 2º lote intacto. São os três lugares
da seção "Lotes" acima, e depois `npm test`.

Se tiver saído:

1. Gerar a chave de produção **sem permissão de saque** e sem expiração curta
   (chargeback chega até ~90 dias depois)
2. Na Vercel: `ASAAS_API_URL=https://api.asaas.com/v3` e a chave `$aact_prod_`
   — **e redeployar**, senão a função continua com a de sandbox
3. Cadastrar o webhook na conta de produção — mesma URL
   (`https://evangelhoplenoparagominas.com.br/api/webhook`), mesmo
   `ASAAS_WEBHOOK_TOKEN`, mesmos 6 eventos, v3, não sequencial
4. Conferir se a **chave Pix** está ativa (sem ela o primeiro QR falha com 400)
5. Cobrança real de teste de **R$ 5,00 ou mais** (o Asaas recusa R$ 1,00) —
   e é ela que finalmente prova de que endereço o e-mail de ingresso chega

### 5. Teste com os pastores — decidido: NÃO antes do Asaas

Perguntado em 23/09 se dava para os pastores testarem o fluxo inteiro até o
e-mail chegar. **Dá**, e sem quebrar nada: eles compram, recebem o QR, e a
cobrança é marcada como paga pela API do sandbox (o mesmo `receiveInCash` da
auditoria), o que dispara o webhook real, emite o ingresso e manda o e-mail
de verdade. O único passo impossível é pagar — QR de sandbox não é aceito
por banco nenhum.

**O custo:** a janela de venda teria que ficar aberta durante o teste, e aí
o site fica genuinamente comprável por qualquer um com o endereço. Além
disso o e-mail deles **não** viria marcado como teste (o `[TESTE]` no
assunto só sai quando a transação começa com `mock_`; pelo sandbox do Asaas
ela começa com `pay_`), e os pedidos entrariam na planilha real.

**Decisão: não fazer.** O mesmo teste sai mais fiel e sem exposição nenhuma
depois da aprovação do Asaas, com uma cobrança real de R$ 5,00 que se estorna
— e é ele que também vai provar de que endereço o e-mail de ingresso chega.

### 6. Varredura de segurança de 23/09 (tudo passou)

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

### 7. Opcional

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
| Deploy `BLOCKED` na Vercel | aconteceu com o deploy em voo na hora de fechar o repositório; a API não dá motivo nenhum nesse estado (nem `errorCode`, nem `blockedReason`) — o redeploy resolveu, e o motivo legível só aparece no painel |

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
