# Tests (not deployed)

These run the real `apps-script/Code.gs` in Node against an in-memory Google Sheet.

    node tests/trips.test.js          # Apps Script logic: schema, trips, automations, chatbot, auth
    node tests/gs-server.js &         # serves the same backend on :8799 for browser tests
    python3 tests/ui.py               # Playwright: the CRM page against that backend (restart gs-server first)

`tests/` and `apps-script/` are listed in `.vercelignore`, so neither is published to the site.
