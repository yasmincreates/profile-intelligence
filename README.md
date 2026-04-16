# Profile Intelligence Service

A REST API that accepts a name, enriches it using three public APIs (gender, age, nationality), persists the result, and exposes endpoints for retrieval and management.

---

## Live API

> Base URL: `https://your-app.vercel.app`

---

## Endpoints

### `POST /api/profiles`
Create a profile by name. Idempotent — submitting the same name twice returns the existing record.

```bash
curl -X POST https://your-app.vercel.app/api/profiles \
  -H "Content-Type: application/json" \
  -d '{"name": "ella"}'
```

**201 Created**
```json
{
  "status": "success",
  "data": {
    "id": "019d9450-403a-732f-afb6-9174c8cd71b1",
    "name": "ella",
    "gender": "female",
    "gender_probability": 0.99,
    "sample_size": 97517,
    "age": 53,
    "age_group": "adult",
    "country_id": "CM",
    "country_probability": 0.097,
    "created_at": "2026-04-16T03:23:00.562Z"
  }
}
```

---

### `GET /api/profiles`
List all profiles. Supports optional filters.

```bash
curl "https://your-app.vercel.app/api/profiles?gender=female&country_id=NG"
```

| Query param | Example |
|---|---|
| `gender` | `male` / `female` |
| `country_id` | `NG`, `US`, `CM` |
| `age_group` | `child` / `teenager` / `adult` / `senior` |

---

### `GET /api/profiles/:id`
Fetch a single profile by UUID.

```bash
curl https://your-app.vercel.app/api/profiles/019d9450-403a-732f-afb6-9174c8cd71b1
```

---

### `DELETE /api/profiles/:id`
Delete a profile. Returns `204 No Content`.

```bash
curl -X DELETE https://your-app.vercel.app/api/profiles/019d9450-403a-732f-afb6-9174c8cd71b1
```

---

## Error Responses

All errors follow this structure:

```json
{ "status": "error", "message": "<description>" }
```

| Status | Cause |
|---|---|
| 400 | Missing or empty name |
| 422 | Name is not a string |
| 404 | Profile not found |
| 502 | Upstream API (Genderize / Agify / Nationalize) returned invalid data |
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

**1. Clone and install**
```bash
git clone https://github.com/yasmincreates/profile-intelligence.git
cd profile-intelligence
npm install
```

**2. Set up environment**
```bash
# Create .env in the project root
DATABASE_URL="your-neon-connection-string"
```

**3. Generate Prisma client and run migrations**
```bash
npx prisma generate
npx prisma migrate deploy
```

**4. Start dev server**
```bash
npm run dev
```

Server runs at `http://localhost:3000`.
