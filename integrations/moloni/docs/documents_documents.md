<!-- Source: https://www.moloni.pt/dev/documents/documents/ — fetched 2026-07-07, extracted verbatim from raw HTML (raw copy in docs/raw/documents_documents.html) -->

sectionHoldContent">

Documentação API

-

Introdução

-

Visão geral

-

Criar uma conta

-

Autenticação

-

Exemplos

-

Utilização

-

Controlo de Erros

-

Sandbox

-

ChangeLog

-

Plugins

-

Account & Profile

-

-

My Profile

-

Company

-

-

Company

-

Subscription

-

Users

-

Entities

-

-

Customers

-

Customer Alternate Addresses

-

Suppliers

-

Salesmen

-

Products

-

-

Products

-

Product Categories

-

Product Stocks

-

Price Classes

-

Documents

-

-

Documents

-

Invoices

-

Receipts

-

Credit Notes

-

Debit Notes

-

Simplified Invoices

-

Delivery Notes

-

Bills of Lading

-

Own Asset MG

-

Waybills

-

Customer Return Note

-

Estimates

-

Internal Documents

-

Invoice Receipts

-

Payment Returns

-

Purchase Order

-

Supplier Purchase Order

-

Supplier Invoices

-

Supplier Simplified Invoices

-

Supplier Credit Notes

-

Supplier Debit Notes

-

Supplier Return Notes

-

Supplier Receipts

-

Supplier Warranty Requests

-

Global Guides

-

Settings

-

-

Bank Accounts

-

CAE Codes

-

Payment Methods

-

Maturity Dates

-

Delivery Methods

-

Vehicles

-

Deductions

-

Tax & Fees

-

Measurement Units

-

Identification Templates

-

Document Sets

-

Warehouses

-

Product Properties

-

Global Data

-

-

Countries

-

Fiscal Zones

-

Languages

-

Currencies

-

Document Models

-

Tax Exemptions

-

Currency Exchange

-

Multibanco Gateways

Moloni API / Endpoints / Documents / Documents

# Documents | Documents

## Documentação API Moloni Portugal | Documents | Documents

getAllDocumentTypes

Devolve todos os tipos de documentos.

getByMBReference

Permite efetuar a pesquisa de um documento através da referência multibanco.

setMBReferenceAsPaid

Atualizar pagamento de uma referência.

count

Devolve a quantidade de documentos da empresa. Se forem definidas op&ccedil;&otilde;es de pesquisa, &eacute; devolvida a quantidade de documentos que as cumpram.

getAll

Devolve os documentos da empresa. Se forem definidas op&ccedil;&otilde;es de pesquisa, s&atilde;o devolvidos os documentos que as cumpram.

getOne

Devolve os dados do documento pedido, respeitando os par&acirc;metros de pesquisa. No caso dos par&acirc;metros de pesquisa corresponderem a mais do que um documento, apenas o primeiro a ser encontrado ser&aacute; devolvido.
Dependendo se foi ...

getPDFLink

Devolve a ligação onde pode ser feito o download do documento pedido.
Só podem ser pedidos documentos que já não estejam em estado de rascunho ( status 0).
O campo signed é opcional, e é responsável por garantir a assinatura do pdf. Se...

countModifiedSince

Devolve a contagem de documentos que foram alterados ou criados desde uma determinada data e hora.
Para al&eacute;m de ser chamado atrav&eacute;s deste endpoint , tamb&eacute;m pode ser chamado atrav&eacute;s dos endpoints de tipos de ...

getModifiedSince

Devolve os documentos que foram alterados ou criados desde uma determinada data e hora.
Para al&eacute;m de ser chamado atrav&eacute;s deste endpoint , tamb&eacute;m pode ser chamado atrav&eacute;s dos endpoints de tipos de d...

deleteMBReference

Elimina a referência multibanco de um documento.

documentCancel

Permite colocar um documento no estado anulado ( status 2).
Apenas podem ser anulados documentos:

No estado "fechado" ( status 1);
Não estejam pendentes de comunicação à autoridade tributária;
Sem código AT associado (guias de tr...

documentDraft

Permite colocar um documento no estado rascunho ( status 0).
Apenas podem ser anulados documentos:

No estado "fechado" ( status 1);
Não estejam pendentes de comunicação à autoridade tributária;
Não deram origem a qualquer documen...

<div class="
