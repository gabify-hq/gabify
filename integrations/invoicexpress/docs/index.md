# InvoiceXpress API

Endpoints for managing Accounts, Invoices, Estimates, and organization data in InvoiceXpress. <br><h2>Welcome to our API in JSON</h2> Hello there! Welcome to the world of InvoiceXpress API! This world is inhabitated by creatures we call Endpoints.<p><p> People and Endpoints live together by supporting each other. Some people play with Endpoints, some work with them.<p> If you’re reading this, let me guess, you need to issue invoices but don’t want to lose focus from building a great solution and writing amazing code.<p> Did we cover your scenario? Ok, great. Let’s do this.<p> <h3>Quick Start</h3> <ol><li>[Sign up FREE for 30 days](https://web.invoicexpress.com/signup)</li><li>[Get your API key](https://web.invoicexpress.com/users/api_key)</li><li>[Create an Invoice](#tag/Invoices)</li></ol>
## Documentation

Reference tables for Portuguese VAT (IVA) exemptions, payment mechanism codes used for partial payments, and accepted countries when creating a client or an account.

<details>
<summary>Authentication</summary>


In order to authenticate a user through our API, an API key must be used. All API endpoints are available via HTTPS. HTTP access is denied. Each API key authenticates a user inside an account, and it's composed by arbitrary characters.

This key must be passed on the query string in each HTTPS request to authenticate the user. Although all endpoints are accessed through HTTPS, please keep this token as secure as possible in order to avoid third party's to access your InvoiceXpress data.

We strongly recommend you re-generate your API Key from time to time.

**Example:**

`https://ACCOUNT_NAME.app.invoicexpress.com/invoices.json?api_key=API_KEY`

You can find your ACCOUNT_NAME and API_KEY here: [https://www.app.invoicexpress.com/users/api](https://www.app.invoicexpress.com/users/api)

On POST and PUT requests do not forget to specify on the Header:

`Content-Type: application/json`


</details>

<details>
<summary>IVA exemption codes</summary>


| Code | Description on the Invoice | Where does it apply? |
| --- | --- | --- |
| M01 | Artigo 16.°, n.° 6 do CIVA | Artigo 16.°, n.° 6, alíneas a) a d) do CIVA |
| M02 | Artigo 6.° do Decreto-Lei n.° 198/90, de 19 de junho | Artigo 6.° do Decreto-Lei n.° 198/90, de 19 de junho |
| M04 | Isento artigo 13.° do CIVA | Artigo 13.° do CIVA |
| M05 | Isento artigo 14.° do CIVA | Artigo 14.° do CIVA |
| M06 | Isento artigo 15.° do CIVA | Artigo 15.° do CIVA |
| M07 | Isento artigo 9.° do CIVA | Artigo 9.° do CIVA |
| M09 | IVA – não confere direito a dedução | Artigo 62.° alínea b) do CIVA |
| M10 | IVA – regime de isenção | Artigo 57.° do CIVA |
| M11 | Regime particular do tabaco | Decreto-Lei n.° 346/85, de 23 de agosto |
| M12 | Regime da margem de lucro – Agências de viagens | Decreto-Lei n.° 221/85, de 3 de julho |
| M13 | Regime da margem de lucro – Bens em segunda mão | Decreto-Lei n.° 199/96, de 18 de outubro |
| M14 | Regime da margem de lucro – Objetos de arte | Decreto-Lei n.° 199/96, de 18 de outubro |
| M15 | Regime da margem de lucro – Objetos de coleção e antiguidades | Decreto-Lei n.° 199/96, de 18 de outubro |
| M16 | Isento artigo 14.° do RITI | Artigo 14.° do RITI |
| M19 | Outras isenções | Isenções temporárias determinadas em diploma próprio |
| M20 | IVA – regime forfetário | Artigo 59.°-D n.°2 do CIVA |
| M21 | IVA – não confere direito à dedução (ou expressão similar) | Artigo 72.° n.° 4 do CIVA |
| M25 | Mercadorias à consignação | Artigo 38.° n.° 1 alínea a) |
| M30 | IVA – autoliquidação | Artigo 2.° n.° 1 alínea i) do CIVA |
| M31 | IVA – autoliquidação | Artigo 2.° n.° 1 alínea j) do CIVA |
| M32 | IVA – autoliquidação | Artigo 2.° n.° 1 alínea I) do CIVA |
| M33 | IVA – autoliquidação | Artigo 2.° n.° 1 alínea m) do CIVA |
| M40 | IVA – autoliquidação | Artigo 6.° n.° 6 alínea a) do CIVA, a contrário |
| M41 | IVA – autoliquidação | Artigo 8.° n.° 3 do RITI |
| M42 | IVA – autoliquidação | Decreto-Lei n.° 21/2007, de 29 de janeiro |
| M43 | IVA – autoliquidação | Decreto-Lei n.° 362/99, de 16 de setembro |
| M44 | IVA - Regras específicas - artigo 6.º | Artigo 6.º do CIVA – Regras específicas. A utilizar nas operações que não sejam localizadas em Portugal por força das regras de exceção constantes dos números 7 e seguintes do artigo 6.º do Código do IVA |
| M45 | IVA - Regime transfronteiriço de isenção | Artigo 58.º-A do CIVA. A utilizar nas operações localizadas noutro Estado Membro da União Europeia e que ali fiquem isentas de IVA, em virtude de o transmitente dos bens ou prestador dos serviços ter aderido ao Regime Transfronteiriço de isenção relativamente às operações que realize nesse Estado Membro. Sem prejuízo do disposto no Ofício-Circulado n.º 25 065, de 08/04/2025, por uma questão de melhor identificação e separação destas operações, deve ser utilizada a menção "IVA – regime transfronteiriço de isenção". |
| M46 | IVA - e-TaxFree | Decreto-lei n.º 19/2017, de 14 de fevereiro. A utilizar pelo vendedor na emissão de faturas relativas a operações em que tenha aplicado a isenção na transmissão de bens a serem transportados na bagagem pessoal de viajantes sem domicílio ou estabelecimento na União Europeia, nos termos do referido decreto-lei. |
| M99 | Não sujeito ou não tributado | Outras situações de não liquidação do imposto (Exemplos: artigo 2.°, n.° 2 ; artigo 3.°, n.°s 4, 6 e 7; artigo 4.°, n.° 5, todos do CIVA) |


