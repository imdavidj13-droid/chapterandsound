# Cloud database audit verification

Validates that the application has no browser persistent storage; saved member data, community content and admin writes use Cloudflare D1 routes; public catalogue/review searches query D1; missing-book requests are persisted; CI enforces the cloud contract. This only validates repository code and disposable SQL migrations, not production runtime data.
