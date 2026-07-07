<!-- Source: https://www.moloni.pt/dev/entities/customers/getall/ — fetched 2026-07-07, extracted verbatim from raw HTML (raw copy in docs/raw/entities_customers_getall.html) -->

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

Moloni API / Endpoints / Entities / Customers / getAll

# getAll

Disponível na versão: 1.0+

Devolve todos os clientes de uma empresa.

Pedido

https://api.moloni.pt/v1/customers/getAll/?access_token=[current_access_token]

Parâmetros

company_id int
Obrigat&oacute;rio

qty int
offset int

Nota

- O parâmetro qty tem como default 50 e o offset 0, sendo que o máximo qty é 50;

- Campos de preenchimento facultativo, significa que podem ser uma string vazia ou zero, dependendo do respectivo tipo.

Resposta

[
{
customer_id: int,
number: string,
name: string,
vat: string,
address: string,
city: string,
zip_code: string,
country_id: int,
email: string,
website: string,
phone: string,
fax: string,
contact_name: string,
contact_email: string,
contact_phone: string,
notes: string,
salesman_id: int,
discount: float,
credit_limit: float,
maturity_date_id: int,
payment_day: int,
field_notes: string,
language_id: int,
payment_method_id: int,
delivery_method_id: int,
country:
{
country_id: int,
country: string,
iso_3166_1: string
},
language:
{
language_id: int,
code: string,
name: string
},
maturity_date:
{
maturity_date_id: int,
name: string,
days: int,
associated_discount: float
},
payment_method:
{
payment_method_id: int,
name: string
},
delivery_method:
{
delivery_method_id: int,
name: string
},
salesman:
{
salesman_id: int,
number: string,
name: string,
base_commission: float
},
alternate_addresses:
[
{
address_id: int,
designation: string,
code: string,
address: string,
city: string,
zip_code: string,
country_id: int,
email: string,
phone: string,
fax: string,
contact_name: string,
}, (...)
],
copies:
[
{
document_type_id: int,
copies: int
}, (...)
],
associated_taxes:
[
{
tax_id: int,
}, (...)
]
price_class:
{
price_class_id: int,
title: string,
}
},
(...)
]

Lista de erros possíveis

Sempre que existir um erro no preenchimento dos campos, será devolvido via JSON o objeto com os erros indexado pela ordem dos campos.
As mensagens de erro, são devolvidas sob a forma de códigos, e para perceber quais os erros disponíveis e como interpretar as mensagens recebidas, consulte esta ligação.

<div class="
