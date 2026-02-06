# demo-3

A product-focused search app that retrieves curated 3D-style image matches from the internet (via Wikimedia Commons) and shows the top 3–4 results.

## Run locally

```bash
node server.js
```

Then open <http://localhost:8000>.

## API

- `GET /api/search-3d?q=<product>&limit=4`
- Returns curated best matches (3–4 items), ranked by relevance and 3D-style quality signals.
