<!-- Source: https://www.moloni.pt/dev/settings/tax-fees/ — fetched 2026-07-07, extracted verbatim from raw HTML (raw copy in docs/raw/settings_tax-fees.html) -->

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

Moloni API / Endpoints / Settings / Tax & Fees

# Settings | Tax & Fees

## Administrar as taxas e impostos que a empresa pode aplicar nos seus documentos.

getAll

Devolve um array com as taxas e impostos dispon&iacute;veis na conta da empresa.

insert

Inserir uma nova taxa ou imposto.
O campo type aceita um de 3 valores e t&ecirc;m o seguinte significado:

1: A taxa &eacute; uma percentagem (Ex.: IVA);
2: A taxa &eacute; um valor monet&aacute;rio fixo, independentemente do artig...

update

Edita uma taxa ou imposto.
O campo type aceita um de 3 valores e t&ecirc;m o seguinte significado:

1: A taxa &eacute; uma percentagem (Ex.: IVA);
2: A taxa &eacute; um valor monet&aacute;rio fixo, independentemente do artigo ou se...

delete

Elimina uma taxa ou imposto.

<div class="
