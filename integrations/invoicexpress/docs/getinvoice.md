# Get Invoice

Endpoint: GET /{invoices-type}/{document-id}.json
Version: 2.0.0
Security: apiKeyAuth

## Path parameters:

  - `document-id` (integer, required)
    The ID of the document.
    Example: 1050

  - `invoices-type` (string, required)
    The type of the invoice document.
    Enum: "invoices", "invoice_receipts", "simplified_invoices", "credit_notes", "debit_notes"

## Query parameters:

  - `api_key` (string, required)
    Your API Key.
    Example: "YOUR_API_KEY"

## Response 200 fields (application/json):

  - `invoice` (object)

  - `invoice.id` (integer)
    Example: 2137287

  - `invoice.status` (string)
    Example: "final"

  - `invoice.archived` (boolean)

  - `invoice.type` (string)
    Example: "Invoice"

  - `invoice.sequence_number` (string)
    Example: "6/G"

  - `invoice.inverted_sequence_number` (string)
    Example: "G/6"

  - `invoice.atcud` (string)
    Example: "ABCD1234-6"

  - `invoice.sequence_id` (string)
    Example: "12345"

  - `invoice.tax_exemption` (string)
    Example: "M01"

  - `invoice.date` (string)
    Example: "04/08/2016"

  - `invoice.due_date` (string)
    Example: "19/08/2016"

  - `invoice.reference` (string)
    Example: "ref123"

  - `invoice.observations` (string)
    Example: "Observations"

  - `invoice.retention` (string)
    Example: "0"

  - `invoice.permalink` (string)
    Example: "https://www.app.invoicexpress.com/documents/..."

  - `invoice.saft_hash` (string)
    Example: "J4ay"

  - `invoice.sum` (number)
    Example: 24.39

  - `invoice.discount` (number)

  - `invoice.before_taxes` (number)
    Example: 24.39

  - `invoice.taxes` (number)
    Example: 5.61

  - `invoice.total` (number)
    Example: 30

  - `invoice.currency` (string)
    Example: "Euro"

  - `invoice.client` (object)

  - `invoice.client.name` (string)
    Example: "John Doe"

  - `invoice.client.code` (string)
    Example: "C1"

  - `invoice.client.country` (string)
    Example: "Portugal"

  - `invoice.client.email` (string)
    Example: "john@example.com"

  - `invoice.items` (array)

  - `invoice.items.description` (string)
    Example: "Big Product"

  - `invoice.items.unit_price` (number)
    Example: 100

  - `invoice.items.quantity` (number)
    Example: 1

  - `invoice.items.unit` (string)
    Example: "un"

  - `invoice.items.tax` (object)

  - `invoice.items.tax.value` (number)
    Example: 23

  - `invoice.mb_reference` (object)

  - `invoice.mb_reference.entity` (string)
    Example: "10611"

## Response 401 fields (application/json):

  - `errors` (object)

  - `errors.error` (string)
    Example: "Invalid API key"


## Response 404 fields
