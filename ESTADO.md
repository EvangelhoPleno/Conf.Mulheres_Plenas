# Estado do projeto — 22/09/2026

Resumo para retomar o trabalho sem reler o histórico. Evento: **Conferência
Mulheres Plenas, 16 e 17 de outubro de 2026, Paragominas–PA**.

---

## O que já está no ar e provado

**https://conf-mulheres-plenas.vercel.app** — site e API no mesmo domínio.

| Peça | Estado |
|---|---|
| Vercel | projeto `conf-mulheres-plenas`, implanta da branch `main`, Root Directory na raiz |
| API | `api/index.js` acorda o Express de `backend/`; `vercel.json` manda `/api/...` para ele |
| Pagamento | Asaas **SANDBOX** (`PAYMENT_PROVIDER=asaas`) |
| Webhook | cadastrado no Asaas e **testado no ar: status 200** |
| Planilha | Google Sheets gravando (`/api/saude` mostra `planilha: google-sheets`) |
| E-mail | Resend entrega, mas **cai no spam** — falta domínio |
| Variáveis | as 12 cadastradas na Vercel (Production + Preview) |

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

### 1. Domínio — único item com prazo de terceiro

Sem ele o ingresso cai no spam (comprovado no ensaio). Em 5 dias abre a venda.

1. Registrar **`mulheresplenas.com.br`** no [registro.br](https://registro.br)
   (estava livre em 22/09). Usar **CNPJ da igreja** se existir, senão CPF.
   Pelo menos 3 anos. **Pagar com Pix** — boleto leva até 3 dias úteis.
2. Não mexer no DNS: deixar o gratuito do Registro.br (`a.auto.dns.br`).
3. Adicionar o domínio no **Resend** e colar os registros SPF, DKIM e DMARC
   no "Editar Zona" do Registro.br. Depois trocar `EMAIL_FROM` na Vercel para
   `Ingressos Conferência <ingressos@mulheresplenas.com.br>`.
4. Adicionar o domínio na **Vercel** e criar os registros que ela pedir.
   Depois atualizar `SITE_URL`, `API_URL` e o `apiUrl` do `config.js` da raiz.

### 2. Limpeza de segredo (fazer hoje)

- Revogar o token da Vercel em Settings → Tokens (ele foi exposto num chat)
- Apagar a linha `VERCEL_TOKEN` de `backend/.env`
- Apagar o arquivo `backend/.env.vercel` (tem todos os segredos em claro)

Nenhum dos dois está no Git.

### 3. Antes de divulgar (domingo, 27/09)

O GitHub Pages ainda serve uma cópia antiga do site, sem checkout. Desligar ou
redirecionar — duas páginas públicas da mesma conferência confunde.

### 4. Quando o Asaas aprovar a conta de produção

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
| `onboarding@resend.dev` | só entrega para o dono da conta Resend, e mesmo assim no spam |
| Previews da Vercel | têm proteção de login e devolvem 302; só a URL de produção é aberta |

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
    scripts/                 auditar-fluxo, auditar-portas, testar-asaas, planilha
    test/                    26 testes
```
