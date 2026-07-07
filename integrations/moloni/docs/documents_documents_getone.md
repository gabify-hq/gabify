<!-- Source: https://www.moloni.pt/dev/documents/documents/getone/ — fetched 2026-07-07, extracted verbatim from raw HTML (raw copy in docs/raw/documents_documents_getone.html) -->

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

Moloni API / Endpoints / Documents / Documents / getOne

# getOne

Disponível na versão: 1.0+

Devolve os dados do documento pedido, respeitando os par&acirc;metros de pesquisa. No caso dos par&acirc;metros de pesquisa corresponderem a mais do que um documento, apenas o primeiro a ser encontrado ser&aacute; devolvido.

Dependendo se foi definido um vendedor ou n&atilde;o, a estrutura salesman poder&aacute; n&atilde;o existir.

Tamb&eacute;m dependendo se foi definido uma convers&atilde;o monet&aacute;ria, a estrutura exchange_currency poder&aacute; n&atilde;o existir.

Alguns tipos de documento n&atilde;o t&ecirc;m todos os conjuntos de dados. &Eacute; necess&aacute;rio ter algum cuidados com os conjuntos products, associated_documents e payments, que poder&atilde;o estar vazios.

Dentro de cada elemento de products, poder&aacute; n&atilde;o existir a estrutura supplier. De igual modo, o conjunto taxes poder&aacute; estar vazio (caso em que o campo exemption_reason do elemento de products correspondente estar&aacute; for&ccedil;osamente preenchido).

Pedido

https://api.moloni.pt/v1/documents/getOne/?access_token=[current_access_token]

Parâmetros

company_id int
Obrigat&oacute;rio

document_id int
customer_id int
supplier_id int
salesman_id int
document_set_id int
number int
date int
expiration_date int
year int
your_reference int
our_reference int

Nota

- O parâmetro qty tem como default 50 e o offset 0, sendo que o máximo qty é 50;

- Campos de preenchimento facultativo, significa que podem ser uma string vazia ou zero, dependendo do respectivo tipo.

Resposta

{
document_id: int,
company_id: int,
document_type_id: int,
customer_id: int,
supplier_id: int,
salesman_id: int,
document_set_id: int,
number: int,
date: datetime,
expiration_date: datetime|null,
year: int,
your_reference: string,
our_reference: string,
entity_number: string,
entity_name: string,
entity_vat: string,
entity_address: string,
entity_city: string,
entity_zip_code: string,
entity_country: string,
alternate_address_id: int,
attached_file: string,
notes: string,
salesman_commission: float,
deduction_id: int,
deduction_percentage: float,
deduction_name: string,
special_discount: float,
financial_discount: float,
gross_value: float,
comercial_discount_value: float,
financial_discount_value: float,
taxes_value: float,
deduction_value: float,
net_value: float,
reconciled_value: float,
delivery_method_id: int,
delivery_method_name: string,
vehicle_id: int,
vehicle_name: string,
vehicle_number_plate: string,
delivery_datetime: datetime|null,
delivery_departure_address: string,
delivery_departure_city: string,
delivery_departure_zip_code: string,
delivery_departure_country: int,
delivery_destination_address: string,
delivery_destination_city: string,
delivery_destination_zip_code: string,
delivery_destination_country: int,
related_documents_notes: string,
status: int,
transport_code: string,
transport_code_set_by: int,
rsa_hash: string,
hash_control: int,
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
},
salesman: {
salesman_id: int,
number: string,
name: string,
vat: string
},
products: [
{
ean: string,
order: int,
product_id: int,
category_id: int,
reference: string,
name: string,
summary: string,
price: float,
unit_id: int,
unit_name: string,
unit_short_name: string,
discount: float,
qty: int,
exemption_reason: string,
supplier: {
supplier_id: int,
number: string,
name: string,
vat:string
},
taxes: [
{
tax_id: int,
type: int,
saft_type: int,
vat_type: string,
stamp_tax: string,
name: string,
value: float,
fiscal_zone: string,
order: int,
cumulative: int,
incidence_value: float,
total_value: float
},
(...)
]
},
(...)
],
associated_documents: [
{
associated_id: int,
value: float
},
(...)
],
payments: [
{
payment_method_id: int,
payment_method_name: string,
date: datetime,
value: float,
notes: string
},
(...)
]
}

Lista de erros possíveis

Sempre que existir um erro no preenchimento dos campos, será devolvido via JSON o objeto com os erros indexado pela ordem dos campos.
As mensagens de erro, são devolvidas sob a forma de códigos, e para perceber quais os erros disponíveis e como interpretar as mensagens recebidas, consulte esta ligação.

<div class="
