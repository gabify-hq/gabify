<!-- Source: https://www.moloni.pt/dev/utilizacao/ — fetched 2026-07-07, extracted verbatim from raw HTML (raw copy in docs/raw/utilizacao.html) -->

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

Moloni API / Utilização

# Utilização

Para trabalhar com a API, &eacute; fundamental estar familiarizado com pedidos POST e autentica&ccedil;&atilde;o Oauth2.

Todos os pedidos para API dever&atilde;o ser enviados atrav&eacute;s do m&eacute;todo POST e os dados podem ser enviados em formato x-www-urlencoded ou em Json.

### Na query string do pedido devem estar inclu&iacute;dos os seguintes par&acirc;metros:

### Access token (access_token)

Par&acirc;metro obrigat&oacute;rio que deve estar sempre em todos os pedidos.

### Json (json)

A API por defeito aceita apenas dados em formato x-www-urlencoded.
Para enviar os dados em formato Json dever&aacute; acrescentar na query string do pedido o par&acirc;metro "json=true"

### Human errors (human_errors)

Existe ainda outro par&acirc;metro opcional: Human errors.
Ao enviar este par&acirc;metro, quando a API devolver algum erro, como por exemplo, inserir um documento ou inserir um artigo, juntamente com o erro, vem uma mensagem verbosa do mesmo.

Por exemplo, na falta da indica&ccedil;&atilde;o de uma s&eacute;rie de documento &eacute; retornado o erro "2 document_set_id".

### Body

Os restantes dados s&atilde;o enviados no body do POST, podendo estes ser enviados, tal como referido acima, em formato x-www-urlencoded ou Json.

Por exemplo, "company_id=5" em x-www-urlencoded ou "{company_id:5}" em json.

### Renova&ccedil;&atilde;o da Access Token

As access tokens t&ecirc;m uma validade de uma hora conforme descrito na documenta&ccedil;&atilde;o e &eacute; importante que a mesma seja usada praticamente na sua totalidade.

Depois de passar pelo processo de autentica&ccedil;&atilde;o, dever&aacute; guardar as duas tokens do seu lado e usar essa mesma access token at&eacute; que ela expire (ou esteja prestes a expirar).

Sempre que for fazer um pedido &agrave; API ou come&ccedil;ar um processo que envolva v&aacute;rios pedidos &agrave; API, dever&aacute; analisar primeiro se a access token ainda &eacute; v&aacute;lida.

Caso n&atilde;o seja v&aacute;lida dever&aacute; usar o endpoint de renova&ccedil;&atilde;o para obter duas novas tokens, e passar a usar essas.

<div class="
