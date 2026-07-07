<!-- Source: https://www.moloni.pt/dev/documents/invoices/getall/ — fetched 2026-07-07, extracted verbatim from raw HTML (raw copy in docs/raw/documents_invoices_getall.html) -->

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

Moloni API / Endpoints / Documents / Invoices / getAll

# getAll

Disponível na versão: 1.0+

Devolve as faturas de fornecedor da empresa. Se forem definidas opções de pesquisa, são devolvidos os documentos que as cumpram.

Pedido

https://api.moloni.pt/v1/invoices/getAll/?access_token=[current_access_token]

Parâmetros

company_id int
Obrigatório

qty int
offset int
customer_id int
supplier_id int
salesman_id int
document_set_id int
number int
date date
expiration_date date
year int
your_reference string
our_reference string

Nota

- O parâmetro qty tem como default 50 e o offset 0, sendo que o máximo qty é 50;

- Campos de preenchimento facultativo, significa que podem ser uma string vazia ou zero, dependendo do respectivo tipo.

Resposta

[
{
document_id: int,
document_type_id: int,
document_set_id: int,
number: int,
date: datetime,
expiration_date: datetime|null,
maturity_date_id: int,
maturity_date_days: int,
maturity_date_name: int,
your_reference: string,
our_reference: string,
entity_number: string,
entity_name: string,
entity_vat: string,
entity_address: string,
gross_value: float,
comercial_discount_value: float,
financial_discount_value: float,
taxes_value: float,
deduction_value: float,
net_value: float,
status: int,
transport_code: string,
transport_code_set_by: int,
exchange_currency_id: int,
exchange_total_value: float,
exchange_rate: float,
exchange_currency: {
currency_id: int,
iso4217: string,
symbol: string
},
document_type: {
document_type_id: int,
saft_code: string
},
document_set: {
document_set_id: int,
name: string
}
},
(...)
]

Lista de erros possíveis

Sempre que existir um erro no preenchimento dos campos, será devolvido via JSON o objeto com os erros indexado pela ordem dos campos.
As mensagens de erro, são devolvidas sob a forma de códigos, e para perceber quais os erros disponíveis e como interpretar as mensagens recebidas, consulte esta ligação.

<div class="
