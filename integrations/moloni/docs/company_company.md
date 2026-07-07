<!-- Source: https://www.moloni.pt/dev/company/company/ — fetched 2026-07-07, extracted verbatim from raw HTML (raw copy in docs/raw/company_company.html) -->

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

Moloni API / Endpoints / Company / Company

# Company | Company

## Devolve uma listagem de todas as empresas a que a conta do utilizador tem acesso, e o detalhe de cada uma dela.
Como seria de esperar, n&atilde;o &eacute; poss&iacute;vel inserir empresas atrav&eacute;s da API.

freeSlug

Verifica se um slug est&aacute; dispon&iacute;vel.
Este m&eacute;todo n&atilde;o requer autentica&ccedil;&atilde;o da parte da API , podendo ser chamado sem token de acesso.

getAll

Devolve todas as empresas a que o utilizador tem acesso.

getOne

Devolve os detalhe de uma empresa. O contexto do pedido &eacute; sempre com base no utilizador que est&aacute; logado na API.

<div class="
