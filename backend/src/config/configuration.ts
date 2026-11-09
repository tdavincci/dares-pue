const bool = (v: string | undefined, def: boolean) =>
  v === undefined || v === '' ? def : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
const int = (v: string | undefined, def: number) => {
  const n = parseInt(v ?? '', 10);
  return Number.isFinite(n) ? n : def;
};

/**
 * Parses CORS_ORIGINS: `*` (the default) allows any website to call the API, or list the allowed ones,
 * e.g. "https://a.example,https://b.example". Browsers send the Origin as scheme://host[:port] with no path or
 * trailing slash, so surrounding quotes, spaces and trailing slashes are dropped to make small typos still match.
 * Allowing every origin is safe here because logins use Bearer tokens, not cookies (credentials are off).
 */
export function parseCorsOrigins(raw: string | undefined): string[] {
  return (raw === undefined || raw.trim() === '' ? '*' : raw)
    .split(/[,\s]+/)
    .map((s) => s.trim().replace(/^['"]+|['"]+$/g, '').replace(/\/+$/, ''))
    .filter(Boolean);
}

export default () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: int(process.env.PORT, 3000),
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGINS),

  db: {
    /**
     * Full connection string (e.g. Supabase). When set it takes precedence over DB_HOST/PORT/USER/PASSWORD/NAME,
     * and SSL is on by default.
     */
    url: process.env.DATABASE_URL?.trim() || undefined,
    host: process.env.DB_HOST ?? 'localhost',
    port: int(process.env.DB_PORT, 5432),
    username: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_NAME ?? 'dares_pue',
    ssl: bool(process.env.DB_SSL, !!process.env.DATABASE_URL?.trim()),
    /** Max connections in the pool. Keep it small on Supabase's free tier pooler. */
    poolMax: int(process.env.DB_POOL_MAX, 10),
    synchronize: bool(process.env.DB_SYNC, false),
    runMigrations: bool(process.env.DB_RUN_MIGRATIONS, true),
    logging: bool(process.env.DB_LOGGING, false),
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET ?? 'change-me-in-production',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
    seedAdminEmail: process.env.ADMIN_EMAIL ?? 'admin@dares-pue.local',
    seedAdminPassword: process.env.ADMIN_PASSWORD ?? 'ChangeMe123!',
    seedAdminName: process.env.ADMIN_NAME ?? 'System Administrator',
  },

  odyssey: {
    /** Lifetime of access tokens issued through the token-renewal endpoint. */
    accessTokenTtlSeconds: int(process.env.ODYSSEY_ACCESS_TOKEN_TTL_SECONDS, 86400),
    /** Default page size when Odyssey does not send pageLimit. 0 = return everything in the window. */
    defaultPageLimit: int(process.env.ODYSSEY_DEFAULT_PAGE_LIMIT, 0),
    maxPageLimit: int(process.env.ODYSSEY_MAX_PAGE_LIMIT, 5000),
    /** Days of Odyssey request history kept for the API access page. 0 = keep forever. */
    accessLogRetentionDays: int(process.env.ODYSSEY_ACCESS_LOG_RETENTION_DAYS, 90),
    /**
     * Widest FROM–TO window Odyssey may request. Routine syncs ask for ~24h; the larger limit allows history
     * backfills. 184 days is the longest any 6 calendar months can be. 0 = no limit.
     * ODYSSEY_MAX_RANGE_HOURS (the old setting) is still honoured when the days setting is not set.
     */
    maxRangeDays:
      process.env.ODYSSEY_MAX_RANGE_DAYS === undefined && process.env.ODYSSEY_MAX_RANGE_HOURS !== undefined
        ? int(process.env.ODYSSEY_MAX_RANGE_HOURS, 0) / 24
        : int(process.env.ODYSSEY_MAX_RANGE_DAYS, 184),
    /**
     * Trackers can report every few seconds. Readings sent to Odyssey are down-sampled to
     * one point per device per bucket (latest point wins). 0 = send raw points.
     */
    readingIntervalMinutes: int(process.env.ODYSSEY_READING_INTERVAL_MINUTES, 15),
    paymentTransactionType: process.env.ODYSSEY_PAYMENT_TRANSACTION_TYPE ?? 'FULL_PAYMENT',
    /** REVERSAL events report the reversed amount as a negative number (false = positive amount). */
    reversalNegativeAmount: bool(process.env.ODYSSEY_REVERSAL_NEGATIVE_AMOUNT, true),
  },

  tracking: {
    onlineThresholdMinutes: int(process.env.ONLINE_THRESHOLD_MINUTES, 30),
    defaultGeofenceRadiusMeters: int(process.env.DEFAULT_GEOFENCE_RADIUS_METERS, 500),
    /** GPS speeds below this (km/h) are stored as 0: stationary GPS drift, not movement. 0 = keep raw speed. */
    stationarySpeedKph: int(process.env.STATIONARY_SPEED_KPH, 5),
    gt06Enabled: bool(process.env.GT06_ENABLED, true),
    gt06Port: int(process.env.GT06_PORT, 5023),
    /** Minutes to add to the GT06 device clock to get UTC (most units already send UTC). */
    gt06TimeOffsetMinutes: int(process.env.GT06_TIME_OFFSET_MINUTES, 0),
    gt06IdleTimeoutSeconds: int(process.env.GT06_IDLE_TIMEOUT_SECONDS, 900),
    osmandRequireKey: bool(process.env.OSMAND_REQUIRE_KEY, true),
  },

  payments: {
    allowInstallments: bool(process.env.PAYMENTS_ALLOW_INSTALLMENTS, false),
    defaultCurrency: process.env.DEFAULT_CURRENCY ?? 'NGN',
  },
});
