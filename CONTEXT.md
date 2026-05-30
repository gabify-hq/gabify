# Gabify — Product Context

## O que é o Gabify

Gabify é uma plataforma operacional para gabinetes de contabilidade portuguesa.
É uma **camada inteligente de intake e workflow** que fica ANTES do software de contabilidade (Primavera, TOConline, Sage).

**Não substitui** o software de contabilidade — organiza o caos operacional antes disso.

### Problema que resolve

Os gabinetes de contabilidade em Portugal operam num caos constante de:
- Emails de clientes sem resposta ou mal classificados
- Documentos (faturas, recibos, extratos) em pastas de email sem organizar
- Contabilistas a gastar 30-40% do tempo em trabalho de intake manual
- Clientes que não sabem o que foi recebido, processado ou está em falta
- Sem rastreabilidade de quem fez o quê e quando

### Proposta de valor

Gabify processa o caos operacional automaticamente com AI — mas sempre com o contabilista no loop de decisão.
O contabilista aprova com 1 clique. O AI nunca age sozinho no mundo exterior.

---

## Princípios do produto

### 1. AI como copiloto, nunca piloto
Toda a ação que afeta o exterior (enviar email, notificar cliente, arquivar documento) requer aprovação explícita do contabilista.
Sem exceções.

### 2. Rastreabilidade total
Tudo o que o AI faz fica no `AuditLog` com timestamp, modelo usado, e quem aprovou.
O AuditLog é imutável — nunca apagado, nunca editado.

### 3. Documentos privados por defeito
Anexos no Cloudflare R2 nunca têm acesso público.
Sempre signed URLs com expiração máxima de 1 hora.

### 4. Português de Portugal, não PT-BR
UI, emails gerados, mensagens de erro — tudo em PT-PT.
Datas no formato DD/MM/YYYY. Moeda em €X,XX.

### 5. Desenhado para contabilistas, não para startups
Interface densa e funcional. Tabelas em vez de cards. Sem excessos visuais.
O utilizador passa 8h/dia nisto — velocidade e clareza antes de estética.

---

## Roadmap de módulos

> **Estado actual: Módulo 1 em construção. Os restantes são visão futura.**

### ✅ Módulo 0 — Fundação (scaffolding)
Infraestrutura base: schema Prisma, clientes (R2, Anthropic, Resend), abstração EmailProvider, workers BullMQ.

### 🔨 Módulo 1 — Email Copilot (em construção)
**Agente que processa a caixa de entrada do contabilista.**

Fluxo:
1. Lê inbox via Microsoft Graph API (Outlook) ou Gmail API
2. Classifica email por cliente — matching por email conhecido ou domínio
3. Extrai e arquiva anexos no Cloudflare R2
4. Classifica documentos por conteúdo com Claude AI (não pelo nome do ficheiro)
5. Gera rascunho de resposta para aprovação
6. Contabilista aprova/edita/rejeita com 1 clique
7. Só após aprovação: email é enviado, documento é arquivado

Providers de email:
- Microsoft Graph API (prioritário — mais comum nos gabinetes PT)
- Gmail API
- IMAP (stub/fallback)

### 📋 Módulo 2 — Client Portal (futuro)
Portal self-service para clientes do gabinete.
- Cliente faz upload de documentos diretamente (sem enviar por email)
- Contabilista vê tudo organizado por cliente e período fiscal
- Notificações quando documentos estão em falta
- Histórico de comunicações

### 📁 Módulo 3 — Document Vault (futuro)
Repositório estruturado de todos os documentos processados.
- Organização automática por cliente / tipo / período
- Pesquisa por conteúdo (não por nome de ficheiro)
- Exportação para software de contabilidade (CSV, XML, integração API)
- Controlo de versões de documentos

### 📊 Módulo 4 — Deadline Tracker (futuro)
Gestão de prazos fiscais e obrigações.
- Calendário fiscal português (IVA, IRS, IRC, SS, IMI, etc.)
- Alertas automáticos para contabilista e cliente
- Estado de cada obrigação: pendente / submetido / confirmado
- Integração com Portal das Finanças (AT)

### 💬 Módulo 5 — Client Communication Hub (futuro)
Canal centralizado de comunicação com clientes.
- Substituição de email disperso por threads estruturadas
- Pedidos de documentos com checklist
- Aprovações de declarações com assinatura digital
- Histórico completo por cliente

---

## Stack técnica

| Camada | Tecnologia | Notas |
|---|---|---|
| Framework | Next.js 14 App Router + TypeScript | strict mode |
| UI | Tailwind CSS + shadcn/ui | componentes base |
| Base de dados | PostgreSQL + Prisma ORM | migrations only |
| Jobs | BullMQ + Redis | email sync, doc parse |
| Storage | Cloudflare R2 | signed URLs, privado |
| Auth | Auth.js v5 | magic links, sem passwords |
| Email | Resend | magic links + notificações |
| AI | Claude API (Anthropic) | classificação + drafts |
| Deploy | Railway | web + workers separados |

---

## Personas de utilizador

### Contabilista (utilizador primário)
- 35-55 anos, Portugal
- Usa Primavera ou TOConline no dia-a-dia
- Recebe 50-200 emails/dia de clientes
- Dor principal: intake manual, documentos perdidos, clientes que não enviam o que precisam
- Quer: menos tempo em gestão, mais tempo em trabalho de valor

### Dono de gabinete (utilizador secundário)
- Quer visibilidade sobre o que a equipa está a processar
- Quer métricas: tempo de resposta, documentos processados, clientes activos
- Quer que novos contabilistas onboardem rápido

### Cliente do gabinete (utilizador terciário — Módulo 2+)
- Empresário ou particular
- Quer saber o que está pendente, o que foi recebido
- Quer comunicação clara sem email back-and-forth

---

## Contexto do mercado português

- **Software de contabilidade dominante**: Primavera BSS (líder), TOConline (cloud), Sage
- **Comunicação fiscal**: Portal das Finanças (AT), Segurança Social Direta
- **Obrigações fiscais recorrentes**: IVA (mensal/trimestral), IRS (anual), IRC (anual), SS (mensal), IMI (anual)
- **NIF** (Número de Identificação Fiscal): 9 dígitos — campo importante em todos os documentos
- **Datas**: formato DD/MM/YYYY, fuso horário Europe/Lisbon
- **Regulação**: RGPD aplica-se, dados financeiros são dados sensíveis
