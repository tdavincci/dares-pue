# DARES PUE — Water Pump Tracking API & Admin Portal

Tracks the GPS location of solar water pumps supplied for irrigation farming, to make sure each pump is installed on
the farm it was intended for. Each pump carries a battery-powered GPS car tracker. The tracker reports its position to
this system, and the system exposes the data to **Odyssey Energy Solutions** through their **Standard API** contract.

```
 GT06 car tracker ──TCP:5023──┐
 HTTP / OsmAnd tracker ──HTTPS┤                       ┌── Angular Material admin portal (/)
                              ▼                       │
                        NestJS backend ── PostgreSQL ─┤
                              │                       └── Odyssey (Bearer token) → /api/v1/odyssey/standard/*
                              └── Swagger: /api/docs  and  /api/v1/odyssey/standard/swagger-ui
```

| Folder      | What                                                                      |
|-------------|---------------------------------------------------------------------------|
| `backend/`  | NestJS 11 + TypeORM + PostgreSQL. REST API, GT06 TCP listener, Swagger.   |
| `frontend/` | Angular 22 + Angular Material 3 + Leaflet admin portal.                   |

---

## 1. Quick start (Docker)

```bash
cp backend/.env.example .env      # optional: set DB_PASSWORD, JWT_SECRET, ADMIN_PASSWORD, PUBLIC_URL
docker compose up -d --build
```

* Admin portal: <http://localhost:8080>. Sign in as `admin@dares-pue.local` / `ChangeMe123!` and **change the password**.
* Admin API docs: <http://localhost:8080/api/docs>
* Odyssey Standard API docs: <http://localhost:8080/api/v1/odyssey/standard/swagger-ui>
* GT06 trackers: TCP `<server-ip>:5023`. Open this port on the firewall.

## 2. Local development

```bash
# PostgreSQL 14+ running locally, database "dares_pue"
cd backend && cp .env.example .env && npm install && npm run start:dev      # http://localhost:3000
cd frontend && npm install && npx ng serve                                  # http://localhost:4200 (proxies /api → :3000)
```

The schema is created by migrations, which run automatically on boot (`DB_RUN_MIGRATIONS=true`). After changing an
entity, run:

```bash
npm run migration:generate --name=DescribeChange   # then commit src/database/migrations/*
```

Tests and tools:

```bash
npm test                                   # unit tests (GT06 codec incl. protocol-doc reference packet, Odyssey params)
./scripts/smoke-test.sh                    # end-to-end checks against a running backend (needs curl + jq)
npm run simulate:gt06 -- --imei 359339075123456 --lat 9.2035 --lon 12.4954 --count 10
```

---

## 3. Odyssey Standard API

The Odyssey Standard API was designed for electricity meters. The DARES PUE mapping is:

