# List All

Returns a list of invoices.

Endpoint: GET /invoices.json
Version: 2.0.0
Security: apiKeyAuth

## Query parameters:

  - `api_key` (string, required)
    Your API Key.
    Example: "YOUR_API_KEY"

  - `Query Parameters` (object)
    Click to expand options.

## Response 200 fields (application/json):

  - `invoices` (array)

  - `invoices.id` (integer)
    Example: 541793

  - `invoices.status` (string)
    Example: "final"

  - `invoices.archived` (boolean)
    Example: true

  - `invoices.type` (string)
    Example: "Invoice"

  - `invoices.sequence_number` (string)
    Example: "A/28"

  - `invoices.inverted_sequence_number` (string)
    Example: "A/28"

  - `invoices.atcud` (string)
    Example: "ABCD1234-28"

  - `invoices.date` (string)
    dd/mm/yyyy
    Example: "27/06/2017"

  - `invoices.due_date` (string)
    dd/mm/yyyy
    Example: "27/06/2017"

  - `invoices.reference` (string)
    Example: "fb30"

  - `invoices.observations` (string)
    Example: "foo"

  - `invoices.retention` (string)
    Example: "foo"

  - `invoices.permalink` (string)
    Example: "https://www.app.invoicexpress.com/documents/541793e1ab2ebd5c06def40c346ffbe0ff2b463eb1c0f0"

  - `invoices.saft_hash` (string)
    Example: "Tdik"

  - `invoices.sum` (number)
    Example: 1

  - `invoices.discount` (number)

  - `invoices.before_taxes` (number)
    Example: 1

  - `invoices.taxes` (number)
    Example: 0.07

  - `invoices.total` (number)
    Example: 1.07

  - `invoices.currency` (string)
    Example: "Euro"

  - `invoices.sequence_id` (string)
    Example: "12345"

  - `invoices.tax_exemption` (string)
    Example: "M01"

  - `invoices.client` (object)

  - `invoices.client.name` (string)
    Example: "John"

  - `invoices.client.country` (string)
    Example: "Portugal"

  - `invoices.items` (array)

  - `invoices.items.description` (string)
    Example: "foo"

  - `invoices.items.unit_price` (string)
    Example: "1.0"

  - `invoices.items.unit` (string)
    Example: "foo"

  - `invoices.items.quantity` (string)
    Example: "1.0"

  - `invoices.items.subtotal` (number)
    Example: 1

  - `invoices.items.tax_amount` (number)
    Example: 0.07

  - `invoices.items.discount_amount` (number)

  - `invoices.items.tax` (object)

  - `invoices.items.tax.value` (number)
    Example: 7

  - `pagination` (object)

  - `pagination.total_entries` (integer)
    Example: 50

  - `pagination.per_page` (integer)
    Example: 20

  - `pagination.current_page` (integer)
    Example: 1

  - `pagination.total_pages` (integer)
    Example: 3

## Response 401 fields (application/json):

  - `errors` (object)

  - `errors.error` (string)
    Example: "Invalid API key"


