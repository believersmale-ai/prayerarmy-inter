import { Router } from "express";
import { randomUUID, randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  check,
  clean,
  optional,
  required,
  validEmail,
  object,
  hash,
  utc,
  route,
} from "./node-common.js";
import { sameOrigin } from "./node-auth.js";
const MEMBER_STATES = ["visitor", "member", "inactive"];
const SESSION_STATES = ["scheduled", "open", "closed", "cancelled"];
const ATTENDANCE = ["present", "late", "excused", "absent", "unmarked"];
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const idOf = (v) => {
  check(typeof v === "string" && UUID.test(v), 400, "Invalid record ID");
  return v.toLowerCase();
};
const count = (v) => Number(v || 0);
const dateOnly = (value, label, nullable = false) => {
  if (nullable && (value === null || value === undefined || value === ""))
    return null;
  check(
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value),
    400,
    `${label} must be a valid date`,
  );
  const d = new Date(value + "T00:00:00Z");
  check(
    !Number.isNaN(d.getTime()) &&
      d.toISOString().slice(0, 10) === value &&
      Number(value.slice(0, 4)) >= 1900,
    400,
    `${label} must be a valid date`,
  );
  return value;
};
const instant = (value, label) => {
  check(
    typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(
        value,
      ),
    400,
    `${label} needs a date, time and timezone`,
  );
  dateOnly(value.slice(0, 10), label);
  check(
    /T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ),
    400,
    `${label} must be valid`,
  );
  const d = new Date(value);
  check(!Number.isNaN(d.getTime()), 400, `${label} must be valid`);
  return utc(d);
};
const emailOf = (value) => {
  const email = clean(value, 190).toLowerCase();
  check(!email || validEmail(email), 400, "Enter a valid email address");
  return email || null;
};
const revision = (body) => {
  check(
    Number.isSafeInteger(body.version) && body.version > 0,
    428,
    "Reload this record before saving",
  );
  return body.version;
};
const view = (row) =>
  Object.fromEntries(
    Object.entries(row).map(([k, v]) => [
      k,
      [
        "version",
        "record_version",
        "member_count",
        "capacity",
        "filled_count",
        "served_count",
        "declined_count",
        "no_show_count",
        "roster_count",
        "present",
        "late",
        "excused",
        "absent",
        "unmarked",
        "guest_count",
      ].includes(k)
        ? Number(v || 0)
        : v instanceof Date
          ? v.toISOString()
          : v,
    ]),
  );
const memberColumns =
  "m.*,DATE_FORMAT(m.birth_date,'%Y-%m-%d') AS birth_date,DATE_FORMAT(m.joined_date,'%Y-%m-%d') AS joined_date,h.name AS household_name";