| Odyssey concept       | DARES PUE meaning                                                         |
|-----------------------|---------------------------------------------------------------------------|
| meter / `meterId`     | water pump: its **serial number** (`ID` also accepts the tracker IMEI)    |
| reading               | one GPS position fix from the pump's tracker                              |
| `latitude/longitude`  | fix position, as **strings** with 6 decimals (as in Odyssey's schema)     |
| customer              | farmer: `customerAccountId` = `DPF-000001`, `customerName`, `customerPhone`, `customerCategory` |
| payment               | full payment for a pump (`transactionType` = `FULL_PAYMENT`)              |
| energy fields, `rate` | not applicable, so they are omitted                                       |

The endpoints are the same as Odyssey's QA reference server
(`https://qa-standard-api.odyssey.energy/api/v1/odyssey/standard/swagger-ui`):

| Method | Path                                             | Notes |
|--------|--------------------------------------------------|-------|
| GET    | `/api/v1/odyssey/standard/meter/readings`        | `FROM`, `TO` (ISO 8601 UTC, required), `ID`, `offset`, `pageLimit` → `{ readings[], offset, pageLimit, total, errors: [] }` |
| GET    | `/api/v1/odyssey/standard/electricity/payments`  | `FROM`, `TO`, `ID` (transaction ID, pump serial or IMEI) → `{ payments[], errors: "" }` |
| POST   | `/api/v1/odyssey/standard/token-renewal`         | `{ refreshToken }` → `{ accessToken, expiresIn }` (optional flow) |

The schema names (`Meter`, `MeterResponse`, `Payment`, `PaymentResponse`, `TokenRenewalRequest`, `TokenRenewalResponse`)
and field names match Odyssey's spec exactly. That includes its quirk: `errors` is an array in readings but a
string in payments.

**Security.** Every call needs `Authorization: Bearer <token>`. An admin creates an *API client* in **API access** and
issues a token. The token is shown once and only its SHA-256 hash is stored. Tokens can be given an expiry, revoked,
or disabled per client. Admin-portal JWTs are rejected on these routes, and Odyssey tokens are rejected on admin
routes.

**Volume.** Car trackers can report every 10–30 seconds. Readings sent to Odyssey are down-sampled to one point per
pump per `ODYSSEY_READING_INTERVAL_MINUTES` (default 15, which is also sent as `timeIntervalMinutes`). The latest
point in each bucket is kept. Set it to `0` to send raw points. Odyssey says it never requests more than 24 h at once.
When `pageLimit` is omitted, everything in the window is returned, capped at `ODYSSEY_MAX_PAGE_LIMIT`.

**To give Odyssey:** the base URL (`https://<your-domain>`), an access token (or a refresh token plus the renewal URL),
and the Swagger link above.

> The spec was taken from Odyssey's QA server (titled "OES Standard API Test Server"). Their documentation page
> (`platform.odysseyenergysolutions.com/#/standard-api/docs`) only renders in a browser. Confirm two things with
> Odyssey before go-live: whether they want a pump-specific path instead of `electricity/payments`, and whether they
> expect a particular `transactionType` value.

---

## 4. Trackers

### GT06-family car trackers (default)

Most low-cost car trackers (GT06/GT06N, Concox, JM01, TK100, WeTrack, ET200 and many clones) use the **GT06 binary
protocol**. To set one up:

1. Register the pump in the portal with the tracker's **IMEI** (printed on the device). GT06 trackers authenticate by IMEI.
2. Configure the tracker by SMS (commands vary by vendor and are usually password-prefixed):
   * `SERVER,0,<your-server-ip>,5023,0#` (or `SERVER,1,<domain>,5023,0#`)
   * `APN,<operator-apn>#` (e.g. `web.gprs.mtnnigeria.net` for MTN, `internet.ng.airtel.com` for Airtel)
   * `TIMER,60#` (or `GPSON`) sets the upload interval in seconds. Longer intervals save battery.
3. Watch **Pumps & trackers**. A tracker that connects before it's registered shows up as *"unregistered tracker"*, and
   you can register it with one click.

The listener ACKs login, heartbeat, alarm and time-request packets. It decodes location packets `0x12`, `0x22`, `0x16`,
`0x26`, `0x2D` and `0x37`, verifies the CRC-ITU, and takes the battery level from heartbeats. Fixes without GPS lock
are not stored. Re-sent buffered points are de-duplicated.

### HTTP trackers / gateways

Registering a pump also returns a one-time **ingest key**.

* `POST /api/v1/ingest/locations`, with header `X-Device-Key: <key>` and body `{ latitude, longitude, timestamp?, speedKph?, batteryLevel? }`
* `POST /api/v1/ingest/locations/batch`, with body `{ points: [...] }` (up to 500)
* `GET|POST /api/v1/ingest/osmand?id=<IMEI>&lat=..&lon=..&timestamp=..&batt=..&key=<key>` (OsmAnd / Traccar Client, or
  forwarding from a Traccar server)

---

## 5. Geofence: "is the pump on the intended farm?"

Each farmer has a **farm point**, which is the intended installation location. You can pick it on a map, type it in,
or use the phone's GPS on site. Each pump has a **geofence radius** (default 500 m). Every fix gets a distance from the
farm point and an `withinGeofence` verdict. The dashboard and map flag any pump whose last fix is outside its farm, and
the pump page draws its track against the geofence.

## 6. Payments

Only full payment is accepted for now (`PAYMENTS_ALLOW_INSTALLMENTS=false`):

* A pump must be assigned to a farmer before a payment can be recorded.
* Each pump can have only one completed payment. A database unique index enforces this, and a row lock prevents races.
* If the pump has a price, the amount must equal it exactly.
* Admins can *reverse* a payment recorded in error. Reversed payments are no longer reported to Odyssey.

The data model already has `paymentType = INSTALLMENT` for a future phase.

## 7. Roles

| Role     | Can                                                               |
|----------|-------------------------------------------------------------------|
| ADMIN    | everything, including users, API clients/tokens, reversals, deletes |
| OPERATOR | register and edit farmers and pumps, record payments              |
| VIEWER   | read only                                                         |

## 8. Configuration

All settings are documented in `backend/.env.example`. The important ones for production:

* `JWT_SECRET`: set a long random value.
* `ADMIN_PASSWORD`: seeded only when there are no users yet.
* `DB_SYNC=false`: use migrations.
* `CORS_ORIGINS`: the portal URL, if it is served from a different origin.
* `GT06_PORT`, `ONLINE_THRESHOLD_MINUTES`, `DEFAULT_GEOFENCE_RADIUS_METERS`, `ODYSSEY_READING_INTERVAL_MINUTES`

Put the portal and API behind HTTPS (for example a reverse proxy with Let's Encrypt). The GT06 port is raw TCP and
stays as-is.
