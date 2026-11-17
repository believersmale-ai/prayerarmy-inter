import { randomUUID, createHash, createHmac, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const check = (condition, status, message) => {
  if (!condition) throw new HttpError(status, message);
};
export const clean = (v, max = 2000) =>
  (typeof v === "string" || typeof v === "number" ? String(v) : "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")
    .trim()
    .slice(0, max);
export const required = (v, max, label) => {
  const value = clean(v, max);
  check(value, 400, `${label} is required`);
  return value;
};
export const optional = (v, max) => clean(v, max) || null;
export const hash = (value) =>
  createHash("sha256").update(String(value)).digest("hex");
export const hmac = (secret, value) =>
  createHmac("sha256", secret).update(value).digest("hex");
export const utc = (date = new Date()) =>
  date.toISOString().slice(0, 19).replace("T", " ");
export const validEmail = (value) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
export const object = (v) =>
  v && typeof v === "object" && !Array.isArray(v) ? v : {};
export const safeLink = (value) => {
  const url = clean(value).replace(/[\x00-\x1f\x7f]/g, "");
  if (url.startsWith("//") || url.includes("\\")) return "";
  const scheme = url.match(/^([a-z][a-z0-9+.-]*):/i);
  return scheme &&
    !["https", "http", "tel", "mailto"].includes(scheme[1].toLowerCase())
    ? ""
    : url;
};
export const rowView = (row) =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      [
        "is_private",
        "is_read",
        "is_approved",
        "is_featured",
        "show_name",
        "active",
        "is_contacted",
      ].includes(key)
        ? Boolean(Number(value))
        : value instanceof Date
          ? value.toISOString()
          : key === "id" || key === "message_id"
            ? String(value)
            : value,
    ]),
  );
const allowedTables = new Set([
  "site_content_messages",
  "site_content_testimonies",
  "site_content_wall_prayers",
  "site_content_message_comments",
  "site_content_events",
  "prayer_requests",
  "connect_requests",
  "admin_users",
]);
const additions = {
  site_content_messages: {
    source: "VARCHAR(6) NOT NULL DEFAULT 'manual'",
    speaker: "VARCHAR(120) NULL",
    category: "VARCHAR(60) NULL",
    thumbnail_url: "VARCHAR(2000) NULL",
    is_featured: "TINYINT NOT NULL DEFAULT 0",
  },
  site_content_testimonies: { show_name: "TINYINT NOT NULL DEFAULT 0" },
};
export function createStore(db) {
  const columns = new Map();
  const query = async (sql, args = [], connection = db) =>
    (await connection.execute(sql, args))[0];
  const one = async (sql, args = [], connection = db) =>
    (await query(sql, args, connection))[0];
  const describe = async (table, refresh = false) => {
    check(allowedTables.has(table), 500, "Unknown data source");
    if (!columns.has(table) || refresh)
      columns.set(
        table,
        await query(
          "SELECT COLUMN_NAME, DATA_TYPE, EXTRA, CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION",
          [table],
        ),
      );
    return columns.get(table);
  };
  const insert = async (table, data, connection = db) => {
    const schema = await describe(table);
    const id = schema.find((c) => c.COLUMN_NAME === "id");
    check(
      id &&
        (id.EXTRA.includes("auto_increment") ||
          ["char", "varchar"].includes(id.DATA_TYPE)),
      503,
      `Unsupported ID layout for ${table}; inspect its schema before migration`,
    );
    const row = { ...data };
    if (!id.EXTRA.includes("auto_increment")) {
      check(
        Number(id.CHARACTER_MAXIMUM_LENGTH) >= 36,
        503,
        "UUID column is too short",
      );
      row.id = randomUUID();
    }
    for (const name of Object.keys(row))
      check(
        schema.some((c) => c.COLUMN_NAME === name),
        503,
        `Missing ${table}.${name}; apply the documented schema upgrade`,
      );
    const keys = Object.keys(row);
    const result = await query(
      `INSERT INTO \`${table}\` (${keys.map((k) => `\`${k}\``).join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
      Object.values(row),
      connection,
    );
    return String(row.id || result.insertId);
  };
  const transaction = async (fn) => {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const result = await fn(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  };
  async function initialize(initialConfig = {}) {
    const migration = await readFile(
      new URL("./migrations/004_node_modules.sql", import.meta.url),
      "utf8",
    );
    for (const sql of migration
      .replace(/^--.*$/gm, "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean))
      await db.query(sql);
    for (const [table, fields] of Object.entries(additions)) {
      const schema = await describe(table);
      for (const [field, ddl] of Object.entries(fields))
        if (!schema.some((c) => c.COLUMN_NAME === field)) {
          try {
            await db.query(
              `ALTER TABLE \`${table}\` ADD COLUMN \`${field}\` ${ddl}`,
            );
          } catch (error) {
            if (error.code !== "ER_DUP_FIELDNAME") throw error;
          }
        }
      await describe(table, true);
    }
    await query("INSERT IGNORE INTO node_config (id, data) VALUES (1, ?)", [
      JSON.stringify({
        formSecret: randomBytes(32).toString("hex"),
        legacyEnabled: false,
        ...initialConfig,
      }),
    ]);
  }
  const config = async () => {
    const row = await one("SELECT data FROM node_config WHERE id = 1");
    check(row, 503, "Backend initialization is not complete");
    return JSON.parse(row.data);
  };
  const updateConfig = (patch) =>
    transaction(async (connection) => {
      const row = await one(
        "SELECT data FROM node_config WHERE id = 1 FOR UPDATE",
        [],
        connection,
      );
      const data = { ...JSON.parse(row.data), ...patch };
      await query(
        "UPDATE node_config SET data = ? WHERE id = 1",
        [JSON.stringify(data)],
        connection,
      );
      return data;
    });
  const rate = async (req, bucket, max, seconds = 3600) => {
    const secret = (await config()).formSecret;
    const key = `${bucket}:${hmac(secret, req.ip || "unknown")}`;
    const win = Math.floor(Date.now() / (seconds * 1000));
    await query(
      "INSERT INTO node_rate_limits (k,win,hits,touched_at) VALUES (?,?,1,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE hits=IF(win=VALUES(win),hits+1,1),win=VALUES(win),touched_at=VALUES(touched_at)",
      [key, win],
    );
    const row = await one(
      "SELECT hits FROM node_rate_limits WHERE k = ? AND win = ?",
      [key, win],
    );
    check(!row || row.hits <= max, 429, "rate_limited");
    if (Math.random() < 0.01)
      await query(
        "DELETE FROM node_rate_limits WHERE touched_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)",
      );
  };
  return {
    db,
    query,
    one,
    describe,
    insert,
    transaction,
    initialize,
    config,
    updateConfig,
    rate,
  };
}
export const route = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    if (res.headersSent) return next(error);
    const status = error instanceof HttpError ? error.status : 503;
    if (!(error instanceof HttpError))
      console.error("Backend request failed:", error.code || error.name);
    res
      .status(status)
      .json({
        error:
          error instanceof HttpError
            ? error.message
            : "Service temporarily unavailable",
        message:
          error instanceof HttpError
            ? error.message
            : "Service temporarily unavailable",
      });
  }
};