const memberView = (row) => ({
  ...view(row),
  name: [row.preferred_name || row.first_name, row.last_name]
    .filter(Boolean)
    .join(" "),
});
const like = (v) => "%" + clean(v, 100).replace(/[\\%_]/g, "\\$&") + "%";
const pageOf = (query) => ({
  limit: Math.max(1, Math.min(100, Math.floor(Number(query.limit) || 25))),
  page: Math.max(1, Math.min(100000, Math.floor(Number(query.page) || 1))),
});
const csvCell = (v) => {
  let text = String(v ?? "");
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
};
export function createChurchManagement(store, staff) {
  const { query, one, transaction } = store;
  const router = Router();
  const memberRouter = Router();
  router.use(staff.authorize);
  router.use((req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    sameOrigin(req, res, next);
  });
  const permit = (permission) =>
    route(async (req, res, next) => {
      staff.allowed(req, permission);
      next();
    });
  const audit = async (req, type, id, action, fields = [], connection) =>
    query(
      "INSERT INTO church_activity(actor_id,entity_type,entity_id,action,changed_fields,created_at) VALUES (?,?,?,?,?,UTC_TIMESTAMP())",
      [req.staff.user_id, type, id, action, JSON.stringify(fields)],
      connection,
    );
  const getMember = (id, connection) =>
    one(
      `SELECT ${memberColumns} FROM church_members m LEFT JOIN church_households h ON h.id=m.household_id WHERE m.id=?`,
      [id],
      connection,
    );
  const memberData = (body) => {
    const b = object(body),
      data = {
        first_name: required(b.first_name, 120, "First name"),
        last_name: optional(b.last_name, 120),
        preferred_name: optional(b.preferred_name, 120),
        email: emailOf(b.email),
        phone: optional(b.phone, 40),
        birth_date: dateOnly(b.birth_date, "Birth date", true),
        joined_date: dateOnly(b.joined_date || utc().slice(0, 10), "Join date"),
        membership_status: b.membership_status || "visitor",
        household_id: b.household_id ? idOf(b.household_id) : null,
        relationship: optional(b.relationship, 50),
      };
    check(
      MEMBER_STATES.includes(data.membership_status),
      400,
      "Choose a valid membership status",
    );
    if (!data.household_id) data.relationship = null;
    return data;
  };
  const householdCheck = async (id, connection) => {
    if (id)
      check(
        await one(
          "SELECT id FROM church_households WHERE id=? AND archived_at IS NULL FOR UPDATE",
          [id],
          connection,
        ),
        400,
        "Choose an active household",
      );
  };
  const insertMember = async (data, connection) => {
    const id = randomUUID(),
      keys = Object.keys(data);
    await query(
      `INSERT INTO church_members(id,${keys.join(",")},created_at,updated_at) VALUES (?,${keys.map(() => "?").join(",")},UTC_TIMESTAMP(),UTC_TIMESTAMP())`,
      [id, ...Object.values(data)],
      connection,
    );
    return id;
  };
  const memberFilter = (q) => {
    const conditions = [
        "m.archived_at IS " + (q.archived === "true" ? "NOT NULL" : "NULL"),
      ],
      args = [];
    if (q.search) {
      conditions.push(
        "(m.first_name LIKE ? OR m.last_name LIKE ? OR m.preferred_name LIKE ? OR m.email LIKE ? OR m.phone LIKE ? OR h.name LIKE ?)",
      );
      args.push(...Array(6).fill(like(q.search)));
    }
    if (q.status) {
      check(MEMBER_STATES.includes(q.status), 400, "Invalid member status");
      conditions.push("m.membership_status=?");
      args.push(q.status);
    }
    if (q.household_id) {
      conditions.push("m.household_id=?");
      args.push(idOf(q.household_id));
    }
    return { sql: conditions.join(" AND "), args };
  };
  router.get(
    "/overview",
    route(async (req, res) => {
      check(
        req.staff.permissions.some((p) =>
          ["members", "attendance", "reports"].includes(p),
        ),
        403,
        "Your role cannot access church management",
      );
      const out = {};
      if (req.staff.permissions.includes("members")) {
        out.members = await one(
          "SELECT COUNT(*) total,SUM(membership_status='member') members,SUM(membership_status='visitor') visitors,SUM(membership_status='inactive') inactive FROM church_members WHERE archived_at IS NULL",
        );
        out.households = count(
          (
            await one(
              "SELECT COUNT(*) n FROM church_households WHERE archived_at IS NULL",
            )
          ).n,
        );
        out.recentMembers = (
          await query(
            `SELECT ${memberColumns} FROM church_members m LEFT JOIN church_households h ON h.id=m.household_id WHERE m.archived_at IS NULL ORDER BY m.created_at DESC LIMIT 6`,
          )
        ).map(memberView);
      }
      if (req.staff.permissions.includes("attendance"))
        out.sessions = (
          await query(
            "SELECT s.*,COALESCE(a.present,0) present,COALESCE(a.late,0) late FROM church_sessions s LEFT JOIN (SELECT session_id,SUM(status='present') present,SUM(status='late') late FROM church_attendance GROUP BY session_id) a ON a.session_id=s.id WHERE s.state<>'cancelled' ORDER BY s.starts_at DESC LIMIT 6",
          )
        ).map(view);
      res.json(out);
    }),
  );
  router.get(
    "/members",
    permit("members"),
    route(async (req, res) => {
      const { sql, args } = memberFilter(req.query),
        { limit, page } = pageOf(req.query);
      const total = count(
        (
          await one(
            `SELECT COUNT(*) n FROM church_members m LEFT JOIN church_households h ON h.id=m.household_id WHERE ${sql}`,
            args,
          )
        ).n,
      );
      const rows = await query(
        `SELECT ${memberColumns} FROM church_members m LEFT JOIN church_households h ON h.id=m.household_id WHERE ${sql} ORDER BY m.last_name,m.first_name,m.id LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
        args,
      );
      res.json({ members: rows.map(memberView), total, page, limit });
    }),
  );
  router.get(
    "/members/export",
    permit("members"),
    route(async (req, res) => {
      const { sql, args } = memberFilter(req.query);
      const rows = await query(
        `SELECT ${memberColumns} FROM church_members m LEFT JOIN church_households h ON h.id=m.household_id WHERE ${sql} ORDER BY m.last_name,m.first_name LIMIT 10001`,
        args,
      );
      check(
        rows.length <= 10000,
        422,
        "Narrow the directory filters before exporting more than 10,000 records",
      );
      await audit(req, "directory", randomUUID(), "members.export", [
        "count:" + rows.length,
      ]);
      const columns = [
        "first_name",
        "last_name",
        "preferred_name",
        "email",
        "phone",
        "birth_date",
        "joined_date",
        "membership_status",
        "household_name",
        "relationship",
      ];
      res
        .set("Content-Disposition", 'attachment; filename="church-members.csv"')
        .type("text/csv")
        .send(
          "\uFEFF" +
            [
              columns.map(csvCell).join(","),
              ...rows.map((r) => columns.map((k) => csvCell(r[k])).join(",")),
            ].join("\r\n"),
        );
    }),
  );
  router.post(
    "/members",
    permit("members"),
    route(async (req, res) => {
      const data = memberData(req.body);
      const id = await transaction(async (c) => {
        await householdCheck(data.household_id, c);
        const id = await insertMember(data, c);
        await audit(req, "member", id, "member.create", Object.keys(data), c);
        return id;
      });
      res.status(201).json({ member: memberView(await getMember(id)) });
    }),
  );
  const importRows = (rows) => {
    check(
      Array.isArray(rows) && rows.length > 0 && rows.length <= 500,
      400,
      "Import 1–500 member rows at a time",
    );
    return rows.map((r, index) => {
      try {
        const b = object(r);
        check(!b.household_id, 400, "Assign households after importing");
        return { index: index + 1, data: memberData(b), errors: [] };
      } catch (e) {
        return {
          index: index + 1,
          errors: [e.status ? e.message : "Invalid row"],
        };
      }
    });
  };
  const duplicateCheck = (rows, existing) => {
    const signature = (r) =>
      [r.first_name, r.last_name, r.email]
        .map((v) =>
          String(v || "")
            .normalize("NFC")
            .toLowerCase()
            .trim(),
        )
        .join("\u0000");
    const seen = new Set(existing.map(signature));
    for (const row of rows)
      if (row.data) {
        const key = signature(row.data);
        if (seen.has(key))
          row.errors.push(
            "A member with this name and email already exists in the directory or file",
          );
        seen.add(key);
      }
    return rows;
  };
  router.post(
    "/members/import/preview",
    permit("members"),
    route(async (req, res) => {
      const rows = duplicateCheck(
        importRows(req.body?.rows),
        await query("SELECT first_name,last_name,email FROM church_members"),
      );
      res.json({
        rows,
        validCount: rows.filter((r) => !r.errors.length).length,
        ready: rows.every((r) => !r.errors.length),
      });
    }),
  );
  router.post(
    "/members/import",
    permit("members"),
    route(async (req, res) => {
      const batch = idOf(req.body?.requestId),
        rows = importRows(req.body?.rows);
      check(
        rows.every((r) => !r.errors.length),
        422,
        "Fix the import validation errors first",
      );
      const digest = hash(JSON.stringify(rows.map((r) => r.data)));
      const result = await transaction(async (c) => {
        const claim = await query(
          "INSERT IGNORE INTO church_import_batches(id,actor_id,content_hash,imported_count,created_at) VALUES (?,?,?,0,UTC_TIMESTAMP())",
          [batch, req.staff.user_id, digest],
          c,
        );
        const old = await one(
          "SELECT * FROM church_import_batches WHERE id=? FOR UPDATE",
          [batch],
          c,
        );
        if (!claim.affectedRows) {
          check(
            old.content_hash === digest &&
              old.actor_id === req.staff.user_id &&
              old.imported_count > 0,
            409,
            "This import ID was already used for different data",
          );
          return { imported: old.imported_count, replayed: true };
        }
        duplicateCheck(
          rows,
          await query(
            "SELECT first_name,last_name,email FROM church_members ORDER BY id FOR UPDATE",
            [],
            c,
          ),
        );
        check(
          rows.every((r) => !r.errors.length),
          409,
          "Directory changed or duplicate members were found. Preview the import again.",
        );
        for (const row of rows) await insertMember(row.data, c);
        await query(
          "UPDATE church_import_batches SET imported_count=? WHERE id=?",
          [rows.length, batch],
          c,
        );
        await audit(
          req,
          "import",
          batch,
          "members.import",
          ["count:" + rows.length],
          c,
        );
        return { imported: rows.length, replayed: false };
      });
      res.status(result.replayed ? 200 : 201).json(result);
    }),
  );
  router.get(
    "/members/:id",
    permit("members"),
    route(async (req, res) => {
      const member = await getMember(idOf(req.params.id));
      check(member, 404, "Member not found");
      res.json({ member: memberView(member) });
    }),
  );
  router.put(
    "/members/:id",
    permit("members"),
    route(async (req, res) => {
      const id = idOf(req.params.id),
        expected = revision(object(req.body)),
        data = memberData(req.body);
      await transaction(async (c) => {
        const old = await one(
          "SELECT * FROM church_members WHERE id=? FOR UPDATE",
          [id],
          c,
        );
        check(old, 404, "Member not found");
        check(
          old.version === expected,
          409,
          "This member was updated by another staff member. Reload before saving.",
        );
        check(
          !old.account_id || data.email === old.email,
          409,
          "Unlink the sign-in account before changing the email",
        );
        if (!old.archived_at || old.household_id !== data.household_id)
          await householdCheck(data.household_id, c);
        if (old.household_id !== data.household_id)
          await query(
            "UPDATE church_households SET primary_contact_id=NULL,version=version+1,updated_at=UTC_TIMESTAMP() WHERE primary_contact_id=?",
            [id],
            c,
          );
        await query(
          `UPDATE church_members SET ${Object.keys(data)
            .map((k) => k + "=?")
            .join(
              ",",
            )},version=version+1,updated_at=UTC_TIMESTAMP() WHERE id=?`,
          [...Object.values(data), id],
          c,
        );
        await audit(
          req,
          "member",
          id,
          "member.update",
          Object.keys(data).filter(
            (k) =>
              String(data[k] ?? "") !==
              String(
                old[k] instanceof Date
                  ? old[k].toISOString().slice(0, 10)
                  : (old[k] ?? ""),
              ),
          ),
          c,
        );
      });
      res.json({ member: memberView(await getMember(id)) });
    }),
  );
  router.post(
    "/members/:id/archive",
    permit("members"),
    route(async (req, res) => {
      const id = idOf(req.params.id),
        expected = revision(object(req.body));
      check(
        typeof req.body?.archived === "boolean",
        400,
        "Choose archive or restore",
      );
      await transaction(async (c) => {
        const row = await one(
          "SELECT version,household_id FROM church_members WHERE id=? FOR UPDATE",
          [id],
          c,
        );
        check(row, 404, "Member not found");
        check(
          row.version === expected,
          409,
          "Reload this member before changing it",
        );
        if (!req.body.archived) await householdCheck(row.household_id, c);
        await query(
          "UPDATE church_members SET archived_at=?,version=version+1,updated_at=UTC_TIMESTAMP() WHERE id=?",
          [req.body.archived ? utc() : null, id],
          c,
        );
        if (req.body.archived)
          await query(
            "UPDATE church_households SET primary_contact_id=NULL,version=version+1,updated_at=UTC_TIMESTAMP() WHERE primary_contact_id=?",
            [id],
            c,
          );
        await audit(
          req,
          "member",
          id,
          req.body.archived ? "member.archive" : "member.restore",
          [],
          c,
        );
      });
      res.json({ member: memberView(await getMember(id)) });
    }),
  );
  router.get(
    "/accounts",
    permit("members"),
    route(async (req, res) => {
      check(
        process.env.PAI_PUBLIC_ACCOUNTS_ENABLED === "true",
        409,
        "Member sign-in is not enabled",
      );
      const email = emailOf(req.query.email);
      check(email, 400, "Enter the member email");
      const rows = await query(
        "SELECT a.id,a.display_name,a.email,a.status FROM public_accounts a JOIN public_account_roles r ON r.account_id=a.id AND r.role='member' WHERE a.email=? AND a.status='active' LIMIT 1",
        [email],
      );
      res.json({ accounts: rows.map((r) => ({ ...r, id: String(r.id) })) });
    }),
  );
  router.put(
    "/members/:id/account",
    permit("members"),
    route(async (req, res) => {
      const id = idOf(req.params.id),
        expected = revision(object(req.body));
      const account =
        req.body?.account_id === null
          ? null
          : String(req.body?.account_id || "");
      check(
        account === null || /^[1-9][0-9]{0,19}$/.test(account),
        400,
        "Invalid sign-in account",
      );
      await transaction(async (c) => {
        const member = await one(
          "SELECT * FROM church_members WHERE id=? FOR UPDATE",
          [id],
          c,
        );
        check(member, 404, "Member not found");
        check(
          member.version === expected,
          409,
          "Reload this member before linking an account",
        );
        if (account) {
          check(
            process.env.PAI_PUBLIC_ACCOUNTS_ENABLED === "true",
            409,
            "Member sign-in is not enabled",
          );
          const a = await one(
            "SELECT a.email FROM public_accounts a JOIN public_account_roles r ON r.account_id=a.id AND r.role='member' WHERE a.id=? AND a.status='active' FOR UPDATE",
            [account],
            c,
          );
          check(
            a &&
              member.email &&
              a.email.toLowerCase() === member.email.toLowerCase(),
            400,
            "Choose an active member account with the same email",
          );
          check(
            !member.archived_at,
            400,
            "Restore the member before linking sign-in",
          );
          check(
            !(await one(
              "SELECT id FROM church_members WHERE account_id=? AND id<>?",
              [account, id],
              c,
            )),
            409,
            "This account is already linked to another member",
          );
        }
        await query(
          "UPDATE church_members SET account_id=?,version=version+1,updated_at=UTC_TIMESTAMP() WHERE id=?",
          [account, id],
          c,
        );
        await audit(
          req,
          "member",
          id,
          account ? "member.link_account" : "member.unlink_account",
          [],
          c,
        );
      });
      res.json({ member: memberView(await getMember(id)) });
    }),
  );
  const householdData = (b) => ({
    name: required(b.name, 150, "Household name"),
    phone: optional(b.phone, 40),
    email: emailOf(b.email),
    address: optional(b.address, 1000),
    primary_contact_id: b.primary_contact_id
      ? idOf(b.primary_contact_id)
      : null,
  });
  router.get(
    "/households",
    permit("members"),
    route(async (req, res) => {
      const { limit, page } = pageOf(req.query),
        where =
          "h.archived_at IS " +
          (req.query.archived === "true" ? "NOT NULL" : "NULL") +
          (req.query.search ? " AND h.name LIKE ?" : "");
      const args = req.query.search ? [like(req.query.search)] : [];
      const total = count(
        (
          await one(
            `SELECT COUNT(*) n FROM church_households h WHERE ${where}`,
            args,
          )
        ).n,
      );
      const rows = await query(
        `SELECT h.*,COALESCE(n.member_count,0) member_count,p.first_name AS contact_first_name,p.last_name AS contact_last_name FROM church_households h LEFT JOIN (SELECT household_id,COUNT(*) member_count FROM church_members WHERE archived_at IS NULL GROUP BY household_id) n ON n.household_id=h.id LEFT JOIN church_members p ON p.id=h.primary_contact_id WHERE ${where} ORDER BY h.name,h.id LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
        args,
      );
      res.json({ households: rows.map(view), total, page, limit });
    }),
  );
  router.get(
    "/households/:id",
    permit("members"),
    route(async (req, res) => {
      const id = idOf(req.params.id),
        row = await one("SELECT * FROM church_households WHERE id=?", [id]);
      check(row, 404, "Household not found");
      const members = await query(
        `SELECT ${memberColumns} FROM church_members m LEFT JOIN church_households h ON h.id=m.household_id WHERE m.household_id=? ORDER BY m.archived_at,m.last_name,m.first_name`,
        [id],
      );
      res.json({ household: view(row), members: members.map(memberView) });
    }),
  );
  router.post(
    "/households",
    permit("members"),
    route(async (req, res) => {
      const data = householdData(object(req.body));
      check(
        !data.primary_contact_id,
        400,
        "Add members before choosing the primary contact",
      );
      const id = randomUUID();
      await transaction(async (c) => {
        await query(
          "INSERT INTO church_households(id,name,phone,email,address,created_at,updated_at) VALUES (?,?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())",
          [id, data.name, data.phone, data.email, data.address],
          c,
        );
        await audit(
          req,
          "household",
          id,
          "household.create",
          Object.keys(data),
          c,
        );
      });
      res.status(201).json({
        household: view(
          await one("SELECT * FROM church_households WHERE id=?", [id]),
        ),
      });
    }),
  );
  router.put(
    "/households/:id",
    permit("members"),
    route(async (req, res) => {
      const id = idOf(req.params.id),
        expected = revision(object(req.body)),
        data = householdData(object(req.body));
      await transaction(async (c) => {
        const row = await one(
          "SELECT version FROM church_households WHERE id=? FOR UPDATE",
          [id],
          c,
        );
        check(row, 404, "Household not found");
        check(
          row.version === expected,
          409,
          "Reload this household before saving",
        );
        if (data.primary_contact_id)
          check(
            await one(
              "SELECT id FROM church_members WHERE id=? AND household_id=? AND archived_at IS NULL",
              [data.primary_contact_id, id],
              c,
            ),
            400,
            "Primary contact must be an active record in this household",
          );
        await query(
          "UPDATE church_households SET name=?,phone=?,email=?,address=?,primary_contact_id=?,version=version+1,updated_at=UTC_TIMESTAMP() WHERE id=?",
          [...Object.values(data), id],
          c,
        );
        await audit(
          req,
          "household",
          id,
          "household.update",
          Object.keys(data),
          c,
        );
      });
      res.json({
        household: view(
          await one("SELECT * FROM church_households WHERE id=?", [id]),
        ),
      });
    }),
  );
  router.post(
    "/households/:id/archive",
    permit("members"),
    route(async (req, res) => {
      const id = idOf(req.params.id),
        expected = revision(object(req.body));
      check(
        typeof req.body.archived === "boolean",
        400,
        "Choose archive or restore",
      );
      await transaction(async (c) => {
        const row = await one(
          "SELECT version FROM church_households WHERE id=? FOR UPDATE",
          [id],
          c,
        );
        check(row, 404, "Household not found");
        check(
          row.version === expected,
          409,
          "Reload this household before changing it",
        );
        if (req.body.archived)
          check(
            count(
              (
                await one(
                  "SELECT COUNT(*) n FROM church_members WHERE household_id=? AND archived_at IS NULL",
                  [id],
                  c,
                )
              ).n,
            ) === 0,
            409,
            "Move or archive the household members first",
          );
        await query(
          "UPDATE church_households SET archived_at=?,version=version+1,updated_at=UTC_TIMESTAMP() WHERE id=?",
          [req.body.archived ? utc() : null, id],
          c,
        );
        await audit(
          req,
          "household",
          id,
          req.body.archived ? "household.archive" : "household.restore",
          [],
          c,
        );
      });
      res.json({
        household: view(
          await one("SELECT * FROM church_households WHERE id=?", [id]),
        ),
      });
    }),
  );
  const sessionView = async (id, c) => {
    const row = await one("SELECT * FROM church_sessions WHERE id=?", [id], c);
    check(row, 404, "Service session not found");
    return view(row);
  };
  const sessionData = (b) => {
    const data = {
      title: required(b.title, 200, "Service title"),
      location: optional(b.location, 200),
      starts_at: instant(b.starts_at, "Start time"),
      ends_at: instant(b.ends_at, "End time"),
    };
    check(
      data.ends_at > data.starts_at,
      400,
      "End time must be after the start",
    );
    check(
      new Date(data.ends_at + "Z") - new Date(data.starts_at + "Z") <=
        7 * 864e5,
      400,
      "A session can last up to seven days",
    );
    return data;
  };
  const refreshRoster = (id, c) =>
    query(
      "INSERT IGNORE INTO church_roster(session_id,member_id,added_at) SELECT ?,id,UTC_TIMESTAMP() FROM church_members WHERE archived_at IS NULL AND membership_status<>'inactive'",
      [id],
      c,
    );
  // These callbacks contain only transactional SQL; a deadlock rollback is safe to retry.
  const attendanceTransaction = async (fn) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await transaction(fn);
      } catch (error) {
        if (error.code !== "ER_LOCK_DEADLOCK" || attempt >= 4) throw error;
        await new Promise((resolve) => setTimeout(resolve, 15 * 2 ** attempt));
      }
    }
  };
  const sessionStats = async (id) =>
    view(
      await one(
        "SELECT COUNT(*) roster_count,COALESCE(SUM(a.status='present'),0) present,COALESCE(SUM(a.status='late'),0) late,COALESCE(SUM(a.status='excused'),0) excused,COALESCE(SUM(a.status='absent'),0) absent,COALESCE(SUM(a.status IS NULL OR a.status='unmarked'),0) unmarked FROM church_roster r LEFT JOIN church_attendance a ON a.session_id=r.session_id AND a.member_id=r.member_id WHERE r.session_id=?",
        [id],
      ),
    );
  router.get(
    "/sessions",
    permit("attendance"),
    route(async (req, res) => {
      const { page, limit } = pageOf(req.query),
        args = [],
        conditions = [];
      if (req.query.state) {
        check(
          SESSION_STATES.includes(req.query.state),
          400,
          "Choose a valid session state",
        );
        conditions.push("s.state=?");
        args.push(req.query.state);
      }
      const where = conditions.length
        ? "WHERE " + conditions.join(" AND ")
        : "";
      const total = count(
        (await one(`SELECT COUNT(*) n FROM church_sessions s ${where}`, args))
          .n,
      );
      const rows = await query(
        `SELECT s.*,COALESCE(a.present,0) present,COALESCE(a.late,0) late,COALESCE(r.roster_count,0) roster_count FROM church_sessions s LEFT JOIN (SELECT session_id,SUM(status='present') present,SUM(status='late') late FROM church_attendance GROUP BY session_id) a ON a.session_id=s.id LEFT JOIN (SELECT session_id,COUNT(*) roster_count FROM church_roster GROUP BY session_id) r ON r.session_id=s.id ${where} ORDER BY s.starts_at DESC,s.id LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
        args,
      );
      res.json({ sessions: rows.map(view), total, page, limit });
    }),
  );
  router.post(
    "/sessions",
    permit("attendance_manage"),
    route(async (req, res) => {
      const id = randomUUID(),
        data = sessionData(object(req.body));
      await transaction(async (c) => {
        await query(
          "INSERT INTO church_sessions(id,title,location,starts_at,ends_at,created_at,updated_at) VALUES (?,?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())",
          [id, ...Object.values(data)],
          c,
        );
        await audit(req, "session", id, "session.create", Object.keys(data), c);
      });
      res.status(201).json({ session: await sessionView(id) });
    }),
  );
  router.get(
    "/sessions/:id",
    permit("attendance"),
    route(async (req, res) => {
      const id = idOf(req.params.id);
      res.json({
        session: await sessionView(id),
        stats: await sessionStats(id),
      });
    }),
  );
  router.put(
    "/sessions/:id",
    permit("attendance_manage"),
    route(async (req, res) => {
      const id = idOf(req.params.id),
        expected = revision(object(req.body)),
        data = sessionData(object(req.body));
      const guests = req.body.guest_count ?? 0;
      check(
        Number.isInteger(guests) && guests >= 0 && guests <= 100000,
        400,
        "Guest count must be a whole number from 0 to 100,000",
      );
      await transaction(async (c) => {
        const old = await one(
          "SELECT version,state,starts_at,ends_at FROM church_sessions WHERE id=? FOR UPDATE",
          [id],
          c,
        );
        check(old, 404, "Service session not found");
        check(
          old.version === expected,
          409,
          "Reload this session before saving",
        );
        check(
          ["scheduled", "open"].includes(old.state),
          409,
          "Reopen this register before editing its details or attendance totals",
        );
        await query(
          "UPDATE church_sessions SET title=?,location=?,starts_at=?,ends_at=?,guest_count=?,version=version+1,updated_at=UTC_TIMESTAMP() WHERE id=?",
          [...Object.values(data), guests, id],
          c,
        );
        if (
          utc(old.starts_at) !== data.starts_at ||
          utc(old.ends_at) !== data.ends_at
        )
          await query(
            "UPDATE church_checkin_settings SET enabled=0,updated_at=UTC_TIMESTAMP() WHERE session_id=?",
            [id],
            c,
          );
        await audit(
          req,
          "session",
          id,
          "session.update",
          [...Object.keys(data), "guest_count"],
          c,
        );
      });
      res.json({ session: await sessionView(id) });
    }),
  );
  router.post(
    "/sessions/:id/state",
    permit("attendance_manage"),
    route(async (req, res) => {
      const id = idOf(req.params.id),
        expected = revision(object(req.body)),
        state = req.body?.state;
      check(
        SESSION_STATES.includes(state),
        400,
        "Choose a valid session state",
      );
      await attendanceTransaction(async (c) => {
        const old = await one(
          "SELECT * FROM church_sessions WHERE id=? FOR UPDATE",
          [id],
          c,
        );
        check(old, 404, "Service session not found");
        check(
          old.version === expected,
          409,
          "Reload this session before changing its state",
        );
        if (state === old.state) return;
        check(
          !(state === "scheduled" && old.opened_at),
          409,
          "A previously opened session can be reopened, closed or cancelled",
        );
        if (state === "open" && !old.opened_at) await refreshRoster(id, c);
        await query(
          "UPDATE church_sessions SET state=?,opened_at=IF(?='open',COALESCE(opened_at,UTC_TIMESTAMP()),opened_at),version=version+1,updated_at=UTC_TIMESTAMP() WHERE id=?",
          [state, state, id],
          c,
        );
        await audit(req, "session", id, "session." + state, ["state"], c);
      });
      res.json({
        session: await sessionView(id),
        stats: await sessionStats(id),
      });
    }),
  );
  router.post(
    "/sessions/:id/roster/refresh",
    permit("attendance_manage"),
    route(async (req, res) => {
      const id = idOf(req.params.id);
      const added = await attendanceTransaction(async (c) => {
        const s = await one(
          "SELECT state FROM church_sessions WHERE id=? FOR UPDATE",
          [id],
          c,
        );
        check(s, 404, "Service session not found");
        check(
          s.state === "open",
          409,
          "Open this session before updating its roster",
        );
        const result = await refreshRoster(id, c);
        await audit(
          req,
          "session",
          id,
          "session.refresh_roster",
          ["added:" + result.affectedRows],
          c,
        );
        return result.affectedRows;
      });
      res.json({ added, stats: await sessionStats(id) });
    }),
  );
  router.get(
    "/sessions/:id/roster",
    permit("attendance"),
    route(async (req, res) => {
      const id = idOf(req.params.id);
      await sessionView(id);
      const { limit, page } = pageOf(req.query);
      const args = [id],
        conditions = ["r.session_id=?"];
      if (req.query.search) {
        conditions.push(
          "(m.first_name LIKE ? OR m.last_name LIKE ? OR m.preferred_name LIKE ? OR h.name LIKE ?)",
        );
        args.push(...Array(4).fill(like(req.query.search)));
      }
      if (req.query.mark) {
        check(
          [...ATTENDANCE, "unmarked"].includes(req.query.mark),
          400,
          "Choose a valid attendance filter",
        );
        if (req.query.mark === "unmarked")
          conditions.push("(a.status IS NULL OR a.status='unmarked')");
        else {
          conditions.push("a.status=?");
          args.push(req.query.mark);
        }
      }
      const join =
        "FROM church_roster r JOIN church_members m ON m.id=r.member_id LEFT JOIN church_households h ON h.id=m.household_id LEFT JOIN church_attendance a ON a.session_id=r.session_id AND a.member_id=r.member_id LEFT JOIN church_self_checkins ci ON ci.session_id=r.session_id AND ci.member_id=r.member_id";
      const total = count(
        (
          await one(
            `SELECT COUNT(*) n ${join} WHERE ${conditions.join(" AND ")}`,
            args,
          )
        ).n,
      );
      const rows = await query(
        `SELECT m.id,m.first_name,m.last_name,m.preferred_name,m.membership_status,m.archived_at,h.name AS household_name,a.status,a.checked_in_at,COALESCE(a.version,0) AS record_version,ci.checked_in_at AS self_checked_in_at ${join} WHERE ${conditions.join(" AND ")} ORDER BY m.last_name,m.first_name,m.id LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
        args,
      );
      res.json({
        roster: rows.map(memberView),
        total,
        page,
        limit,
        stats: await sessionStats(id),
      });
    }),
  );
  router.post(
    "/sessions/:id/attendance",
    permit("attendance"),
    route(async (req, res) => {
      const id = idOf(req.params.id),
        entries = Array.isArray(req.body?.entries)
          ? req.body.entries.map((e) => ({
              ...object(e),
              member_id: idOf(e?.member_id),
            }))
          : null;
      check(
        Array.isArray(entries) && entries.length > 0 && entries.length <= 200,
        400,
        "Save 1–200 attendance entries at a time",
      );
      const seen = new Set();
      for (const e of entries) {
        idOf(e?.member_id);
        check(
          !seen.has(e.member_id),
          400,
          "A member can appear only once in a batch",
        );
        seen.add(e.member_id);
        check(
          ATTENDANCE.includes(e.status),
          400,
          "Choose a valid attendance status",
        );
        check(
          Number.isSafeInteger(e.record_version) && e.record_version >= 0,
          428,
          "Reload attendance before saving",
        );
      }
      const changed = await attendanceTransaction(async (c) => {
        const session = await one(
          "SELECT state FROM church_sessions WHERE id=? FOR UPDATE",
          [id],
          c,
        );
        check(session, 404, "Service session not found");
        check(
          session.state === "open",
          409,
          "Reopen this session to edit attendance",
        );
        let changes = 0;
        for (const e of entries) {
          const member = await one(
            "SELECT m.id FROM church_roster r JOIN church_members m ON m.id=r.member_id WHERE r.session_id=? AND r.member_id=? AND m.archived_at IS NULL AND m.membership_status<>'inactive' FOR UPDATE",
            [id, e.member_id],
            c,
          );
          check(member, 409, "A selected member is not on the active roster");
          const old = await one(
            "SELECT * FROM church_attendance WHERE session_id=? AND member_id=? FOR UPDATE",
            [id, e.member_id],
            c,
          );
          if (old?.status === e.status || (!old && e.status === "unmarked"))
            continue;
          check(
            (old?.version || 0) === e.record_version,
            409,
            "Attendance changed in another window. Reload the register before saving.",
          );
          const arrival = ["present", "late"].includes(e.status)
            ? old?.checked_in_at || utc()
            : null;
          if (old)
            await query(
              "UPDATE church_attendance SET status=?,checked_in_at=?,recorded_by=?,recorded_at=UTC_TIMESTAMP(),version=version+1 WHERE session_id=? AND member_id=?",
              [
                e.status,
                arrival,
                req.staff.user_id || "shared-passkey",
                id,
                e.member_id,
              ],
              c,
            );
          else
            await query(
              "INSERT INTO church_attendance(session_id,member_id,status,checked_in_at,recorded_by,recorded_at) VALUES (?,?,?,?,?,UTC_TIMESTAMP())",
              [
                id,
                e.member_id,
                e.status,
                arrival,
                req.staff.user_id || "shared-passkey",
              ],
              c,
            );
          await audit(
            req,
            "attendance",
            e.member_id,
            "attendance.mark",
            [
              "session:" + id,
              "from:" + (old?.status || "unmarked"),
              "to:" + e.status,
            ],
            c,
          );
          changes++;
        }
        return changes;
      });
      res.json({ changed, stats: await sessionStats(id) });
    }),
  );
  router.get(
    "/members/:id/history",
    permit("members"),
    permit("attendance"),
    route(async (req, res) => {
      const id = idOf(req.params.id);
      check(await getMember(id), 404, "Member not found");
      const rows = await query(
        "SELECT s.id AS session_id,s.title,s.starts_at,s.state,a.status,a.checked_in_at,a.recorded_at FROM church_roster r JOIN church_sessions s ON s.id=r.session_id LEFT JOIN church_attendance a ON a.session_id=r.session_id AND a.member_id=r.member_id WHERE r.member_id=? ORDER BY s.starts_at DESC LIMIT 200",
        [id],
      );
      res.json({ history: rows.map(view) });
    }),
  );
  const reportRange = (q) => {
    const from = q.from
      ? instant(q.from, "Report start")
      : utc(new Date(Date.now() - 30 * 864e5));
    const to = q.to
      ? instant(q.to, "Report end")
      : utc(new Date(Date.now() + 864e5));
    check(
      to > from && new Date(to + "Z") - new Date(from + "Z") <= 366 * 864e5,
      400,
      "Choose a report range of up to 366 days",
    );
    return { from, to };
  };
  const reportRows = async (from, to) => {
    const rows = await query(
      "SELECT s.id,s.title,s.starts_at,s.state,s.guest_count,COUNT(r.member_id) roster_count,COALESCE(SUM(a.status='present'),0) present,COALESCE(SUM(a.status='late'),0) late,COALESCE(SUM(a.status='excused'),0) excused,COALESCE(SUM(a.status='absent'),0) absent,COALESCE(SUM(r.member_id IS NOT NULL AND (a.status IS NULL OR a.status='unmarked')),0) unmarked FROM church_sessions s LEFT JOIN church_roster r ON r.session_id=s.id LEFT JOIN church_attendance a ON a.session_id=r.session_id AND a.member_id=r.member_id WHERE s.starts_at>=? AND s.starts_at<? AND s.state IN ('open','closed') GROUP BY s.id,s.title,s.starts_at,s.state,s.guest_count ORDER BY s.starts_at DESC LIMIT 5001",
      [from, to],
    );
    check(
      rows.length <= 5000,
      422,
      "Narrow the report range to include at most 5,000 service sessions",
    );
    return rows;
  };
  router.get(
    "/reports/attendance",
    permit("reports"),
    route(async (req, res) => {
      const { from, to } = reportRange(req.query),
        rows = await reportRows(from, to);
      const sum = (key) => rows.reduce((n, r) => n + count(r[key]), 0);
      res.json({
        from,
        to,
        sessions: rows.map(view),
        summary: {
          sessions: rows.length,
          present: sum("present"),
          late: sum("late"),
          guests: sum("guest_count"),
          totalAttendance: sum("present") + sum("late") + sum("guest_count"),
          excused: sum("excused"),
          absent: sum("absent"),
          unmarked: sum("unmarked"),
        },
      });
    }),
  );
  router.get(
    "/reports/attendance/export",
    permit("reports"),
    route(async (req, res) => {
      const { from, to } = reportRange(req.query),
        rows = await reportRows(from, to),
        columns = [
          "title",
          "starts_at",
          "state",
          "roster_count",
          "present",
          "late",
          "guest_count",
          "excused",
          "absent",
          "unmarked",
        ];
      await audit(req, "report", randomUUID(), "attendance.export", [
        "from:" + from,
        "to:" + to,
      ]);
      res
        .set(
          "Content-Disposition",
          'attachment; filename="church-attendance.csv"',
        )
        .type("text/csv")
        .send(
          "\uFEFF" +
            [
              columns.map(csvCell).join(","),
              ...rows.map((row) =>
                columns
                  .map((key) =>
                    csvCell(
                      row[key] instanceof Date
                        ? row[key].toISOString()
                        : row[key],
                    ),
                  )
                  .join(","),
              ),
            ].join("\r\n"),
        );
    }),
  );
  const groupData = (body) => {
    const b = object(body);
    check(
      ["ministry", "small_group"].includes(b.kind),
      400,
      "Choose a ministry or small group",
    );
    return {
      name: required(b.name, 150, "Group name"),
      kind: b.kind,
      description: optional(b.description, 2000),
      location: optional(b.location, 200),
      meeting_details: optional(b.meeting_details, 300),
    };
  };
  const getGroup = (id, connection) =>
    one("SELECT * FROM church_groups WHERE id=?", [id], connection);
  const lockGroup = async (id, body, connection, allowArchived = false) => {
    const g = await one(
      "SELECT * FROM church_groups WHERE id=? FOR UPDATE",
      [id],
      connection,
    );
    check(g, 404, "Group not found");
    check(
      Number(g.version) === revision(body),
      409,
      "This group changed. Reload before saving",
    );
    check(
      allowArchived || !g.archived_at,
      409,
      "Restore this group before changing it",
    );
    return g;
  };
  router.get(
    "/groups",
    permit("members"),
    route(async (req, res) => {
      const { page, limit } = pageOf(req.query),
        args = [],
        conditions = [
          req.query.archived === "true"
            ? "g.archived_at IS NOT NULL"
            : "g.archived_at IS NULL",
        ];
      if (req.query.search) {
        conditions.push("g.name LIKE ?");
        args.push(like(req.query.search));
      }
      if (req.query.kind) {
        check(
          ["ministry", "small_group"].includes(req.query.kind),
          400,
          "Invalid group type",
        );
        conditions.push("g.kind=?");
        args.push(req.query.kind);
      }
      const where = conditions.join(" AND ");
      const rows = await query(
        `SELECT g.*,(SELECT COUNT(*) FROM church_group_members gm JOIN church_members m ON m.id=gm.member_id WHERE gm.group_id=g.id AND gm.left_at IS NULL AND m.archived_at IS NULL) member_count FROM church_groups g WHERE ${where} ORDER BY g.name,g.id LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
        args,
      );
      res.json({
        groups: rows.map(view),
        total: count(
          (
            await one(
              `SELECT COUNT(*) n FROM church_groups g WHERE ${where}`,
              args,
            )
          ).n,
        ),
        page,
        limit,
      });
    }),
  );
  router.post(
    "/groups",
    permit("members"),
    route(async (req, res) => {
      const data = groupData(req.body),
        id = randomUUID();
      await transaction(async (c) => {
        await query(
          "INSERT INTO church_groups(id,name,kind,description,location,meeting_details,created_at,updated_at) VALUES (?,?,?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())",
          [id, ...Object.values(data)],
          c,
        );
        await audit(req, "group", id, "group.created", Object.keys(data), c);
      });
      res.status(201).json({ group: view(await getGroup(id)) });
    }),
  );
  router.get(
    "/groups/:id",
    permit("members"),
    route(async (req, res) => {
      const id = idOf(req.params.id),
        g = await getGroup(id);
      check(g, 404, "Group not found");
      const { page, limit } = pageOf(req.query),
        args = [id];
      let where = "gm.group_id=? AND gm.left_at IS NULL";
      if (req.query.search) {
        where +=
          " AND CONCAT_WS(' ',m.first_name,m.last_name,m.preferred_name) LIKE ?";
        args.push(like(req.query.search));
      }
      const rows = await query(
        `SELECT m.id,m.first_name,m.last_name,m.preferred_name,m.membership_status,m.archived_at,gm.role,gm.joined_at FROM church_group_members gm JOIN church_members m ON m.id=gm.member_id WHERE ${where} ORDER BY gm.role='leader' DESC,m.last_name,m.first_name,m.id LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
        args,
      );
      res.json({
        group: view(g),
        members: rows.map(memberView),
        total: count(
          (
            await one(
              `SELECT COUNT(*) n FROM church_group_members gm JOIN church_members m ON m.id=gm.member_id WHERE ${where}`,
              args,
            )
          ).n,
        ),
        page,
        limit,
      });
    }),
  );
  router.put(
    "/groups/:id",
    permit("members"),
    route(async (req, res) => {
      const id = idOf(req.params.id),
        data = groupData(req.body);
      await transaction(async (c) => {
        await lockGroup(id, req.body, c);
        await query(
          "UPDATE church_groups SET name=?,kind=?,description=?,location=?,meeting_details=?,version=version+1,updated_at=UTC_TIMESTAMP() WHERE id=?",
          [...Object.values(data), id],
          c,
        );
        await audit(req, "group", id, "group.updated", Object.keys(data), c);
      });
      res.json({ group: view(await getGroup(id)) });
    }),
  );
  router.post(
    "/groups/:id/archive",
    permit("members"),
    route(async (req, res) => {
      const id = idOf(req.params.id),
        b = object(req.body);
      check(typeof b.archived === "boolean", 400, "Choose archive or restore");
      await transaction(async (c) => {
        await lockGroup(id, b, c, true);
        await query(
          "UPDATE church_groups SET archived_at=?,version=version+1,updated_at=UTC_TIMESTAMP() WHERE id=?",
          [b.archived ? utc() : null, id],
          c,
        );
        await audit(
          req,
          "group",
          id,
          b.archived ? "group.archived" : "group.restored",
          [],
          c,
        );
      });
      res.json({ group: view(await getGroup(id)) });
    }),
  );
  router.put(
    "/groups/:id/members/:memberId",
    permit("members"),
    route(async (req, res) => {
      const id = idOf(req.params.id),
        memberId = idOf(req.params.memberId),
        b = object(req.body);
      check(
        ["member", "leader", "removed"].includes(b.role),
        400,
        "Invalid group role",
      );
      await transaction(async (c) => {
        await lockGroup(id, b, c);
        const m = await one(
          "SELECT id,archived_at FROM church_members WHERE id=? FOR UPDATE",
          [memberId],
          c,
        );
        check(m, 404, "Member not found");
        const previous = await one(
          "SELECT * FROM church_group_members WHERE group_id=? AND member_id=?",
          [id, memberId],
          c,
        );
        if (b.role === "removed") {
          check(
            previous && !previous.left_at,
            404,
            "Person is not on this roster",
          );
          await query(
            "UPDATE church_group_members SET left_at=UTC_TIMESTAMP() WHERE group_id=? AND member_id=?",
            [id, memberId],
            c,
          );
        } else {
          check(
            !m.archived_at,
            409,
            "Restore this member before assigning a group",
          );
          await query(
            "INSERT INTO church_group_members(group_id,member_id,role,joined_at) VALUES (?,?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE role=VALUES(role),joined_at=IF(left_at IS NULL,joined_at,UTC_TIMESTAMP()),left_at=NULL",
            [id, memberId, b.role],
            c,
          );
        }
        await query(
          "UPDATE church_groups SET version=version+1,updated_at=UTC_TIMESTAMP() WHERE id=?",
          [id],
          c,
        );
        await audit(
          req,
          "group",
          id,
          "group.roster.updated",
          ["member:" + memberId, "role:" + b.role],
          c,
        );
      });
      res.json({ group: view(await getGroup(id)) });
    }),
  );
  const SHIFT_STATES = ["scheduled", "completed", "cancelled"];
  const VOLUNTEER_STATUSES = [
    "assigned",
    "confirmed",
    "declined",
    "served",
    "no_show",
    "removed",
  ];
  const reserved = (status) =>
    ["assigned", "confirmed", "served", "no_show"].includes(status);
  const reservationSql = "('assigned','confirmed','served','no_show')";
  const shiftColumns =
    "s.*,g.name AS group_name,g.archived_at AS group_archived_at";
  const assignmentStats = `SELECT shift_id,SUM(status IN ${reservationSql}) AS filled_count,SUM(status='served') AS served_count,SUM(status='declined') AS declined_count,SUM(status='no_show') AS no_show_count FROM church_volunteer_assignments GROUP BY shift_id`;
  const getShift = (id, c) =>
    one(
      `SELECT ${shiftColumns},COALESCE(a.filled_count,0) filled_count,COALESCE(a.served_count,0) served_count,COALESCE(a.declined_count,0) declined_count,COALESCE(a.no_show_count,0) no_show_count FROM church_volunteer_shifts s JOIN church_groups g ON g.id=s.group_id LEFT JOIN (${assignmentStats}) a ON a.shift_id=s.id WHERE s.id=?`,
      [id],
      c,
    );
  const shiftData = (body) => {
    const b = object(body);
    for (const key of ["starts_at", "ends_at"]) {
      check(typeof b[key] === "string", 400, "Enter a shift date and time");
      dateOnly(b[key].slice(0, 10), "Shift date");
      check(
        /T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(
          b[key],
        ),
        400,
        "Enter a valid shift time and timezone",
      );
    }
    const starts_at = instant(b.starts_at, "Shift start"),
      ends_at = instant(b.ends_at, "Shift end");
    check(
      starts_at >= "1900-01-01" &&
        ends_at > starts_at &&
        new Date(ends_at + "Z") - new Date(starts_at + "Z") <= 7 * 864e5,
      400,
      "Choose an end after the start, with a shift lasting up to seven days",
    );
    check(
      Number.isSafeInteger(b.capacity) && b.capacity >= 1 && b.capacity <= 500,
      400,
      "Choose between 1 and 500 volunteer places",
    );
    return {
      group_id: idOf(b.group_id),
      title: required(b.title, 200, "Shift title"),
      role_label: required(b.role_label, 120, "Volunteer role"),
      location: optional(b.location, 200),
      instructions: optional(b.instructions, 2000),
      starts_at,
      ends_at,
      capacity: b.capacity,
    };
  };
  const schedulerWrite = (fn) =>
    transaction(async (c) => {
      const mutex = await one(
        "SELECT id FROM church_schedule_lock WHERE id=1 FOR UPDATE",
        [],
        c,
      );
      check(mutex, 503, "Volunteer scheduling is not initialized");
      return fn(c);
    });
  const shiftForWrite = async (id, body, c) => {
    const s = await one(
      "SELECT * FROM church_volunteer_shifts WHERE id=? FOR UPDATE",
      [id],
      c,
    );
    check(s, 404, "Shift not found");
    check(
      Number(s.version) === revision(object(body)),
      409,
      "This shift changed. Reopen it before saving",
    );
    const g = await one(
      "SELECT * FROM church_groups WHERE id=? FOR UPDATE",
      [s.group_id],
      c,
    );
    return { s, g };
  };
  const checkOverlap = async (memberId, shift, c) => {
    const other = await one(
      `SELECT s.title FROM church_volunteer_assignments a JOIN church_volunteer_shifts s ON s.id=a.shift_id WHERE a.member_id=? AND a.status IN ${reservationSql} AND s.state<>'cancelled' AND s.id<>? AND s.starts_at<? AND s.ends_at>? LIMIT 1`,
      [memberId, shift.id, shift.ends_at, shift.starts_at],
      c,
    );
    check(
      !other,
      409,
      `This person already has an overlapping shift${other ? ": " + other.title : ""}`,
    );
  };
  const checkShiftReservations = async (shift, c) => {
    const rows = await query(
      `SELECT member_id FROM church_volunteer_assignments WHERE shift_id=? AND status IN ${reservationSql}`,
      [shift.id],
      c,
    );
    check(
      rows.length <= Number(shift.capacity),
      409,
      "Capacity cannot be lower than the reserved places",
    );
    for (const row of rows) await checkOverlap(row.member_id, shift, c);
  };
  router.get(
    "/shifts",
    permit("members"),
    route(async (req, res) => {
      const { page, limit } = pageOf(req.query),
        conditions = ["1=1"],
        args = [];
      if (req.query.state) {
        check(
          SHIFT_STATES.includes(req.query.state),
          400,
          "Invalid shift state",
        );
        conditions.push("s.state=?");
        args.push(req.query.state);
      }
      if (req.query.group_id) {
        conditions.push("s.group_id=?");
        args.push(idOf(req.query.group_id));
      }
      if (req.query.search) {
        conditions.push(
          "(s.title LIKE ? OR s.role_label LIKE ? OR g.name LIKE ?)",
        );
        args.push(...Array(3).fill(like(req.query.search)));
      }
      if (req.query.from || req.query.to) {
        check(
          req.query.from && req.query.to,
          400,
          "Choose both start and end dates",
        );
        const { from, to } = reportRange(req.query);
        conditions.push("s.starts_at>=? AND s.starts_at<?");
        args.push(from, to);
      }
      const where = conditions.join(" AND ");
      const rows = await query(
        `SELECT ${shiftColumns},COALESCE(a.filled_count,0) filled_count,COALESCE(a.served_count,0) served_count,COALESCE(a.declined_count,0) declined_count,COALESCE(a.no_show_count,0) no_show_count FROM church_volunteer_shifts s JOIN church_groups g ON g.id=s.group_id LEFT JOIN (${assignmentStats}) a ON a.shift_id=s.id WHERE ${where} ORDER BY s.starts_at DESC,s.id LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
        args,
      );
      res.json({
        shifts: rows.map(view),
        total: count(
          (
            await one(
              `SELECT COUNT(*) n FROM church_volunteer_shifts s JOIN church_groups g ON g.id=s.group_id WHERE ${where}`,
              args,
            )
          ).n,
        ),
        page,
        limit,
      });
    }),
  );
  router.post(
    "/shifts",
    permit("members"),
    route(async (req, res) => {
      const data = shiftData(req.body),
        id = randomUUID();
      await schedulerWrite(async (c) => {
        const g = await one(
          "SELECT * FROM church_groups WHERE id=? FOR UPDATE",
          [data.group_id],
          c,
        );
        check(g, 404, "Group not found");
        check(
          !g.archived_at,
          409,
          "Restore this group before scheduling a shift",
        );
        await query(
          "INSERT INTO church_volunteer_shifts(id,group_id,title,role_label,location,instructions,starts_at,ends_at,capacity,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())",
          [id, ...Object.values(data)],
          c,
        );
        await audit(req, "shift", id, "shift.created", Object.keys(data), c);
      });
      res.status(201).json({ shift: view(await getShift(id)) });
    }),
  );
  router.get(
    "/shifts/:id",
    permit("members"),
    route(async (req, res) => {
      const id = idOf(req.params.id),
        s = await getShift(id);
      check(s, 404, "Shift not found");
      const { page, limit } = pageOf(req.query);
      const assignments = await query(
        `SELECT m.id,m.first_name,m.last_name,m.preferred_name,m.archived_at,m.membership_status,a.status,a.assigned_at,a.updated_at,gm.left_at AS group_left_at FROM church_volunteer_assignments a JOIN church_members m ON m.id=a.member_id LEFT JOIN church_group_members gm ON gm.group_id=? AND gm.member_id=m.id WHERE a.shift_id=? AND a.status<>'removed' ORDER BY m.last_name,m.first_name,m.id LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
        [s.group_id, id],
      );
      res.json({
        shift: view(s),
        assignments: assignments.map(memberView),
        total: count(
          (
            await one(
              "SELECT COUNT(*) n FROM church_volunteer_assignments WHERE shift_id=? AND status<>'removed'",
              [id],
            )
          ).n,
        ),
        page,
        limit,
      });
    }),
  );
  router.get(
    "/shifts/:id/candidates",
    permit("members"),
    route(async (req, res) => {
      const id = idOf(req.params.id),
        s = await getShift(id);
      check(s, 404, "Shift not found");
      check(
        s.state === "scheduled" && !s.group_archived_at,
        409,
        "Reopen the shift and restore its group before assigning people",
      );
      const { page, limit } = pageOf(req.query),
        args = [id, s.group_id],
        where = [
          "gm.group_id=?",
          "gm.left_at IS NULL",
          "m.archived_at IS NULL",
          "(a.status IS NULL OR a.status IN ('declined','removed'))",
        ];
      if (req.query.search) {
        where.push(
          "CONCAT_WS(' ',m.first_name,m.last_name,m.preferred_name) LIKE ?",
        );
        args.push(like(req.query.search));
      }
      const from = `FROM church_group_members gm JOIN church_members m ON m.id=gm.member_id LEFT JOIN church_households h ON h.id=m.household_id LEFT JOIN church_volunteer_assignments a ON a.member_id=m.id AND a.shift_id=? WHERE ${where.join(" AND ")}`;
      const rows = await query(
        `SELECT m.id,m.first_name,m.last_name,m.preferred_name,m.email,h.name AS household_name,gm.role ${from} ORDER BY m.last_name,m.first_name,m.id LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
        args,
      );
      res.json({
        members: rows.map(memberView),
        total: count((await one("SELECT COUNT(*) n " + from, args)).n),
        page,
        limit,
      });
    }),
  );
  router.put(
    "/shifts/:id",
    permit("members"),
    route(async (req, res) => {
      const id = idOf(req.params.id),
        data = shiftData(req.body);
      await schedulerWrite(async (c) => {
        const { s, g } = await shiftForWrite(id, req.body, c);
        check(
          s.state === "scheduled",
          409,
          "Reopen this shift before editing it",
        );
        check(
          !g.archived_at,
          409,
          "Restore this group before editing its shift",
        );
        check(
          s.group_id === data.group_id,
          400,
          "A shift cannot be moved to another group",
        );
        await checkShiftReservations({ id, ...data }, c);
        await query(
          "UPDATE church_volunteer_shifts SET title=?,role_label=?,location=?,instructions=?,starts_at=?,ends_at=?,capacity=?,version=version+1,updated_at=UTC_TIMESTAMP() WHERE id=?",
          [
            data.title,
            data.role_label,
            data.location,
            data.instructions,
            data.starts_at,
            data.ends_at,
            data.capacity,
            id,
          ],
          c,
        );
        await audit(
          req,
          "shift",
          id,
          "shift.updated",
          Object.keys(data).filter((k) => k !== "group_id"),
          c,
        );
      });
      res.json({ shift: view(await getShift(id)) });
    }),
  );
  router.post(
    "/shifts/:id/state",
    permit("members"),
    route(async (req, res) => {
      const id = idOf(req.params.id),
        b = object(req.body);
      check(SHIFT_STATES.includes(b.state), 400, "Choose a valid shift state");
      await schedulerWrite(async (c) => {
        const { s, g } = await shiftForWrite(id, b, c);
        check(
          s.state === "scheduled" || b.state === "scheduled",
          409,
          "Reopen this shift before changing its state",
        );
        if (b.state === "scheduled") {
          check(
            !g.archived_at,
            409,
            "Restore this group before reopening its shift",
          );
          await checkShiftReservations(s, c);
        }
        await query(
          "UPDATE church_volunteer_shifts SET state=?,version=version+1,updated_at=UTC_TIMESTAMP() WHERE id=?",
          [b.state, id],
          c,
        );
        await audit(req, "shift", id, "shift.state", ["state:" + b.state], c);
      });
      res.json({ shift: view(await getShift(id)) });
    }),
  );
  router.put(
    "/shifts/:id/assignments/:memberId",
    permit("members"),
    route(async (req, res) => {
      const id = idOf(req.params.id),
        memberId = idOf(req.params.memberId),
        b = object(req.body);
      check(
        VOLUNTEER_STATUSES.includes(b.status),
        400,
        "Choose a valid volunteer status",
      );
      await schedulerWrite(async (c) => {
        const { s, g } = await shiftForWrite(id, b, c);
        check(
          s.state === "scheduled",
          409,
          "Reopen this shift before changing assignments",
        );
        const m = await one(
          "SELECT id,archived_at FROM church_members WHERE id=? FOR UPDATE",
          [memberId],
          c,
        );
        check(m, 404, "Member not found");
        const old = await one(
          "SELECT * FROM church_volunteer_assignments WHERE shift_id=? AND member_id=?",
          [id, memberId],
          c,
        );
        if (reserved(b.status)) {
          check(
            !g.archived_at && !m.archived_at,
            409,
            "Restore the group and member before assigning them",
          );
          if (!old || !reserved(old.status)) {
            const membership = await one(
              "SELECT * FROM church_group_members WHERE group_id=? AND member_id=? AND left_at IS NULL",
              [s.group_id, memberId],
              c,
            );
            check(
              membership,
              409,
              "Add this person to the group roster before assigning them",
            );
            const filled = count(
              (
                await one(
                  `SELECT COUNT(*) n FROM church_volunteer_assignments WHERE shift_id=? AND status IN ${reservationSql}`,
                  [id],
                  c,
                )
              ).n,
            );
            check(filled < Number(s.capacity), 409, "This shift is full");
          }
          await checkOverlap(memberId, s, c);
        } else
          check(
            old && old.status !== "removed",
            404,
            "Volunteer assignment not found",
          );
        if (old?.status === b.status) return;
        await query(
          "INSERT INTO church_volunteer_assignments(shift_id,member_id,status,assigned_at,updated_at) VALUES (?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE status=VALUES(status),updated_at=UTC_TIMESTAMP()",
          [id, memberId, b.status],
          c,
        );
        await query(
          "UPDATE church_volunteer_shifts SET version=version+1,updated_at=UTC_TIMESTAMP() WHERE id=?",
          [id],
          c,
        );
        await audit(
          req,
          "shift",
          id,
          "shift.assignment",
          ["member:" + memberId, "status:" + b.status],
          c,
        );
      });
      res.json({ shift: view(await getShift(id)) });
    }),
  );
  router.get(
    "/shifts/:id/export",
    permit("members"),
    route(async (req, res) => {
      const id = idOf(req.params.id),
        s = await getShift(id);
      check(s, 404, "Shift not found");
      const rows = await query(
        "SELECT CONCAT_WS(' ',m.first_name,m.last_name) AS name,a.status,m.archived_at FROM church_volunteer_assignments a JOIN church_members m ON m.id=a.member_id WHERE a.shift_id=? AND a.status<>'removed' ORDER BY m.last_name,m.first_name,m.id LIMIT 10001",
        [id],
      );
      check(rows.length <= 10000, 422, "This roster is too large to export");
      await audit(req, "shift", id, "shift.export", [], undefined);
      const fields = [
        "Shift",
        "Group",
        "Role",
        "Starts (UTC)",
        "Ends (UTC)",
        "Location",
        "Shift state",
        "Person",
        "Assignment status",
        "Archived member",
      ];
      res
        .set(
          "Content-Disposition",
          'attachment; filename="church-volunteer-roster.csv"',
        )
        .type("text/csv")
        .send(
          "\uFEFF" +
            [
              fields.map(csvCell).join(","),
              ...rows.map((r) =>
                [
                  s.title,
                  s.group_name,
                  s.role_label,
                  view(s).starts_at,
                  view(s).ends_at,
                  s.location,
                  s.state,
                  r.name,
                  r.status,
                  r.archived_at ? "Yes" : "No",
                ]
                  .map(csvCell)
                  .join(","),
              ),
            ].join("\r\n"),
        );
    }),
  );
  router.get(
    "/activity",
    permit("members"),
    route(async (req, res) => {
      const { page, limit } = pageOf(req.query);
      const rows = await query(
        `SELECT a.*,COALESCE(p.display_name,u.email,CASE WHEN a.actor_id IS NULL THEN 'Shared passkey' WHEN a.actor_id LIKE 'member:%' THEN 'Member self check-in' ELSE 'Former staff' END) AS actor_name,CASE WHEN m.id IS NOT NULL THEN CONCAT_WS(' ',m.first_name,m.last_name) ELSE COALESCE(h.name,s.title,g.name,vs.title) END AS record_name FROM church_activity a LEFT JOIN node_staff_profiles p ON p.user_id COLLATE utf8mb4_unicode_ci=a.actor_id LEFT JOIN admin_users u ON CAST(u.id AS CHAR) COLLATE utf8mb4_unicode_ci=a.actor_id LEFT JOIN church_members m ON m.id=a.entity_id AND a.entity_type IN ('member','attendance') LEFT JOIN church_households h ON h.id=a.entity_id AND a.entity_type='household' LEFT JOIN church_sessions s ON s.id=a.entity_id AND a.entity_type='session' LEFT JOIN church_groups g ON g.id=a.entity_id AND a.entity_type='group' LEFT JOIN church_volunteer_shifts vs ON vs.id=a.entity_id AND a.entity_type='shift' ORDER BY a.id DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
      );
      res.json({
        activity: rows.map((r) => ({
          ...view(r),
          changed_fields: JSON.parse(r.changed_fields || "[]"),
        })),
        total: count((await one("SELECT COUNT(*) n FROM church_activity")).n),
        page,
        limit,
      });
    }),
  );
  const checkinConfig = async (id) => {
    const session = await sessionView(id),
      c = await one(
        "SELECT enabled,opens_at,closes_at FROM church_checkin_settings WHERE session_id=?",
        [id],
      );
    return {
      session,
      configuration: c
        ? {
            enabled: Boolean(c.enabled),
            opens_at: view(c).opens_at,
            closes_at: view(c).closes_at,
          }
        : null,
      public_accounts_enabled:
        process.env.PAI_PUBLIC_ACCOUNTS_ENABLED === "true",
    };
  };
  router.get(
    "/sessions/:id/check-in",
    permit("attendance_manage"),
    route(async (req, res) =>
      res.json(await checkinConfig(idOf(req.params.id))),
    ),
  );
  router.put(
    "/sessions/:id/check-in",
    permit("attendance_manage"),
    route(async (req, res) => {
      const id = idOf(req.params.id),
        b = object(req.body);
      check(
        typeof b.enabled === "boolean",
        400,
        "Choose whether member check-in is enabled",
      );
      let code = null;
      await transaction(async (c) => {
        const s = await one(
          "SELECT * FROM church_sessions WHERE id=? FOR UPDATE",
          [id],
          c,
        );
        check(s, 404, "Service session not found");
        check(
          Number(s.version) === revision(b),
          409,
          "This session changed. Reload before configuring check-in",
        );
        check(
          ["scheduled", "open"].includes(s.state),
          409,
          "Reopen the register before changing check-in settings",
        );
        if (b.enabled) {
          const opens = instant(b.opens_at, "Check-in opening"),
            closes = instant(b.closes_at, "Check-in closing");
          check(
            closes > opens &&
              new Date(closes + "Z") - new Date(opens + "Z") <= 24 * 36e5,
            400,
            "Check-in needs a window of up to 24 hours",
          );
          check(
            new Date(opens + "Z") >=
              new Date(s.starts_at.getTime() - 24 * 36e5) &&
              new Date(closes + "Z") <= s.ends_at,
            400,
            "Check-in must open within 24 hours before the service and close by its end",
          );
          code = randomBytes(4).toString("hex").toUpperCase();
          await query(
            "INSERT INTO church_checkin_settings(session_id,enabled,opens_at,closes_at,code_hash,updated_at) VALUES (?,1,?,?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE enabled=1,opens_at=VALUES(opens_at),closes_at=VALUES(closes_at),code_hash=VALUES(code_hash),updated_at=UTC_TIMESTAMP()",
            [id, opens, closes, hash(code)],
            c,
          );
        } else
          await query(
            "UPDATE church_checkin_settings SET enabled=0,updated_at=UTC_TIMESTAMP() WHERE session_id=?",
            [id],
            c,
          );
        await query(
          "UPDATE church_sessions SET version=version+1,updated_at=UTC_TIMESTAMP() WHERE id=?",
          [id],
          c,
        );
        await audit(
          req,
          "session",
          id,
          b.enabled ? "session.checkin_enabled" : "session.checkin_disabled",
          ["enabled", "window", "code_rotated"],
          c,
        );
      });
      res.json({
        ...(await checkinConfig(id)),
        ...(code ? { code } : {}),
        member_path: "/member?session=" + id,
      });
    }),
  );
  const linkedMember = (accountId, c, lock = false) =>
    one(
      "SELECT id,first_name,last_name,preferred_name,membership_status,archived_at FROM church_members WHERE account_id=?" +
        (lock ? " FOR UPDATE" : ""),
      [String(accountId)],
      c,
    );
  const eligibleMember = (m) =>
    m && !m.archived_at && m.membership_status !== "inactive";
  memberRouter.use(
    route(async (req, res, next) => {
      check(
        req.publicAccount?.roles?.includes("member"),
        403,
        "An approved member account is required",
      );
      next();
    }),
  );
  memberRouter.get(
    "/dashboard",
    route(async (req, res) => {
      const m = await linkedMember(req.publicAccount.id);
      if (!eligibleMember(m))
        return res.json({
          linked: false,
          message:
            "Ask a church registrar to link your approved account to your current member record.",
          sessions: [],
          history: [],
        });
      const rows = await query(
        "SELECT s.id,s.title,s.location,s.starts_at,s.ends_at,s.state,c.opens_at,c.closes_at,a.status,a.checked_in_at,(c.opens_at<=UTC_TIMESTAMP() AND c.closes_at>UTC_TIMESTAMP()) AS window_open FROM church_sessions s JOIN church_checkin_settings c ON c.session_id=s.id LEFT JOIN church_attendance a ON a.session_id=s.id AND a.member_id=? WHERE c.enabled=1 AND c.closes_at>UTC_TIMESTAMP() AND s.state IN ('scheduled','open') ORDER BY s.starts_at,s.id LIMIT 101",
        [m.id],
      );
      const history = await query(
        "SELECT s.id,s.title,s.starts_at,a.status,a.checked_in_at FROM church_attendance a JOIN church_sessions s ON s.id=a.session_id WHERE a.member_id=? ORDER BY s.starts_at DESC,s.id DESC LIMIT 25",
        [m.id],
      );
      res.json({
        linked: true,
        member: { name: memberView(m).name },
        server_time: (
          await one("SELECT UTC_TIMESTAMP() AS server_now")
        ).server_now.toISOString(),
        has_more: rows.length > 100,
        sessions: rows.slice(0, 100).map((r) => ({
          ...view(r),
          window_open: Boolean(Number(r.window_open)),
          checked_in: ["present", "late"].includes(r.status),
        })),
        history: history.map(view),
      });
    }),
  );
  memberRouter.post(
    "/sessions/:id/check-in",
    route(async (req, res) => {
      const id = idOf(req.params.id),
        accountId = String(req.publicAccount.id),
        b = object(req.body);
      // Counter commits separately so rejected codes cannot roll back their own limit.
      await query(
        "INSERT INTO church_checkin_limits(account_id,bucket_started_at,attempts) VALUES (?,UTC_TIMESTAMP(),1) ON DUPLICATE KEY UPDATE attempts=IF(bucket_started_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 15 MINUTE),1,LEAST(attempts+1,13)),bucket_started_at=IF(bucket_started_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 15 MINUTE),UTC_TIMESTAMP(),bucket_started_at)",
        [accountId],
      );
      const limit = await one(
        "SELECT attempts FROM church_checkin_limits WHERE account_id=?",
        [accountId],
      );
      if (Number(limit.attempts) > 12) {
        res.set("Retry-After", "900");
        check(
          false,
          429,
          "Too many check-in attempts. Ask an usher for help or try again in 15 minutes",
        );
      }
      const code = clean(b.code, 32).toUpperCase();
      check(
        /^[0-9A-F]{8}$/.test(code),
        400,
        "Enter the eight-character check-in code shown at the service",
      );
      const receipt = await attendanceTransaction(async (c) => {
        const s = await one(
          "SELECT * FROM church_sessions WHERE id=? FOR UPDATE",
          [id],
          c,
        );
        check(s, 404, "Service not found");
        const m = await linkedMember(accountId, c, true);
        check(
          eligibleMember(m),
          403,
          "Ask a registrar to link your account to a current member record",
        );
        const config = await one(
          "SELECT *,UTC_TIMESTAMP() AS server_now FROM church_checkin_settings WHERE session_id=?",
          [id],
          c,
        );
        check(
          config?.enabled && ["scheduled", "open"].includes(s.state),
          409,
          "Member check-in is closed for this service. Please ask an usher",
        );
        check(
          config.server_now >= config.opens_at &&
            config.server_now < config.closes_at,
          409,
          "Check-in is outside the scheduled window. Please ask an usher",
        );
        check(
          timingSafeEqual(
            Buffer.from(hash(code)),
            Buffer.from(config.code_hash),
          ),
          403,
          "That check-in code is not valid. Use the current code shown at the service",
        );
        const old = await one(
          "SELECT * FROM church_attendance WHERE session_id=? AND member_id=? FOR UPDATE",
          [id, m.id],
          c,
        );
        if (old && ["present", "late"].includes(old.status))
          return {
            status: old.status,
            checked_in_at: view(old).checked_in_at,
            already_checked_in: true,
          };
        check(
          !old || old.status === "unmarked",
          409,
          "A staff attendance mark is already recorded. Please ask an usher to review it",
        );
        if (s.state === "scheduled") {
          await refreshRoster(id, c);
          await query(
            "UPDATE church_sessions SET state='open',opened_at=COALESCE(opened_at,UTC_TIMESTAMP()),version=version+1,updated_at=UTC_TIMESTAMP() WHERE id=?",
            [id],
            c,
          );
        }
        await query(
          "INSERT IGNORE INTO church_roster(session_id,member_id,added_at) VALUES (?,?,UTC_TIMESTAMP())",
          [id, m.id],
          c,
        );
        const previous = await one(
            "SELECT checked_in_at FROM church_self_checkins WHERE session_id=? AND member_id=?",
            [id, m.id],
            c,
          ),
          arrival = previous?.checked_in_at || config.server_now;
        await query(
          "INSERT INTO church_attendance(session_id,member_id,status,checked_in_at,recorded_by,recorded_at) VALUES (?,?,'present',?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE status='present',checked_in_at=VALUES(checked_in_at),recorded_by=VALUES(recorded_by),recorded_at=UTC_TIMESTAMP(),version=version+1",
          [id, m.id, arrival, "member:" + accountId],
          c,
        );
        await query(
          "INSERT IGNORE INTO church_self_checkins(session_id,member_id,account_id,checked_in_at) VALUES (?,?,?,?)",
          [id, m.id, accountId, arrival],
          c,
        );
        await query(
          "INSERT INTO church_activity(actor_id,entity_type,entity_id,action,changed_fields,created_at) VALUES (?,?,?,?,?,UTC_TIMESTAMP())",
          [
            "member:" + accountId,
            "attendance",
            m.id,
            "attendance.self_checkin",
            JSON.stringify(["session:" + id]),
          ],
          c,
        );
        return {
          status: "present",
          checked_in_at: arrival.toISOString(),
          already_checked_in: false,
        };
      });
      res.json({
        receipt: { ...receipt, session_id: id },
        message: "You are checked in. Welcome!",
      });
    }),
  );
  const initialize = async () => {
    for (const migration of [
      "006_church_management.sql",
      "007_church_groups.sql",
      "008_church_volunteers.sql",
      "009_church_member_checkin.sql",
    ]) {
      const sql = await readFile(
        new URL("./migrations/" + migration, import.meta.url),
        "utf8",
      );
      for (const statement of sql
        .replace(/^--.*$/gm, "")
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean))
        await store.db.query(statement);
    }
  };
  return { router, memberRouter, initialize };
}
