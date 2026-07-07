<!-- Source: https://www.moloni.pt/dev/documents/invoices/ — fetched 2026-07-07, extracted verbatim from raw HTML (raw copy in docs/raw/documents_invoices.html) -->

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

Moloni API / Endpoints / Documents / Invoices

# Documents | Invoices

## Documentação API Moloni Portugal | Documents | Invoices

count

Devolve a quantidade de faturas da empresa. Se forem definidas op&ccedil;&otilde;es de pesquisa, &eacute; devolvida a quantidade de faturas que as cumpram.

getAll

Devolve as faturas de fornecedor da empresa. Se forem definidas opções de pesquisa, são devolvidos os documentos que as cumpram.

getOne

Devolve os dados da fatura pedida, respeitando os par&acirc;metros de pesquisa. No caso dos par&acirc;metros de pesquisa corresponderem a mais do que um documento, apenas o primeiro a ser encontrado ser&aacute; devolvido.
Dependendo se foi def...

insert

Insere uma nova fatura.
Os campos financial_discount , salesman_commission e ainda o campo discount de cada elemento do conjunto products , caso sejam preenchidos, devem ser valores em percentagem, de 0 a 100.
O campo speci...

update

Actualiza uma fatura.
N&atilde;o &eacute; poss&iacute;vel actualizar uma fatura que j&aacute; se encontre no estado fechado.
Os campos financial_discount , salesman_commission e ainda o campo discount de cada elemento do conjunto ...

delete

Elimina uma fatura.
N&atilde;o &eacute; poss&iacute;vel eliminar uma fatura que j&aacute; se encontre no estado fechado.

generateMBReference

Gera uma nova referência multibanco associada a faturas, pelo valor pedido.
Necessita de ter um sistema de geração de referências multibanco configurado na empresa, e o documento em causa tem que estar fechado ( status = 1 ).

<div class="
