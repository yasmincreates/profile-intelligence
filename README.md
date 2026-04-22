# Profile Intelligence Service

A REST API that enriches names with demographic data (gender, age, nationality) using Genderize, Agify, and Nationalize APIs, backed by Neon PostgreSQL via Prisma.

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/profiles` | Create/enrich a profile by name |
| GET | `/api/profiles` | List profiles with filters, sorting, pagination |
| GET | `/api/profiles/search` | Natural language search |
| GET | `/api/profiles/:id` | Get profile by ID |
| DELETE | `/api/profiles/:id` | Delete profile |

---

### `POST /api/profiles`
Create a profile by name. Idempotent — submitting the same name twice returns the existing record.

**201 Created** (new) / **200 OK** (already exists)

---

### `GET /api/profiles`
List profiles with optional filtering, sorting, and pagination.

| Param | Type | Description |
|-------|------|-------------|
| `gender` | string | `male` / `female` |
| `age_group` | string | `child` / `teenager` / `adult` / `senior` |
| `country_id` | string | ISO code e.g. `NG`, `KE` |
| `min_age` | number | Minimum age (inclusive) |
| `max_age` | number | Maximum age (inclusive) |
| `min_gender_probability` | number | 0–1 |
| `min_country_probability` | number | 0–1 |
| `sort_by` | string | `age`, `created_at`, `gender_probability` |
| `order` | string | `asc` (default) or `desc` |
| `page` | number | Default: 1 |
| `limit` | number | Default: 10, max: 50 |

**Response:**
```json
{ "status": "success", "page": 1, "limit": 10, "total": 2035, "data": [...] }
```

---

### `GET /api/profiles/search`
Natural language query endpoint. Pass a plain-English demographic query via `q`.

```
GET /api/profiles/search?q=young males from nigeria
GET /api/profiles/search?q=adult females from kenya&page=2&limit=20
GET /api/profiles/search?q=teenagers above 17
GET /api/profiles/search?q=senior women in south africa
```

Supports same `page` and `limit` params as the list endpoint.

#### How the NL Parser Works

The parser is **rule-based keyword extraction** — no AI or ML involved. It scans the query for recognized terms and maps them to filter fields.

**Gender:**
- `male`, `males`, `man`, `men`, `boy`, `boys` → `gender: "male"`
- `female`, `females`, `woman`, `women`, `girl`, `girls` → `gender: "female"`
- `male and female`, `both` → no gender filter

**Age groups:**
- `child`, `children`, `kid`, `kids` → `age_group: "child"`
- `teenager`, `teen`, `teens`, `adolescent` → `age_group: "teenager"`
- `adult`, `adults` → `age_group: "adult"`
- `senior`, `elderly`, `elder`, `old` → `age_group: "senior"`

**Special age term:**
- `young` → `min_age: 16, max_age: 24` (not a stored age group)

**Age ranges:**
- `above N`, `over N`, `older than N`, `at least N` → `min_age: N`
- `below N`, `under N`, `younger than N`, `at most N` → `max_age: N`

**Country detection:**
- Triggered by `from`, `in`, or `of` followed by a country name
- Matches against a static map of 65 countries with aliases (e.g. `ivory coast` → `CI`, `dr congo` → `CD`, `uk` → `GB`, `usa` → `US`)

**Uninterpretable queries** → `400 { "status": "error", "message": "Unable to interpret query" }`

#### Parser Limitations

- No fuzzy/typo matching — country names must be spelled correctly
- No compound age ranges like "between 20 and 30" (use `min_age` + `max_age` query params on the list endpoint instead)
- Only one country per query
- `young` and explicit age group keywords are mutually exclusive — `young` takes precedence for min/max age
- Only countries present in the seed dataset (65 countries) are recognized

---

### `GET /api/profiles/:id`
Fetch a single profile by UUID. Returns `404` if not found.

---

### `DELETE /api/profiles/:id`
Delete a profile. Returns `204 No Content`, or `404` if not found.

---

## Error Responses

```json
{ "status": "error", "message": "<description>" }
```

| Status | Cause |
|--------|-------|
| 400 | Missing/empty name or uninterpretable NL query |
| 422 | Invalid param type |
| 404 | Profile not found |
| 502 | Upstream API returned invalid data |
| 500 | Internal server error |

---

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Framework:** Express 5
- **Database:** PostgreSQL via [Neon](https://neon.tech) (serverless)
- **ORM:** Prisma 7 with Neon adapter
- **External APIs:** Genderize, Agify, Nationalize
- **Deployment:** Vercel

---

## Local Development

```bash
npm install
cp .env.example .env   # add DATABASE_URL
npx prisma generate
npm run seed           # seed 2026 profiles
npm run dev            # start on http://localhost:3000
```