</details>

<details>
<summary>Payment mechanisms</summary>


This list shows the possible values for the payment mechanism when doing a partial payment:

- **CC**: Credit card
- **CD**: Debit card
- **CH**: Bank check
- **CO**: Check or voucher
- **CS**: Current account balance compensation
- **DE**: e-Cash
- **LC**: Commercial paper
- **MB**: Multibanco payment references
- **NU**: Cash
- **OU**: Other methods not mentioned here
- **PR**: Exchange of properties
- **TB**: Bank transfer or authorized direct debit
- **TR**: Restaurant ticket


</details>

<details>
<summary>Country list</summary>


This list shows the countries accepted when creating a client or an account:
- Portugal
- Ireland
- UK
- Canada
- United States
- Afghanistan
- Albania
- Algeria
- American Samoa
- Andorra
- Angola
- Anguilla
- Antigua and Barbuda
- Argentina
- Armenia
- Aruba
- Australia
- Austria
- Azerbaijan
- Bahamas
- Bahrain
- Bangladesh
- Barbados
- Belarus
- Belgium
- Belize
- Benin
- Bermuda
- Bhutan
- Bolivia
- Bosnia-Herzegovina
- Botswana
- Brazil
- British Indian Ocean Territory
- Brunei
- Bulgaria
- Burkina Faso
- Burma
- Burundi
- Cambodia
- Cameroon
- Canton and Enderbury Islands
- Cape Verde
- Cayman Islands
- Central African Republic
- Chad
- Chile
- China
- Christmas Island
- Cocos (Keeling) Islands
- Colombia
- Comoros
- Congo
- Congo, Democratic Republic
- Cook Islands
- Costa Rica
- Côte d’Ivoire
- Croatia
- Cuba
- Curaçao
- Cyprus
- Czech Republic
- Denmark
- Djibouti
- Dominica
- Dominican Republic
- Dronning Maud Land
- East Timor
- Ecuador
- Egypt
- El Salvador
- Equatorial Guinea
- Eritrea
- Estonia
- Ethiopia
- Faeroe Islands (Føroyar)
- Falkland Islands
- Fiji
- Finland
- France
- French Guiana
- French Polynesia
- Gabon
- Gambia
- Georgia
- Germany
- Ghana
- Gibraltar
- Great Britain
- Greece
- Greenland
- Grenada
- Guadeloupe
- Guam
- Guatemala
- Guernsey
- Guinea-Bissau
- Guinea
- Guyana
- Haiti
- Heard and McDonald Islands
- Honduras
- Hong Kong
- Hungary
- Iceland
- India
- Indonesia
- International Monetary Fund
- Iran
- Iraq
- Isle of Man
- Israel
- Italy
- Ivory Coast
- Jamaica
- Japan
- Jersey
- Johnston Island
- Jordan
- Kampuchea
- Kazakhstan
- Kenya
- Kiribati
- Korea, North
- Korea, South
- Kuwait
- Kyrgyzstan
- Laos
- Latvia
- Lebanon
- Lesotho
- Liberia
- Libya
- Liechtenstein
- Lithuania
- Luxembourg
- Macau
- Macedonia (Former Yug. Rep.)
- Madagascar
- Malawi
- Malaysia
- Maldives
- Mali
- Malta
- Marshall Islands
- Martinique
- Mauritania
- Mauritius
- Mayotte
- Micronesia
- Midway Islands
- Mexico
- Moldova
- Monaco
- Mongolia
- Montenegro
- Montserrat
- Morocco
- Mozambique
- Myanmar
- Nauru
- Namibia
- Nepal
- Netherlands Antilles
- Netherlands
- New Caledonia
- New Zealand
- Nicaragua
- Niger
- Nigeria
- Niue
- Norfolk Island
- Northern Mariana Islands
- Norway
- Oman
- Pakistan
- Palau
- Palestine
- Panama
- Papua New Guinea
- Paraguay
- Peru
- Philippines
- Pitcairn Island
- Poland
- Puerto Rico
- Qatar
- Reunion
- Romania
- Russia
- Rwanda
- Samoa (Western)
- Samoa (America)
- San Marino
- São Tomé and Príncipe
- Saudi Arabia
- Sénégal
- Serbia
- Seychelles
- Sierra Leone
- Singapore
- Slovakia
- Slovenia
- Solomon Islands
- Somalia
- South Africa
- Spain
- Sri Lanka
- St. Helena
- St. Kitts and Nevis
- St. Lucia
- St. Vincent and the Grenadines
- Sudan
- Suriname
- Svalbard and Jan Mayen Islands
- Swaziland
- Sweden
- Switzerland
- Syria
- Tahiti
- Taiwan
- Tajikistan
- Tanzania
- Thailand
- Timor-Leste
- Togo
- Trinidad and Tobago
- Tunisia
- Turkey
- Turkmenistan
- Turks and Caicos Islands
- Tuvalu
- Uganda
- Ukraine
- United Arab Emirates
- Upper Volta
- Uruguay
- Uzbekistan
- Vanuatu
- Vatican
- Venezuela
- Vietnam
- Virgin Islands
- Wake Island
- Wallis and Futuna Islands
- Western Sahara
- Western Samoa
- Yemen
- Zaïre
- Zambia
- Zimbabwe


