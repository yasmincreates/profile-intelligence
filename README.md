# Profile Intelligence — Insighta Backend

REST API for profile intelligence with GitHub OAuth, JWT auth, RBAC, and multi-interface support (CLI + Web Portal).

**Live API:** `https://profile-intelligence-tau.vercel.app`

---

## Authentication Flow

All `/api/*` endpoints require a valid JWT access token and the `X-API-Version: 1` header.

### GitHub OAuth (Browser / Web Portal)

1. Browser navigates to `GET /auth/github`
2. Backend stores a random `state` in memory and redirects to GitHub OAuth
3. GitHub redirects back to `GET /auth/github/callback?code=...&state=...`
4. Backend validates `state`, exchanges `code` for a GitHub access token, fetches the GitHub user profile, upserts the user in the database, and issues a JWT + refresh token
5. **Web flow** (no `redirect_uri`): backend sets two HTTP-only cookies (`access_token`, `refresh_token`) and redirects to `FRONTEND_URL/dashboard`
6. **CLI flow** (`redirect_uri=http://localhost:7837/callback`): backend redirects to the local callback URL with `access_token`, `refresh_token`, and `username` as query params

### GitHub OAuth (CLI)

1. CLI generates a random `state` and `code_verifier`, computes `code_challenge = SHA256(code_verifier)`
2. CLI starts a local HTTP server on port `7837`
3. CLI opens `GET /auth/github?redirect_uri=http://localhost:7837/callback&state=...&code_challenge=...` in the browser
4. After GitHub auth, backend redirects to `http://localhost:7837/callback?access_token=...&refresh_token=...&username=...`
5. CLI reads tokens from the callback URL and saves to `~/.insighta/credentials.json`

### Token Lifecycle

| Token | TTL | Storage |
|---|---|---|
| Access token (JWT) | 3 minutes | Client (Authorization header or `access_token` cookie) |
| Refresh token (opaque) | 5 minutes | Database (`RefreshToken` table) + client |

- Access tokens are signed JWTs containing `{ id, role, username, is_active }`
- Refresh tokens are 32-byte random hex strings stored in the DB
- **Rotation on use**: `POST /auth/refresh` invalidates the old refresh token and issues a new pair
- **Revocation on logout**: `POST /auth/logout` deletes the refresh token from the DB

### Refresh Token Flow

```
POST /auth/refresh
Body (CLI): { "refresh_token": "<token>" }
Cookie (Web): refresh_token=<token>

Response: { "access_token": "...", "refresh_token": "..." }
```

---

## Role Enforcement (RBAC)

Two roles are enforced via JWT claims and middleware:

| Role | Permissions |
|---|---|
| `admin` | Full access: create profiles, delete profiles, read all |
| `analyst` | Read-only: list, search, get, export profiles |

Middleware chain for all `/api/*` requests:
1. `apiVersion` — rejects requests missing `X-API-Version: 1` with `400`
2. `authenticate` — validates JWT, attaches `req.user = { id, role, username }`, returns `401` if missing/invalid, `403` if user is inactive
3. `requireRole("admin")` — applied to `POST /api/profiles` and `DELETE /api/profiles/:id`, returns `403` if role is `analyst`

### Testing Role Enforcement

```bash
# Get an admin token
curl -X POST https://profile-intelligence-tau.vercel.app/auth/test-token \
  -H "Content-Type: application/json" \
  -d '{"role": "admin"}'

# Get an analyst token
curl -X POST https://profile-intelligence-tau.vercel.app/auth/test-token \
  -H "Content-Type: application/json" \
  -d '{"role": "analyst"}'

# Analyst cannot create profiles (403)
curl -X POST https://profile-intelligence-tau.vercel.app/api/profiles \
  -H "Authorization: Bearer <analyst_token>" \
  -H "X-API-Version: 1" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test User"}'

# Admin can create profiles (201)
curl -X POST https://profile-intelligence-tau.vercel.app/api/profiles \
  -H "Authorization: Bearer <admin_token>" \
  -H "X-API-Version: 1" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test User"}'
```

---

## API Reference

All `/api/*` endpoints require:
- `Authorization: Bearer <access_token>`
- `X-API-Version: 1`

