# Gotham CRM worker

Back office for registrations from `register.html`. Cloudflare Worker + D1.

## Routes

| Route | Auth | Purpose |
| --- | --- | --- |
| `POST /api/register` | public | Save a registration (upsert by `ref`) |
| `POST /api/admin/login` | password | Returns a 12h bearer token |
| `GET /api/admin/list?status=&q=` | token | List registrations |
| `PATCH /api/admin/reg/:ref` | token | Update status / payment / notes |
| `DELETE /api/admin/reg/:ref` | token | Delete a row |
| `GET /api/admin/stats` | token | Counts + revenue |
| `GET /api/admin/export.csv` | token | CSV export |

## Deploy

```bash
cd workers
npm i -g wrangler            # once
wrangler login               # once

wrangler d1 create gotham-crm          # copy database_id into wrangler.toml
wrangler d1 execute gotham-crm --file=schema.sql

wrangler secret put ADMIN_PASSWORD     # back-office password
wrangler secret put TOKEN_SECRET       # long random string, e.g. openssl rand -hex 32

wrangler deploy
```

Then set the deployed URL in `register.html`:

```js
const CRM_API='https://gotham-crm.<your-subdomain>.workers.dev';
```

…and add that site's origin to `ALLOWED` in `crm.js` if it is not already listed.

## Smoke test

```bash
curl -X POST https://<worker>/api/register -H 'Content-Type: application/json' \
  -d '{"company":"Test Co","name":"Test","email":"t@t.co","phone":"+233...","item_id":"F1","qty":1,"unit_price":300,"total":300,"currency":"GHS"}'

TOKEN=$(curl -s -X POST https://<worker>/api/admin/login -H 'Content-Type: application/json' \
  -d '{"password":"<ADMIN_PASSWORD>"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')

curl -H "Authorization: Bearer $TOKEN" https://<worker>/api/admin/stats
```
