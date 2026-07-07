<!-- Source: https://www.moloni.pt/dev/company/company/getone/ — fetched 2026-07-07, extracted verbatim from raw HTML (raw copy in docs/raw/company_company_getone.html) -->

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

Moloni API / Endpoints / Company / Company / getOne

# getOne

Disponível na versão: 1.0+

Devolve os detalhe de uma empresa.
O contexto do pedido &eacute; sempre com base no utilizador que est&aacute; logado na API.

Pedido

https://api.moloni.pt/v1/companies/getOne/?access_token=[current_access_token]

Parâmetros

company_id int
Preenchimento obrigat&oacute;rio

Nota

- O parâmetro qty tem como default 50 e o offset 0, sendo que o máximo qty é 50;

- Campos de preenchimento facultativo, significa que podem ser uma string vazia ou zero, dependendo do respectivo tipo.

Resposta

{
company_id: int,
name: string,
email: string,
fax: string,
website: string,
subscription_date: datetime,
vat: string,
address: string,
city: string,
zip_code: string,
country_id: int,
capital: string,
commercial_registration_number: string,
registry_office: string,
phone: string,
image: string,
country:
{
country_id: int,
iso_3166_1: string,
name: string
},
subscription:
{
subscription_id: int,
payment_mode: string,
last_price: float,
subscription_date: datetime,
expire_date: datetime,
paid: int,
last_payment_date: datetime
},
bank_accounts:
[
{
bank_account_id: int,
name: string,
value: string
}, (...)
],
eac_codes:
[
{
eac_id: int,
code: string,
description: string
}, (...)
],
copies:
[
{
document_type_id: int,
copies: int
}, (...)
]
}

Lista de erros possíveis

Sempre que existir um erro no preenchimento dos campos, será devolvido via JSON o objeto com os erros indexado pela ordem dos campos.
As mensagens de erro, são devolvidas sob a forma de códigos, e para perceber quais os erros disponíveis e como interpretar as mensagens recebidas, consulte esta ligação.

<div class="
