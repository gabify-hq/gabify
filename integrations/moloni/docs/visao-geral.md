<!-- Source: https://www.moloni.pt/dev/visao-geral/ — fetched 2026-07-07, extracted verbatim from raw HTML (raw copy in docs/raw/visao-geral.html) -->

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

Moloni API / Visão geral

# Visão geral

Tem uma ferramenta que gostaria de ligar ao Moloni e criar um infindável leque de possibilidades para os seus clientes?
As funcionalidades do Moloni podem ser extendidas e costumizadas à medida de cada negócio, por isso agora tem uma porta aberta à sua criatividade e necessidade.

Apresentamos de seguida o modelo de funcionamento da API, para que se sinta confortável com o Modus Operandis e possa tirar o máximo rendimento.

### Os passos para criar uma aplicação e interagir com a API são os seguintes

- Efetuar um registo no Moloni;

- Ativar a API e configurar uma Chave de Acesso como Developer;

- Criar um site ou aplicação1 que use o protocolo HTTP para se comunicar com o End-Point da API;

- Caso esteja a desenvolver um sistema de plug-ins para vários clientes usarem de forma individual, cada um desses clientes terá que ativar a API na sua conta, e ter Developer_Id e Redirect_URI individuais, e que deverá colocar nas configurações desse plug-in.

- Autenticar-se através do protocolo OAuth (2.0);

- Enviar pedidos para a API (Consulta, inserção, alteração e eliminação) via HTTP com o método POST para o end-point da API;

1 Sistema para aplicações mobile e desktop disponível brevemente.

### Os 2 primeiros passos, apenas tem que os realizar uma vez.

Depois de ter a sua conta como Developer ativa, a sua aplicação está apta a ser conetada à conta de qualquer utilizador do Moloni.

### Uma conta de developer pode aceder a vários clientes?

Sim. A sua conta de developer permite-lhe criar aplicações ou ferramentas para aceder às contas de vários clientes, tantos quantos instalarem ou ativarem a sua aplicação/ferramenta.

Essa aplicação têm de ter o seu Developer ID, que lhe é fornecido quando executa o passo 2 acima descrito.
Será responsável por comunicar com a API e pedir permissões para aceder à informação de quem a usar (Ou seja, os seus clientes).
Para saber mais informação sobre o processo de autenticação, consulte este link.

### URL do Serviço (End-point da Versão 1.0)

O URL para onde devem apontar os scripts de modo a estabelecer qualquer ligação com a API é, a porta de entrada para todo o tipo de pedidos, sejam eles de autenticação, consulta ou sumissão de dados.

https://api.moloni.pt/v1/

<div class="