</details>

<details>
<summary>Taxes country codes</summary>


| Country | Code |
| --- | --- |
| Portugal – Continental | PT |
| Portugal – Açores | PT-AC |
| Portugal – Madeira | PT-MA |
| Afghanistan | AF |
| Åland Islands | AX |
| Albania | AL |
| Algeria | DZ |
| American Samoa | AS |
| Andorra | AD |
| Angola | AO |
| Anguilla | AI |
| Antarctica | AQ |
| Antigua and Barbuda | AG |
| Argentina | AR |
| Armenia | AM |
| Aruba | AW |
| Australia | AU |
| Austria | AT |
| Azerbaijan | AZ |
| Bahamas | BS |
| Bahrain | BH |
| Bangladesh | BD |
| Barbados | BB |
| Belarus | BY |
| Belgium | BE |
| Belize | BZ |
| Benin | BJ |
| Bermuda | BM |
| Bhutan | BT |
| Bolivia | BO |
| Bosnia-Herzegovina | BA |
| Botswana | BW |
| Bouvet Island | BV |
| Brazil | BR |
| British Indian Ocean Territory | IO |
| Brunei | BN |
| Bulgaria | BG |
| Burkina Faso | BF |
| Burma | MM |
| Burundi | BI |
| Cambodia | KH |
| Cameroon | CM |
| Canada | CA |
| Canton and Enderbury Islands | KI |
| Cape Verde | CV |
| Cayman Islands | KY |
| Central African Republic | CF |
| Chad | TD |
| Chile | CL |
| China | CN |
| Christmas Island | CX |
| Cocos (Keeling) Islands | CC |
| Colombia | CO |
| Comoros | KM |
| Congo | CG |
| Congo, Democratic Republic | CD |
| Cook Islands | CK |
| Costa Rica | CR |
| Côte d’Ivoire | CI |
| Croatia | HR |
| Cuba | CU |
| Cyprus | CY |
| Czech Republic | CZ |
| Denmark | DK |
| Djibouti | DJ |
| Dominica | DM |
| Dominican Republic | DO |
| Dronning Maud Land | AQ |
| East Timor | TL |
| Ecuador | EC |
| Egypt | EG |
| El Salvador | SV |
| Equatorial Guinea | GQ |
| Eritrea | ER |
| Estonia | EE |
| Ethiopia | ET |
| Falkland Islands | FK |
| Faroe Islands | FO |
| Fiji | FJ |
| Finland | FI |
| France | FR |
| French Guiana | GF |
| French Polynesia | PF |
| French Southern Territories | TF |
| Gabon | GA |
| Gambia | GM |
| Georgia | GE |
| Germany | DE |
| Ghana | GH |
| Gibraltar | GI |
| Greece | GR |
| Greenland | GL |
| Grenada | GD |
| Guadeloupe | GP |
| Guam | GU |
| Guatemala | GT |
| Guernsey | GG |
| Guinea | GN |
| Guinea-Bissau | GW |
| Guyana | GY |
| Haiti | HT |
| Heard and McDonald Islands | HM |
| Holy See (Vatican City State) | VA |
| Honduras | HN |
| Hong Kong | HK |
| Hungary | HU |
| Iceland | IS |
| India | IN |
| Indonesia | ID |
| Iran | IR |
| Iraq | IQ |
| Ireland | IE |
| Isle of Man | IM |
| Israel | IL |
| Italy | IT |
| Ivory Coast | CI |
| Jamaica | JM |
| Japan | JP |
| Jersey | JE |
| Johnston Island | UM |
| Jordan | JO |
| Kampuchea | KH |
| Kazakhstan | KZ |
| Kenya | KE |
| Kiribati | KI |
| Korea, North | KP |
| Korea, South | KR |
| Kuwait | KW |
| Kyrgyzstan | KG |
| Laos | LA |
| Latvia | LV |
| Lebanon | LB |
| Lesotho | LS |
| Liberia | LR |
| Libya | LY |
| Liechtenstein | LI |
| Lithuania | LT |
| Luxembourg | LU |
| Macau | MO |
| Macedonia | MK |
| Madagascar | MG |
| Malawi | MW |
| Malaysia | MY |
| Maldives | MV |
| Mali | ML |
| Malta | MT |
| Marshall Islands | MH |
| Martinique | MQ |
| Mauritania | MR |
| Mauritius | MU |
| Mayotte | YT |
| Mexico | MX |
| Micronesia | FM |
| Midway Islands | UM |
| Moldova | MD |
| Monaco | MC |
| Mongolia | MN |
| Montenegro | ME |
| Montserrat | MS |
| Morocco | MA |
| Mozambique | MZ |
| Myanmar | MM |
| Namibia | NA |
| Nauru | NR |
| Nepal | NP |
| Netherlands | NL |
| Netherlands Antilles | AN |
| New Caledonia | NC |
| New Zealand | NZ |
| Nicaragua | NI |
| Niger | NE |
| Nigeria | NG |
| Niue | NU |
| Norfolk Island | NF |
| Northern Mariana Islands | MP |
| Norway | NO |
| Oman | OM |
| Pakistan | PK |
| Palau | PW |
| Palestine | PS |
| Panama | PA |
| Papua New Guinea | PG |
| Paraguay | PY |
| Peru | PE |
| Philippines | PH |
| Pitcairn Island | PN |
| Poland | PL |
| Puerto Rico | PR |
| Qatar | QA |
| Reunion | RE |
| Romania | RO |
| Russia | RU |
| Russian Federation | RU |
| Rwanda | RW |
| Saint Barthélemy | BL |
| St. Helena | SH |
| St. Kitts and Nevis | KN |
| St. Lucia | LC |
| Saint Martin | MF |
| Saint Pierre And Miquelon | PM |
| St. Vincent and the Grenadines | VC |
| Samoa (America) | AS |
| Samoa (Western) | WS |
| San Marino | SM |
| São Tomé and Príncipe | ST |
| Saudi Arabia | SA |
| Sénégal | SN |
| Serbia | RS |
| Seychelles | SC |
| Sierra Leone | SL |
| Singapore | SG |
| Slovakia | SK |
| Slovenia | SI |
| Solomon Islands | SB |
| Somalia | SO |
| South Africa | ZA |
| South Georgia And The South Sandwich Islands | GS |
| Spain | ES |
| Sri Lanka | LK |
| Sudan | SD |
| Suriname | SR |
| Svalbard and Jan Mayen Islands | SJ |
| Swaziland | SZ |
| Sweden | SE |
| Switzerland | CH |
| Syria | SY |
| Tahiti | PF |
| Taiwan | TW |
| Tajikistan | TJ |
| Tanzania | TZ |
| Thailand | TH |
| Timor-Leste | TL |
| Togo | TG |
| Tokelau | TK |
| Tonga | TO |
| Trinidad and Tobago | TT |
| Tunisia | TN |
| Turkey | TR |
| Turkmenistan | TM |
| Turks and Caicos Islands | TC |
| Tuvalu | TV |
| Uganda | UG |
| Ukraine | UA |
| United Arab Emirates | AE |
| United Kingdom | GB |
| Upper Volta | BF |
| United States | US |
| United States Minor Outlying Islands | UM |
| Uruguay | UY |
| Uzbekistan | UZ |
| Vanuatu | VU |
| Vatican | VA |
| Venezuela | VE |
| Vietnam | VN |
| Virgin Islands | VG |
| Virgin Islands, U.S. | VI |
| Wake Island | UM |
| Wallis and Futuna Islands | WF |
| Western Sahara | EH |
| Western Samoa | WS |
| Yemen | YE |
| Zaïre | CD |
| Zambia | ZM |
| Zimbabwe | ZW |


