import { Router } from "express";
import { randomUUID } from "node:crypto";
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
          "SELECT version,state FROM church_sessions WHERE id=? FOR UPDATE",
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
      await transaction(async (c) => {
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
      const added = await transaction(async (c) => {
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
        "FROM church_roster r JOIN church_members m ON m.id=r.member_id LEFT JOIN church_households h ON h.id=m.household_id LEFT JOIN church_attendance a ON a.session_id=r.session_id AND a.member_id=r.member_id";
      const total = count(
        (
          await one(
            `SELECT COUNT(*) n ${join} WHERE ${conditions.join(" AND ")}`,
            args,
          )
        ).n,
      );
      const rows = await query(
        `SELECT m.id,m.first_name,m.last_name,m.preferred_name,m.membership_status,m.archived_at,h.name AS household_name,a.status,a.checked_in_at,COALESCE(a.version,0) AS record_version ${join} WHERE ${conditions.join(" AND ")} ORDER BY m.last_name,m.first_name,m.id LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
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
      const changed = await transaction(async (c) => {
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
  router.get(
    "/activity",
    permit("members"),
    route(async (req, res) => {
      const { page, limit } = pageOf(req.query);
      const rows = await query(
        `SELECT a.*,COALESCE(p.display_name,u.email,IF(a.actor_id IS NULL,'Shared passkey','Former staff')) AS actor_name,CASE WHEN m.id IS NOT NULL THEN CONCAT_WS(' ',m.first_name,m.last_name) ELSE COALESCE(h.name,s.title) END AS record_name FROM church_activity a LEFT JOIN node_staff_profiles p ON p.user_id COLLATE utf8mb4_unicode_ci=a.actor_id LEFT JOIN admin_users u ON CAST(u.id AS CHAR) COLLATE utf8mb4_unicode_ci=a.actor_id LEFT JOIN church_members m ON m.id=a.entity_id AND a.entity_type IN ('member','attendance') LEFT JOIN church_households h ON h.id=a.entity_id AND a.entity_type='household' LEFT JOIN church_sessions s ON s.id=a.entity_id AND a.entity_type='session' ORDER BY a.id DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
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
  const initialize = async () => {
    const sql = await readFile(
      new URL("./migrations/006_church_management.sql", import.meta.url),
      "utf8",
    );
    for (const statement of sql
      .replace(/^--.*$/gm, "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean))
      await store.db.query(statement);
  };
  return { router, initialize };
}