### Auth Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/auth/github` | None | Initiate GitHub OAuth |
| GET | `/auth/github/callback` | None | OAuth callback (handled by GitHub redirect) |
| POST | `/auth/refresh` | None | Rotate refresh token |
| POST | `/auth/logout` | None | Invalidate refresh token |
| GET | `/auth/me` | Bearer | Current user info |
| POST | `/auth/test-token` | None | Issue test tokens for admin/analyst (requires `ALLOW_TEST_LOGIN=true`) |

### Profile Endpoints

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/profiles` | any | List with filters, sorting, pagination |
| GET | `/api/profiles/search` | any | Natural language search |
| GET | `/api/profiles/export` | any | Export as CSV |
| GET | `/api/profiles/:id` | any | Get profile by ID |
| POST | `/api/profiles` | admin | Create/enrich a profile by name |
| DELETE | `/api/profiles/:id` | admin | Delete a profile |
| GET | `/api/users/me` | any | Current user info (via API router) |

### Pagination Response Shape

```json
{
  "status": "success",
  "page": 1,
  "limit": 10,
  "total": 2035,
  "total_pages": 204,
  "links": {
    "self": "/api/profiles?page=1&limit=10",
    "next": "/api/profiles?page=2&limit=10",
    "prev": null
  },
  "data": [...]
}
```

### Filter Parameters (`GET /api/profiles`)

| Param | Type | Description |
|-------|------|-------------|
| `gender` | string | `male` / `female` |
| `age_group` | string | `child` / `teen` / `young adult` / `adult` / `middle-aged` / `senior` |
| `country_id` | string | ISO code e.g. `NG`, `US` |
| `min_age` | number | Minimum age inclusive |
| `max_age` | number | Maximum age inclusive |
| `sort_by` | string | `name`, `age`, `country_id`, `created_at` |
| `order` | string | `asc` (default) or `desc` |
| `page` | number | Default: 1 |
| `limit` | number | Default: 10, max: 50 |

---

## Rate Limiting

| Scope | Limit |
|---|---|
| `/auth/*` | 10 requests / minute per IP |
| `/api/*` | 60 requests / minute per user (JWT user ID) or IP |

Exceeding the limit returns `429 Too Many Requests`.

---

## CLI Interface (`insighta`)

Install and link globally:

```bash
cd insighta-cli
npm install && npm run build && npm link
```

Commands:

```bash
insighta login                        # GitHub OAuth (opens browser)
insighta logout                       # Invalidate session
insighta whoami                       # Show current user and role

insighta profiles list                # List all profiles
insighta profiles list --gender male --country NG --limit 20
insighta profiles get <id>            # Get profile by ID
insighta profiles search "adult females from Kenya"
insighta profiles create --name "Ada Obi"   # admin only
insighta profiles export --format csv       # saves CSV to current directory
```

Credentials stored at `~/.insighta/credentials.json`. The CLI auto-refreshes expired access tokens using the stored refresh token.

**CLI Repository:** https://github.com/yasmincreates/insighta-cli

---

## Web Portal

Next.js 14 App Router portal with GitHub OAuth (HTTP-only cookies), server-side rendering, and token auto-refresh in middleware.

**Live URL:** https://insighta-web-psi.vercel.app

Pages:
- `/login` — GitHub OAuth login
- `/dashboard` — total profiles, gender breakdown, top countries
- `/profiles` — filterable, paginated profile list
- `/profiles/[id]` — profile detail
- `/search` — natural language search
- `/account` — user info and logout

**Web Repository:** https://github.com/yasmincreates/insighta-web

---

## Tech Stack

- **Runtime:** Node.js + TypeScript (CommonJS)
- **Framework:** Express 5
- **Database:** PostgreSQL via [Neon](https://neon.tech) (serverless)
- **ORM:** Prisma 7 with Neon adapter
- **Auth:** GitHub OAuth 2.0, JWT (`jsonwebtoken`), opaque refresh tokens
- **Deployment:** Vercel (serverless)

---

## Local Development

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, JWT_SECRET, JWT_REFRESH_SECRET, FRONTEND_URL
npx prisma generate
npx prisma db push
npm run seed
npm run dev            # http://localhost:3000
```

Set `ALLOW_TEST_LOGIN=true` in `.env` to enable `POST /auth/test-token` locally.
