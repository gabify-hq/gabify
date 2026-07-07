# Plano de Testes — Gabify

> Atualizado: 2026-06-03
> Branch de teste: `staging`

## Pré-requisitos

```bash
# 1. Docker Desktop a correr (Redis + Postgres visíveis como green)
# 2. Arrancar tudo:
git checkout staging && git pull origin staging
npm install
npm run dev:all
```

Confirma no terminal:
- `[next] ✓ Ready in Xms`
- `[email] [email-sync] scheduled poll for 1 account(s)`
- `[docs]` sem erros de ECONNREFUSED
- `[studio] Prisma Studio is running at: http://localhost:XXXXX`

---

## 1. Documentos — classificação real

**URL:** `localhost:3000/documents`

1. Confirma lista com ficheiros reais (não mock)
2. Se docs mostram 0% → apaga todos os Document records no Prisma Studio → reinicia workers
3. Aguarda 30–60s → recarrega
4. SAFT XML → tipo `Documento fiscal`, confiança ≥ 90%
5. ZIP com extratos → tipo `Extrato bancário`, confiança ≥ 85%
6. PDFs scan ("PAGO PELO SOCIO") → tipo reconhecido (fatura/recibo), confiança > 0%
7. Testa filtro por tipo → filtra corretamente
8. Testa filtro por período → formato MM/YYYY correto

**✅ Passou se:** nenhum doc mostra 0% após reclassificação

---

## 2. Email detail — anexos visíveis

**URL:** `localhost:3000/inbox` → clica email com ícone 📎

1. Corpo do email correto
2. Secção **"Anexos (N)"** aparece abaixo do corpo
3. Cada anexo mostra filename + mimeType
4. Email sem anexos → secção não aparece

**✅ Passou se:** anexos visíveis com filename + mimeType

---

## 3. Rascunho AI — com contexto de documentos

**URL:** `localhost:3000/inbox` → abre email com anexos classificados

1. Painel direito mostra "Rascunho AI • Aguarda aprovação"
2. Texto em PT-PT, máx 150 palavras
3. Começa com "Exmo(a). Sr(a)." ou "Caro/a"
4. Termina com "Com os melhores cumprimentos, [nome]"
5. **Se email tinha SAFT + extratos → rascunho confirma receção, NÃO pede docs**
6. Testa "Editar" → campo editável aparece
7. Testa "Rejeitar" → estado muda para Rejeitado
8. Email com múltiplos anexos → apenas 1 rascunho gerado (não duplicados)

**✅ Passou se:** rascunho correto, confirma docs recebidos, PT-PT

---

## 4. PDFs scan — OCR via Claude

**URL:** `localhost:3000/documents`

1. Envia email com PDF tirado de fotografia (ex: "PAGO PELO SOCIO.pdf")
2. Aguarda processamento (30–60s)
3. Documento deve aparecer com tipo reconhecido (RECEIPT, INVOICE_RECEIVED, etc.)
4. Confiança deve ser > 50%

**✅ Passou se:** PDF scan classificado com tipo real (não "Outro 0%")

---

## 5. Associação de remetente desconhecido

**URL:** `localhost:3000/inbox`

1. Se banner amber aparecer → confirma lista de remetentes desconhecidos
2. Clica "Associar" → seleciona cliente → confirma
3. Banner desaparece
4. Abre `localhost:3000/clients` → edita cliente → email adicionado em "Emails conhecidos"
5. Envia novo email do mesmo endereço → já associado automaticamente

**✅ Passou se:** associação persiste, futuros emails mapeados automaticamente

---

## 6. Dashboard — contadores reais

**URL:** `localhost:3000`

1. 5 cards visíveis: Emails, Documentos, Clientes, Por processar, Por identificar
2. Números batem certo com Prisma Studio (`localhost:XXXXX`)
3. "Por identificar" > 0 → link amber aparece → clica → vai para inbox

**✅ Passou se:** números coincidem com DB

---

## 7. Clientes — edição

**URL:** `localhost:3000/clients`

1. Clica ícone editar num cliente
2. Edita nome → guarda → atualizado na tabela
3. NIF inválido (ex: `123`) → erro inline
4. Adiciona domínio (ex: `empresa.pt`) → guarda
5. Email de `qualquer@empresa.pt` → associa automaticamente a esse cliente

**✅ Passou se:** validações funcionam, dados persistem

---

## Checklist Final

```
[ ] 1. Docs mostram confiança > 0% após reclassificação
[ ] 2. Anexos visíveis no email detail
[ ] 3. Rascunho confirma docs recebidos (não pede o que já foi enviado)
[ ] 4. PDFs scan classificados com tipo real
[ ] 5. Associação de remetente funciona + match retroativo
[ ] 6. Dashboard mostra contadores reais
[ ] 7. Edição de cliente persiste
[ ] Sem erros no terminal (exceto Studio stream + polling skips)
```

---

## Erros Begninos (ignorar)

- `[studio] ERR_STREAM_PREMATURE_CLOSE` — Studio funciona na mesma
- `[docs] attachment X already processed, skipping` — idempotência correta
- `npm warn allow-scripts` — dev deps, sem impacto

## Reset de Dados (quando necessário)

Para forçar reclassificação:
1. Abre Prisma Studio
2. Tabela **Document** → seleciona todos → apaga
3. Aguarda próxima poll (30s) → worker reclassifica tudo
