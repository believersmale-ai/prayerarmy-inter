import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import {
  check,
  clean,
  required,
  validEmail,
  hash,
  utc,
  object,
  route,
} from "./node-common.js";
const scrypt = promisify(scryptCallback);
export const PERMISSIONS = {
  owner: [
    "settings",
    "media",
    "messages",
    "care",
    "analytics",
    "team",
    "security",
  ],
  editor: ["settings", "media", "messages", "analytics"],
  media: ["media", "messages"],
  care: ["care"],
};
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${(await scrypt(password, salt, 64)).toString("hex")}`;
}
export async function verifyPassword(password, encoded) {
  const valid = /^[a-f0-9]{32}:[a-f0-9]{128}$/.test(encoded || "");
  const [salt, hex] = valid
    ? encoded.split(":")
    : ["0".repeat(32), "0".repeat(128)];
  const actual = await scrypt(
    typeof password === "string" ? password : "",
    salt,
    64,
  );
  return timingSafeEqual(actual, Buffer.from(hex, "hex")) && valid;
}
const cookies = (req) =>
  Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.includes("="))
      .map((s) => [s.slice(0, s.indexOf("=")), s.slice(s.indexOf("=") + 1)]),
  );
export function sameOrigin(req, res, next) {
  try {
    check(
      process.env.NODE_ENV !== "production" || req.secure,
      403,
      "HTTPS is required",
    );
    const origin = new URL(req.get("origin"));
    check(
      ["http:", "https:"].includes(origin.protocol) &&
        origin.host === req.get("host") &&
        (!req.secure || origin.protocol === "https:"),
      403,
      "Origin mismatch",
    );
    next();
  } catch {
    res.status(403).json({ error: "A same-origin request is required" });
  }
}
export function createStaff(store) {
  const { query, one, transaction, config, updateConfig, rate } = store;
  const token = (req) => cookies(req).admin_session || "";
  const profile = async (id, connection) =>
    one(
      "SELECT u.id,u.email,u.role AS legacy_role,u.is_active,u.last_login_at,u.created_at,p.role,p.display_name FROM admin_users u LEFT JOIN node_staff_profiles p ON p.user_id = CAST(u.id AS CHAR) WHERE u.id = ?",
      [id],
      connection,
    );
  const view = (row) => {
    const role =
      row.role || (row.legacy_role === "admin" ? "owner" : row.legacy_role);
    return {
      user_id: String(row.id),
      email: row.email,
      name: row.display_name || row.email,
      role,
      permissions: PERMISSIONS[role] || [],
      via: "account",
    };
  };
  const authorize = route(async (req, res, next) => {
    const cookie = token(req);
    check(/^[a-f0-9]{64}$/.test(cookie), 401, "Admin authentication required");
    const session = await one(
      "SELECT user_id,passkey_version FROM node_admin_sessions WHERE token_hash=? AND expires_at>UTC_TIMESTAMP()",
      [hash(cookie)],
    );
    check(session, 401, "Your session has expired. Sign in again.");
    if (session.user_id !== null) {
      const row = await profile(session.user_id);
      check(
        row && Number(row.is_active) === 1,
        401,
        "Your account is inactive",
      );
      req.staff = view(row);
      check(
        req.staff.permissions.length,
        403,
        "Your account has no assigned staff role",
      );
    } else {
      const cfg = await config();
      check(
        cfg.legacyEnabled &&
          session.passkey_version === hash(cfg.passkeyHash || ""),
        401,
        "The shared passkey has been turned off or changed",
      );
      req.staff = {
        user_id: null,
        email: "Shared passkey",
        name: "Shared passkey",
        role: "owner",
        permissions: PERMISSIONS.owner,
        via: "passkey",
      };
    }
    res.setHeader("Cache-Control", "no-store");
    req.adminUser = req.staff;
    next();
  });
  const allowed = (req, permission) =>
    check(
      !permission || req.staff?.permissions.includes(permission),
      403,
      "Your role is not allowed to do this",
    );
  const permit = (permission) => [
    authorize,
    route(async (req, res, next) => {
      allowed(req, permission);
      next();
    }),
  ];
  const issue = async (req, res, userId, passkeyHash) => {
    const value = randomBytes(32).toString("hex");
    await query(
      "INSERT INTO node_admin_sessions(token_hash,user_id,passkey_version,expires_at) VALUES (?,?,?,?)",
      [
        hash(value),
        userId === null ? null : String(userId),
        passkeyHash ? hash(passkeyHash) : null,
        utc(new Date(Date.now() + 8 * 3600e3)),
      ],
    );
    await query(
      "DELETE FROM node_admin_sessions WHERE expires_at <= UTC_TIMESTAMP()",
    );
    res.setHeader(
      "Set-Cookie",
      `admin_session=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${req.secure ? "; Secure" : ""}`,
    );
  };
  const login = route(async (req, res) => {
    await rate(req, "staff-login", 10, 900);
    const email = clean(req.body?.email, 255).toLowerCase();
    const row = await one(
      "SELECT id,password_hash,is_active FROM admin_users WHERE email=?",
      [email],
    );
    const verified = await verifyPassword(
      req.body?.password,
      row?.password_hash,
    );
    check(
      verified && row && Number(row.is_active) === 1,
      401,
      "Invalid email or password",
    );
    const me = view(await profile(row.id));
    check(
      me.permissions.length,
      403,
      "Your account has no assigned staff role",
    );
    await query(
      "UPDATE admin_users SET last_login_at=UTC_TIMESTAMP() WHERE id=?",
      [row.id],
    );
    await issue(req, res, row.id);
    res.json({ success: true, user: me });
  });
  const passkey = route(async (req, res) => {
    await rate(req, "passkey-login", 10, 900);
    const cfg = await config();
    const verified = await verifyPassword(req.body?.passkey, cfg.passkeyHash);
    check(
      cfg.legacyEnabled && verified,
      401,
      cfg.legacyEnabled
        ? "Incorrect passkey"
        : "The shared passkey has been turned off",
    );
    await issue(req, res, null, cfg.passkeyHash);
    res.json({ success: true });
  });
  const logout = route(async (req, res) => {
    if (token(req))
      await query("DELETE FROM node_admin_sessions WHERE token_hash=?", [
        hash(token(req)),
      ]);
    res.setHeader(
      "Set-Cookie",
      `admin_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${req.secure ? "; Secure" : ""}`,
    );
    res.json({ success: true });
  });
  const changePassword = route(async (req, res) => {
    check(req.staff.via === "account", 403, "Sign in with your own account");
    const password = req.body?.password;
    check(
      typeof password === "string" &&
        password.length >= 10 &&
        password.length <= 128,
      422,
      "Use a password of 10–128 characters",
    );
    await transaction(async (connection) => {
      await query(
        "UPDATE admin_users SET password_hash=? WHERE id=?",
        [await hashPassword(password), req.staff.user_id],
        connection,
      );
      await query(
        "DELETE FROM node_admin_sessions WHERE user_id=? AND token_hash<>?",
        [req.staff.user_id, hash(token(req))],
        connection,
      );
    });
    res.json({ id: req.staff.user_id, email: req.staff.email });
  });
  const team = route(async (req, res) => {
    const action = req.body?.action;
    const p = object(req.body?.payload);
    if (action === "whoami")
      return res.json({
        me: req.staff,
        legacy_enabled: Boolean((await config()).legacyEnabled),
      });
    allowed(req, "team");
    if (action === "list_users") {
      const rows = await query(
        "SELECT u.id,u.email,u.role AS legacy_role,u.is_active,u.last_login_at,u.created_at,p.role,p.display_name FROM admin_users u LEFT JOIN node_staff_profiles p ON p.user_id=CAST(u.id AS CHAR) ORDER BY u.created_at",
      );
      return res.json({
        users: rows.map((row) => ({
          ...view(row),
          display_name: row.display_name || row.email,
          active: Boolean(Number(row.is_active)),
          last_sign_in_at: row.last_login_at,
        })),
      });
    }
    if (action === "set_legacy") {
      const cfg = await config();
      check(!p.enabled || cfg.passkeyHash, 400, "Set a passkey first");
      await updateConfig({ legacyEnabled: p.enabled === true });
      if (p.enabled !== true)
        await query("DELETE FROM node_admin_sessions WHERE user_id IS NULL");
      return res.json({ ok: true });
    }
    check(
      [
        "create_user",
        "set_role",
        "set_active",
        "reset_password",
        "delete_user",
      ].includes(action),
      400,
      "Unknown team action",
    );
    await transaction(async (connection) => {
      // Lock all staff rows so concurrent changes cannot remove the final active owner.
      const all = await query(
        "SELECT u.id,u.email,u.role AS legacy_role,u.is_active,u.created_at,p.role,p.display_name FROM admin_users u LEFT JOIN node_staff_profiles p ON p.user_id=CAST(u.id AS CHAR) ORDER BY u.id FOR UPDATE",
        [],
        connection,
      );
      const id = clean(p.user_id, 64);
      const target = all.find((row) => String(row.id) === id);
      if (action !== "create_user") check(target, 404, "Account not found");
      const role = p.role;
      if (["create_user", "set_role"].includes(action))
        check(Object.hasOwn(PERMISSIONS, role), 400, "Choose a staff role");
      if (action === "create_user" || action === "reset_password")
        check(
          typeof p.password === "string" &&
            p.password.length >= 10 &&
            p.password.length <= 128,
          400,
          "Use a password of 10–128 characters",
        );
      if (action === "create_user") {
        const email = clean(p.email, 254).toLowerCase();
        check(validEmail(email), 400, "Enter a valid email address");
        check(
          !all.some((row) => row.email.toLowerCase() === email),
          409,
          "An account with that email already exists",
        );
        const userId = await store.insert(
          "admin_users",
          {
            email,
            password_hash: await hashPassword(p.password),
            role: "admin",
            is_active: 1,
            created_at: utc(),
          },
          connection,
        );
        await query(
          "INSERT INTO node_staff_profiles(user_id,role,display_name) VALUES (?,?,?)",
          [userId, role, clean(p.name, 150) || email],
          connection,
        );
        return;
      }
      const removesOwner =
        action === "delete_user" ||
        (action === "set_active" && p.active !== true) ||
        (action === "set_role" && role !== "owner");
      if (
        removesOwner &&
        Number(target.is_active) === 1 &&
        view(target).role === "owner"
      ) {
        check(
          all.some(
            (row) =>
              String(row.id) !== id &&
              Number(row.is_active) === 1 &&
              view(row).role === "owner",
          ),
          400,
          "There must always be an active System admin",
        );
      }
      check(
        !(
          id === req.staff.user_id &&
          (action === "delete_user" ||
            (action === "set_active" && p.active !== true))
        ),
        400,
        "You cannot delete or turn off your own account",
      );
      if (action === "set_role")
        await query(
          "INSERT INTO node_staff_profiles(user_id,role,display_name) VALUES (?,?,?) ON DUPLICATE KEY UPDATE role=VALUES(role)",
          [id, role, target.display_name || target.email],
          connection,
        );
      if (action === "set_active")
        await query(
          "UPDATE admin_users SET is_active=? WHERE id=?",
          [p.active === true ? 1 : 0, id],
          connection,
        );
      if (action === "reset_password")
        await query(
          "UPDATE admin_users SET password_hash=? WHERE id=?",
          [await hashPassword(p.password), id],
          connection,
        );
      if (action === "delete_user") {
        await query(
          "DELETE FROM node_staff_profiles WHERE user_id=?",
          [id],
          connection,
        );
        await query("DELETE FROM admin_users WHERE id=?", [id], connection);
      }
      if (
        action === "delete_user" ||
        action === "reset_password" ||
        (action === "set_active" && !p.active)
      )
        await query(
          "DELETE FROM node_admin_sessions WHERE user_id=?",
          [id],
          connection,
        );
    });
    res.json({ ok: true });
  });
  const changePasskey = route(async (req, res) => {
    allowed(req, "security");
    check(
      typeof req.body?.newPasskey === "string" &&
        req.body.newPasskey.trim().length >= 8 &&
        req.body.newPasskey.trim().length <= 128,
      400,
      "Use a passkey of 8–128 characters",
    );
    const password = req.body.newPasskey.trim();
    const encoded = await hashPassword(password);
    await updateConfig({ passkeyHash: encoded });
    await query("DELETE FROM node_admin_sessions WHERE user_id IS NULL");
    if (req.staff.via === "passkey") await issue(req, res, null, encoded);
    res.json({ success: true });
  });
  return {
    authorize,
    permit,
    allowed,
    login,
    passkey,
    logout,
    changePassword,
    team,
    changePasskey,
    profile,
  };
}