</details>

<details>
<summary>Currency codes</summary>


| Name | Symbol | Code |
| --- | --- | --- |
| Euro | € | EUR |
| Pound sterling | £ | GBP |
| Canadian dollar | C$ | CAD |
| U.S. dollar | $ | USD |
| Afghan afghani | ؋ | AFN |
| Albanian lek | L | ALL |
| Algerian dinar | د.ج | DZD |
| Angolan kwanza | Kz | AOA |
| Argentine peso | $ | ARS |
| Armenian dram | դր. | AMD |
| Aruban florin | ƒ | AWG |
| Australian dollar | A$ | AUD |
| Azerbaijani manat | ¤ | AZN |
| Bahamian dollar | $ | BSD |
| Bahraini dinar | ب.د | BHD |
| Bangladeshi taka | ¤ | BDT |
| Barbadian dollar | $ | BBD |
| Belarusian ruble | Br | BYR |
| Belize dollar | $ | BZD |
| Bermudian dollar | $ | BMD |
| Bhutanese ngultrum | ¤ | BTN |
| Bolivian boliviano | Bs. | BOB |
| Bosnia & Herzegovina mark | KM | BAM |
| Botswana pula | P | BWP |
| Brazilian real | R$ | BRL |
| Brunei dollar | $ | BND |
| Bulgarian lev | лв | BGN |
| Burundian franc | Fr | BIF |
| Cambodian riel | ¤ | KHR |
| Cape Verdean escudo | Esc | CVE |
| Cayman Islands dollar | $ | KYD |
| Central African CFA franc | Fr | XAF |
| CFP franc | Fr | XPF |
| Chilean peso | $ | CLP |
| Chinese yuan | ¥ | CNY |
| Colombian peso | $ | COP |
| Comorian franc | Fr | KMF |
| Congolese franc | Fr | CDF |
| Costa Rican colón | ₡ | CRC |
| Croatian kuna | kn | HRK |
| Cuban convertible peso | $ | CUC |
| Cuban peso | $ | CUP |
| Czech koruna | Kč | CZK |
| Danish krone | kr. | DKK |
| Djiboutian franc | Fr | DJF |
| Dominican peso | $ | DOP |
| East Caribbean dollar | $ | XCD |
| Egyptian pound | ج.م | EGP |
| Eritrean nakfa | Nfk | ERN |
| Estonian kroon | KR | EEK |
| Ethiopian birr | ¤ | ETB |
| Falkland Islands pound | £ | FKP |
| Fijian dollar | $ | FJD |
| Gambian dalasi | D | GMD |
| Georgian lari | ლ | GEL |
| Ghanaian cedi | ₵ | GHS |
| Gibraltar pound | £ | GIP |
| Guatemalan quetzal | Q | GTQ |
| Guinean franc | Fr | GNF |
| Guyanese dollar | $ | GYD |
| Haitian gourde | G | HTG |
| Honduran lempira | L | HNL |
| Hong Kong dollar | $ | HKD |
| Hungarian forint | Ft | HUF |
| Icelandic króna | kr | ISK |
| Indian rupee | Rs | INR |
| Indonesian rupiah | Rp | IDR |
| Iranian rial | ﷼ | IRR |
| Iraqi dinar | ع.د | IQD |
| Israeli new sheqel | ₪ | ILS |
| Jamaican dollar | $ | JMD |
| Japanese yen | ¥ | JPY |
| Jordanian dinar | د.ا | JOD |
| Kazakhstani tenge | 〒 | KZT |
| Kenyan shilling | Sh | KES |
| Kuwaiti dinar | د.ك | KWD |
| Kyrgyzstani som | ¤ | KGS |
| Lao kip | ₭ | LAK |
| Latvian lats | Ls | LVL |
| Lebanese pound | ل.ل | LBP |
| Lesotho loti | L | LSL |
| Liberian dollar | $ | LRD |
| Libyan dinar | ل.د | LYD |
| Lithuanian litas | Lt | LTL |
| Macanese pataca | P | MOP |
| Macedonian denar | ден | MKD |
| Malagasy ariary | ¤ | MGA |
| Malawian kwacha | MK | MWK |
| Malaysian ringgit | RM | MYR |
| Maldivian rufiyaa | Rf | MVR |
| Mauritanian ouguiya | UM | MRO |
| Mauritian rupee | ₨ | MUR |
| Mexican peso | $ | MXN |
| Moldovan leu | L | MDL |
| Mongolian tögrög | ₮ | MNT |
| Moroccan dirham | د.م. | MAD |
| Mozambican metical | MT | MZN |
| Myanma kyat | Ks | MMK |
| Namibian dollar | $ | NAD |
| Nepalese rupee | ₨ | NPR |
| Netherlands Antillean guilder | ƒ | ANG |
| New Taiwan dollar | $ | TWD |
| New Zealand dollar | $ | NZD |
| Nicaraguan córdoba | C$ | NIO |
| Nigerian naira | ₦ | NGN |
| North Korean won | ₩ | KPW |
| Norwegian krone | kr | NOK |
| Omani rial | ر.ع. | OMR |
| Pakistani rupee | ₨ | PKR |
| Papua New Guinean kina | K | PGK |
| Paraguayan guaraní | ₲ | PYG |
| Peruvian nuevo sol | S/ | PEN |
| Philippine peso | ₱ | PHP |
| Polish złoty | zł | PLN |
| Qatari riyal | ر.ق | QAR |
| Romanian leu | lei | RON |
| Russian ruble | ₽ | RUB |
| Rwandan franc | Fr | RWF |
| Saint Helena pound | £ | SHP |
| Samoan tālā | T | WST |
| São Tomé and Príncipe dobra | Db | STN |
| Saudi riyal | ر.س | SAR |
| Serbian dinar | дин. | RSD |
| Seychellois rupee | ₨ | SCR |
| Sierra Leonean leone | Le | SLL |
| Singapore dollar | $ | SGD |
| Solomon Islands dollar | $ | SBD |
| Somali shilling | Sh | SOS |
| South African rand | R | ZAR |
| South Korean won | ₩ | KRW |
| Sri Lankan rupee | Rs | LKR |
| Sudanese pound | ج.س. | SDG |
| Surinamese dollar | $ | SRD |
| Swazi lilangeni | L | SZL |
| Swedish krona | kr | SEK |
| Swiss franc | Fr | CHF |
| Syrian pound | ل.س. | SYP |
| Tajikistani somoni | ЅМ | TJS |
| Tanzanian shilling | Sh | TZS |
| Thai baht | ฿ | THB |
| Tongan paʻanga | T$ | TOP |
| Trinidad and Tobago dollar | $ | TTD |
| Tunisian dinar | د.ت | TND |
| Turkish lira | ₺ | TRY |
| Turkmenistan manat | m | TMT |
| Ugandan shilling | Sh | UGX |
| Ukrainian hryvnia | ₴ | UAH |
| United Arab Emirates dirham | د.إ | AED |
| Uruguayan peso | $ | UYU |
| Uzbekistani so'm | ¤ | UZS |
| Vanuatu vatu | Vt | VUV |
| Venezuelan bolívar | Bs. | VES |
| Vietnamese đồng | ₫ | VND |
| West African CFA franc | Fr | XOF |
| Yemeni rial | ﷼ | YER |
| Zambian kwacha | ZK | ZMW |
| Zimbabwean dollar | $ | ZWL |


