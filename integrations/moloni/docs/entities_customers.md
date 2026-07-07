<!-- Source: https://www.moloni.pt/dev/entities/customers/ — fetched 2026-07-07, extracted verbatim from raw HTML (raw copy in docs/raw/entities_customers.html) -->

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

Moloni API / Endpoints / Entities / Customers

# Entities | Customers

## Administrar os clientes de uma empresa.

getAll

Devolve todos os clientes de uma empresa.

getOne

Devolve os detalhes de um cliente.

getBySearch

Devolve clientes com base nos resultados de uma pesquisa no campos do cliente. Os campos pesquisados s&atilde;o: N&uacute;mero, Contribuinte e Nome.

getByVat

Devolve clientes com base numa pesquisa por n&uacute;mero de contribuinte.

getByNumber

Devolve os clientes com base numa pesquisa por n&uacute;mero de cliente.

getByEmail

Devolve clientes com base numa pesquisa por email.

getByName

Devolve os clientes com base numa pesquisa por nome.

getNextNumber

Devolve o pr&oacute;ximo c&oacute;digo de cliente dispon&iacute;vel para ser usado

getLastNumber

Devolve o &uacute;ltimo c&oacute;digo de cliente em uso.

getModifiedSince

Devolve os clientes que foram alterados ou criados desde uma determinada data e hora.

count

Devolve a quantidade de clientes de uma empresa.

countBySearch

Devolve a quantidade de clientes com base nos resultados de uma pesquisa no campos do cliente. Os campos pesquisados s&atilde;o: N&uacute;mero, Contribuinte e Nome.

countByVat

Devolve a quantidade de clientes com base numa pesquisa por n&uacute;mero de contribuinte.

countByNumber

Devolve a quantidade de clientes com base numa pesquisa por n&uacute;mero de cliente.

countByEmail

Devolve a contagem de clientes que utilizem determinado email.

countByName

Devolve a quantidade de clientes com base numa pesquisa por nome.

countModifiedSince

Devolve a contagem de clientes que foram alterados ou criados desde uma determinada data e hora.

insert

Insere um novo cliente.
Se o pa&iacute;s for Portugal ( country_id 1) e o c&oacute;digo postal estiver preenchido, deve ser v&aacute;lido, isto &eacute;, 4 d&iacute;gitos, tra&ccedil;o, 3 d&iacute;gitos.
Tamb&eacute;m para Portugal, o cont...

update

Actualiza um cliente.
Se o cliente j&aacute; estiver referenciado em documentos, n&atilde;o &eacute; poss&iacute;vel alterar o n&uacute;mero de contribuinte e o n&uacute;mero de cliente. Qualquer altera&ccedil;&atilde;o destes dois campos ser&...

delete

Elimina um cliente.
N&atilde;o &eacute; poss&iacute;vel eliminar clientes que j&aacute; estejam referenciados em documentos. A tentativa obter&aacute; uma resposta inv&aacute;lida da API ( valid: 0 ).

<div class="
