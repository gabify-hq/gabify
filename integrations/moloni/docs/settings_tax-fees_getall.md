<!-- Source: https://www.moloni.pt/dev/settings/tax-fees/getall/ — fetched 2026-07-07, extracted verbatim from raw HTML (raw copy in docs/raw/settings_tax-fees_getall.html) -->

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

Moloni API / Endpoints / Settings / Tax & Fees / getAll

# getAll

Disponível na versão: 1.0+

Devolve um array com as taxas e impostos dispon&iacute;veis na conta da empresa.

Pedido

https://api.moloni.pt/v1/taxes/getAll/?access_token=[current_access_token]

Parâmetros

company_id int
Obrigat&oacute;rio

country_id int
Facultativo

fiscal_zone string
Facultativo

value float
Facultativo

type int
Facultativo

active_by_default int
Facultativo

with_invisible int
Facultativo

Nota

- O parâmetro qty tem como default 50 e o offset 0, sendo que o máximo qty é 50;

- Campos de preenchimento facultativo, significa que podem ser uma string vazia ou zero, dependendo do respectivo tipo.

Resposta

[
{
tax_id: int,
name: string,
value: float,
type: int,
saft_type: int,
vat_type: string,
stamp_tax: string,
exemption_reason: string,
fiscal_zone: string,
active_by_default: int
}, (...)
]

Lista de erros possíveis

Sempre que existir um erro no preenchimento dos campos, será devolvido via JSON o objeto com os erros indexado pela ordem dos campos.
As mensagens de erro, são devolvidas sob a forma de códigos, e para perceber quais os erros disponíveis e como interpretar as mensagens recebidas, consulte esta ligação.

<div class="