</details>

<details>
<summary>Request limits</summary>


You can perform up to 780 requests per minute for each Account. If you exceed this limit, you'll get a 429 Too Many Requests response for subsequent requests.

We recommend you handle 429 responses so your integration retries requests automatically.


</details>




Version: 2.0.0

## Servers

Production Server
```
https://{account_name}.app.invoicexpress.com
```

Variables:
- `account_name`: Your account subdomain.
Default: "your-account"

## Security

### apiKeyAuth

Type: apiKey
In: query
Name: api_key

## Download OpenAPI description

[InvoiceXpress API](https://docs.invoicexpress.com/_bundle/index.yaml)

## Accounts

Create, update and get info about your account.

### Create Account

 - [POST /api/accounts/create.json](https://docs.invoicexpress.com/accounts/createaccount.md)

### Create for existing user

 - [POST /api/accounts/create_already_user.json](https://docs.invoicexpress.com/accounts/createaccountexisting.md)

### Get Account

 - [GET /api/accounts/{account-id}/get.json](https://docs.invoicexpress.com/accounts/getaccount.md)

### Update Account

 - [PUT /api/accounts/{account-id}/update.json](https://docs.invoicexpress.com/accounts/updateaccount.md)

### AT Communication

 - [POST /api/v3/accounts/at_communication.json](https://docs.invoicexpress.com/accounts/atcommunication.md)

## Invoices

Create invoices, invoice receipts, simplified invoices, vat moss invoices, credit notes & debit notes and send them to your clients.

### List All

 - [GET /invoices.json](https://docs.invoicexpress.com/invoices/listinvoices.md): Returns a list of invoices.

### Create Invoice

 - [POST /{invoices-type}.json](https://docs.invoicexpress.com/invoices/createinvoice.md): Creates a new invoice, simplified_invoice, invoice_receipt, credit_note or debit_note.



### Creating new clients or items along with the documents
This method also allows to create a new client and/or new items in the same request with the following behavior:
* If the client name does not exist, a new one is created.
* If items do not exist with the given names, new ones will be created.
* If item name already exists, the item is updated with the new values.

### Taxes
Regarding item taxes, if the tax name is not found, the default tax is applyed to that item. Portuguese accounts should also send the IVA exemption reason if the invoice contains exempt items (IVA 0%).

> Note: Simplified Invoices are only available in Portugal.

### Get Invoice

 - [GET /{invoices-type}/{document-id}.json](https://docs.invoicexpress.com/invoices/getinvoice.md)

### Update Invoice

 - [PUT /{invoices-type}/{document-id}.json](https://docs.invoicexpress.com/invoices/updateinvoice.md): Updates a new invoice, simplified_invoice, invoice_receipt, credit_note or debit_note.



### Creating new clients or items along with the invoice
This method also allows to create a new client and/or new items in the same request with the following behavior:
* If the client name does not exist, a new one is created.
* If items do not exist with the given names, new ones will be created.
* If item name already exists, the item is updated with the new values.

### Taxes
Regarding item taxes, if the tax name is not found, the default tax is applyed to that item. Portuguese accounts should also send the IVA exemption reason if the invoice contains exempt items (IVA 0%).

> Note: Simplified Invoices are only available in Portugal.

### Change Invoice State

 - [PUT /{invoices-type}/{document-id}/change-state.json](https://docs.invoicexpress.com/invoices/changeinvoicestate.md): Changes the state of invoice documents.

| From | To | State on Request Body | Notes |
| :--- | :--- | :--- | :--- |
| draft | final | finalized | All documents. |
| draft | settled | finalized | Only invoice_receipt. |
| draft | deleted | deleted | All documents. |
| final | canceled | canceled | All documents. |
| settled | canceled | canceled | Only invoice_receipt. |
| final | settled | settled | All documents. |
| settled | final | unsettled | Only credit_note and debit_note. |

### Send Invoice by Email

 - [PUT /{invoices-type}/{document-id}/email-document.json](https://docs.invoicexpress.com/invoices/sendinvoiceemail.md)

### Generate PDF

 - [GET /api/pdf/{document-id}.json](https://docs.invoicexpress.com/invoices/generatepdf.md)

### Get QR Code

 - [GET /api/qr_codes/{document-id}.json](https://docs.invoicexpress.com/invoices/getqrcode.md)

### Related Documents

 - [GET /document/{document-id}/related_documents.json](https://docs.invoicexpress.com/invoices/relateddocs.md)

### Generate Payment

 - [POST /documents/{document-id}/partial_payments.json](https://docs.invoicexpress.com/invoices/generatepayment.md)

### Cancel Payment

 - [PUT /receipts/{receipt-id}/change-state.json](https://docs.invoicexpress.com/invoices/cancelreceipt.md)

### Generate PDF

 - [GET /api/pdf/{document-id}.json](https://docs.invoicexpress.com/estimates/generatepdf.md)

### Generate PDF

 - [GET /api/pdf/{document-id}.json](https://docs.invoicexpress.com/guides/generatepdf.md)

### Get QR Code

 - [GET /api/qr_codes/{document-id}.json](https://docs.invoicexpress.com/guides/getqrcode.md)

## Estimates

Create quotes, proformas or fees notes and send them to your clients.

### Generate PDF

 - [GET /api/pdf/{document-id}.json](https://docs.invoicexpress.com/invoices/generatepdf.md)

### Create Estimate

 - [POST /{estimates-type}.json](https://docs.invoicexpress.com/estimates/createestimate.md): Creates a new quote, proforma or fees_note.

### Get Estimate

 - [GET /{estimates-type}/{document-id}.json](https://docs.invoicexpress.com/estimates/getestimate.md)

### Update Estimate

 - [PUT /{estimates-type}/{document-id}.json](https://docs.invoicexpress.com/estimates/updateestimate.md): Updates a quote, proforma or fees_note.

### Change Estimate State

 - [PUT /{estimates-type}/{document-id}/change-state.json](https://docs.invoicexpress.com/estimates/changeestimatestate.md): Changes the state of estimate documents (quotes, proformas, fees_notes).

| From | To | Event |
| :--- | :--- | :--- |
| Draft | final | finalized |
| Draft | deleted | deleted |
| final | Accepted | accept |
| final | refused | refuse |
| final | canceled | canceled |
| Accepted | refused | refuse |
| refused | Accepted | accept |
| Accepted | canceled | canceled |
| refused | canceled | canceled |

### Send Estimate by Email

 - [PUT /{estimates-type}/{document-id}/email-document.json](https://docs.invoicexpress.com/estimates/sendestimateemail.md)

### List All

 - [GET /estimates.json](https://docs.invoicexpress.com/estimates/listestimates.md): Returns a list of estimates (Quotes, Proformas, Fees Notes).

### Generate PDF

 - [GET /api/pdf/{document-id}.json](https://docs.invoicexpress.com/estimates/generatepdf.md)

### Generate PDF

 - [GET /api/pdf/{document-id}.json](https://docs.invoicexpress.com/guides/generatepdf.md)

## Guides

Create shippings, transports & devolutions and send them to your clients.

### Generate PDF

 - [GET /api/pdf/{document-id}.json](https://docs.invoicexpress.com/invoices/generatepdf.md)

### Get QR Code

 - [GET /api/qr_codes/{document-id}.json](https://docs.invoicexpress.com/invoices/getqrcode.md)

### Generate PDF

 - [GET /api/pdf/{document-id}.json](https://docs.invoicexpress.com/estimates/generatepdf.md)

### Create Guide

 - [POST /{guides-type}.json](https://docs.invoicexpress.com/guides/createguide.md): Creates a new shipping, transport or devolution.

### Get Guide

 - [GET /{guides-type}/{document-id}.json](https://docs.invoicexpress.com/guides/getguide.md)

### Update Guide

 - [PUT /{guides-type}/{document-id}.json](https://docs.invoicexpress.com/guides/updateguide.md): Updates a shipping, transport or devolution.

### Change Guide State

 - [PUT /{guides-type}/{document-id}/change-state.json](https://docs.invoicexpress.com/guides/changeguidestate.md): Changes the state of guide documents (shippings, transports, devolutions).

| From | To | Event |
| :--- | :--- | :--- |
| draft | final | finalized |
| draft | deleted | deleted |
| final | canceled | canceled |

### Send Guide by Email

 - [PUT /{guides-type}/{document-id}/email-document.json](https://docs.invoicexpress.com/guides/sendguideemail.md)

### Generate PDF

 - [GET /api/pdf/{document-id}.json](https://docs.invoicexpress.com/guides/generatepdf.md)

### Get QR Code

 - [GET /api/qr_codes/{document-id}.json](https://docs.invoicexpress.com/guides/getqrcode.md)

### List All

 - [GET /guides.json](https://docs.invoicexpress.com/guides/listguides.md): Returns a list of guides (Shippings, Transports and Devolutions).

## Sequences

A Sequence is used to group invoices in a sequential order.

### Register Sequence

 - [PUT /sequences/{sequence_id}/register.json](https://docs.invoicexpress.com/sequences/registersequence.md): Registers a document sequence with the Tax Authority (AT).

### List All Sequences

 - [GET /sequences.json](https://docs.invoicexpress.com/sequences/listsequences.md): Returns all your sequences.

### Create Sequence

 - [POST /sequences.json](https://docs.invoicexpress.com/sequences/createsequence.md): Creates and registers a new sequence. 
For portuguese accounts, it’s necessary to have AT credentials configured.

### Get Sequence

 - [GET /sequences/{sequence_id}.json](https://docs.invoicexpress.com/sequences/getsequence.md): Returns a specific sequence.

### Set Sequence as Default

 - [PUT /sequences/{sequence_id}/set_current.json](https://docs.invoicexpress.com/sequences/setsequencedefault.md): Sets a specific sequence as the default.

## Taxes

A Tax is applied to invoice items when creating invoices.

### List All Taxes

 - [GET /taxes.json](https://docs.invoicexpress.com/taxes/listtaxes.md): Returns all your taxes.

### Create Taxes

 - [POST /taxes.json](https://docs.invoicexpress.com/taxes/createtax.md): Creates a new tax.

### Get Taxes

 - [GET /taxes/{taxes_id}.json](https://docs.invoicexpress.com/taxes/gettax.md): Returns a specific tax.

### Update Taxes

 - [PUT /taxes/{taxes_id}.json](https://docs.invoicexpress.com/taxes/updatetax.md): Updates a tax.

### Delete Tax

 - [DELETE /taxes/{taxes_id}.json](https://docs.invoicexpress.com/taxes/deletetax.md): Deletes a tax.

## SAF-T

Export the Standard Audit File for Tax (SAF-T PT) required by the Portuguese Tax Authority.

### Export Saft

 - [GET /api/export_saft.json](https://docs.invoicexpress.com/saf-t/export_saft.md)

## Clients

A Client is an entity you send invoices to.

### List All Clients

 - [GET /clients.json](https://docs.invoicexpress.com/clients/listclients.md): Returns a list of all your clients.

### Create Client

 - [POST /clients.json](https://docs.invoicexpress.com/clients/createclient.md): Creates a new client.

### Get Client

 - [GET /clients/{client_id}.json](https://docs.invoicexpress.com/clients/getclient.md): Returns a specific client.

### Update Client

 - [PUT /clients/{client_id}.json](https://docs.invoicexpress.com/clients/updateclient.md): Updates a client.

### Find Client by Name

 - [GET /clients/find-by-name.json](https://docs.invoicexpress.com/clients/findclientbyname.md): Returns a specific client.

### Find Client by Code

 - [GET /clients/find-by-code.json](https://docs.invoicexpress.com/clients/findclientbycode.md): Returns a specific client.

### List Client Invoices

 - [POST /clients/{client_id}/invoices.json](https://docs.invoicexpress.com/clients/listclientinvoices.md): This method allows you to obtain the invoices for a specific client. You can filter the results by document status, type and if it’s archived or not.

## Items

An Item is the product or service you invoice.

### List All Items

 - [GET /items.json](https://docs.invoicexpress.com/items/listitems.md): Returns a list of all your items.

### Create Item

 - [POST /items.json](https://docs.invoicexpress.com/items/createitem.md): Creates a new item.

### Get Item

 - [GET /items/{item_id}.json](https://docs.invoicexpress.com/items/getitem.md): Returns a specific item.

### Update Item

 - [PUT /items/{item_id}.json](https://docs.invoicexpress.com/items/updateitem.md): Updates an item.

### Delete Item

 - [DELETE /items/{item_id}.json](https://docs.invoicexpress.com/items/deleteitem.md): Deletes an item.

## Treasury

Section dedicated to treasury movements.

### Get Client Balance

 - [GET /api/v3/clients/{client_id}/balance.json](https://docs.invoicexpress.com/treasury/getclientbalance.md): Returns the balance of a specific client.

### Update Initial Balance

 - [PUT /api/v3/clients/{client_id}/initial_balance.json](https://docs.invoicexpress.com/treasury/updateclientinitialbalance.md): Updates the initial balance of a specific client.

### Get Client Regularization

 - [GET /api/v3/clients/{client_id}/regularization.json](https://docs.invoicexpress.com/treasury/getclientregularizations.md): Returns a list of all your client’s regularization.

### Create Regularization

 - [POST /api/v3/clients/{client_id}/regularization.json](https://docs.invoicexpress.com/treasury/createclientregularization.md): Creates a new client’s regularization.

### Delete Regularization

 - [DELETE /api/v3/clients/{client_id}/regularization/{id}.json](https://docs.invoicexpress.com/treasury/deleteclientregularization.md): Deletes a client’s regularization.

### Create Treasury Movement

 - [POST /api/v3/clients/{client_id}/treasury_movements.json](https://docs.invoicexpress.com/treasury/createclienttreasurymovement.md): Creates a new client’s treasury movement.

### Delete Treasury Movement

 - [DELETE /api/v3/clients/{client_id}/treasury_movements/{id}.json](https://docs.invoicexpress.com/treasury/deleteclienttreasurymovement.md): Deletes a client’s treasury movement.

