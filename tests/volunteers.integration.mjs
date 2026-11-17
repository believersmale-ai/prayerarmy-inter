import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
export async function runVolunteerIntegration({ church, roles, db }) {
  await church("/shifts", { cookie: "", expected: 401 });
  for (const role of ["usher", "care", "media", "editor"])
    await church("/shifts", { cookie: roles[role], expected: 403 });
  let group = (
    await church("/groups", {
      method: "POST",
      body: { name: "Volunteer test ministry", kind: "ministry" },
      expected: 201,
    })
  ).data.group;
  const people = [];
  for (const name of [
    "=Volunteer A",
    "Volunteer B",
    "Volunteer C",
    "Outside group",
  ]) {
    people.push(
      (
        await church("/members", {
          method: "POST",
          body: { first_name: name },
          expected: 201,
        })
      ).data.member,
    );
  }
  for (const m of people.slice(0, 3))
    group = (
      await church(`/groups/${group.id}/members/${m.id}`, {
        method: "PUT",
        body: { version: group.version, role: "member" },
      })
    ).data.group;
  const payload = {
    group_id: group.id,
    title: "=Morning welcome",
    role_label: "Greeter",
    location: "North entrance",
    instructions: "Welcome visitors kindly.",
    starts_at: "2030-06-09T08:00:00Z",
    ends_at: "2030-06-09T10:00:00Z",
    capacity: 1,
  };
  const create = async (body = {}) =>
    (
      await church("/shifts", {
        method: "POST",
        cookie: roles.registrar,
        body: { ...payload, ...body },
        expected: 201,
      })
    ).data.shift;
  const get = async (id) => (await church("/shifts/" + id)).data;
  const mark = async (id, member, status, expected = 200) =>
    church(`/shifts/${id}/assignments/${member}`, {
      method: "PUT",
      body: { version: (await get(id)).shift.version, status },
      expected,
    });
  const state = async (id, state, expected = 200) =>
    church(`/shifts/${id}/state`, {
      method: "POST",
      body: { version: (await get(id)).shift.version, state },
      expected,
    });
  const update = async (id, data, expected = 200) =>
    church("/shifts/" + id, {
      method: "PUT",
      body: { ...payload, ...(await get(id)).shift, ...data },
      expected,
    });
  for (const data of [
    { capacity: 0 },
    { capacity: 1.2 },
    { capacity: "2" },
    { capacity: 501 },
    { ends_at: payload.starts_at },
    { starts_at: "2030-06-09T08:00:00" },
    { starts_at: "2030-02-30T08:00:00Z" },
    { starts_at: "2030-06-09T24:00:00Z" },
    { ends_at: "2030-06-20T08:00:00Z" },
    { group_id: "invalid" },
  ])
    await church("/shifts", {
      method: "POST",
      body: { ...payload, ...data },
      expected: 400,
    });
  await church("/shifts", {
    method: "POST",
    body: { ...payload, group_id: randomUUID() },
    expected: 404,
  });
  await church("/shifts", {
    method: "POST",
    origin: "https://untrusted.example",
    body: payload,
    expected: 403,
  });
  let s = await create();
  assert.equal(s.capacity, 1);
  assert.equal(s.filled_count, 0);
  for (const role of ["usher", "care", "media", "editor"]) {
    for (const path of [
      `/shifts/${s.id}`,
      `/shifts/${s.id}/candidates`,
      `/shifts/${s.id}/export`,
    ])
      await church(path, { cookie: roles[role], expected: 403 });
    await church("/shifts", {
      method: "POST",
      cookie: roles[role],
      body: payload,
      expected: 403,
    });
    await church(`/shifts/${s.id}/assignments/${people[0].id}`, {
      method: "PUT",
      cookie: roles[role],
      body: { version: s.version, status: "assigned" },
      expected: 403,
    });
    await church(`/shifts/${s.id}/state`, {
      method: "POST",
      cookie: roles[role],
      body: { version: s.version, state: "cancelled" },
      expected: 403,
    });
    await church(`/shifts/${s.id}`, {
      method: "PUT",
      cookie: roles[role],
      body: { ...payload, version: s.version },
      expected: 403,
    });
  }
  assert.equal(
    (await church(`/shifts/${s.id}/candidates?limit=1&page=2`)).data.members
      .length,
    1,
  );
  assert.equal(
    (await church(`/shifts/${s.id}/candidates?search=Outside`)).data.total,
    0,
  );
  await mark(s.id, people[3].id, "assigned", 409);
  await mark(s.id, randomUUID(), "assigned", 404);
  await mark(s.id, people[0].id, "unknown", 400);
  await church(`/shifts/${s.id}/assignments/${people[0].id}`, {
    method: "PUT",
    body: { status: "assigned" },
    expected: 428,
  });
  const attempts = await Promise.all(
    people.slice(0, 2).map((m) =>
      church(`/shifts/${s.id}/assignments/${m.id}`, {
        method: "PUT",
        body: { version: s.version, status: "assigned" },
        expected: [200, 409],
      }),
    ),
  );
  assert.deepEqual(attempts.map((a) => a.response.status).sort(), [200, 409]);
  let d = await get(s.id),
    winner = d.assignments[0].id,
    other = people.find((m) => m.id !== winner).id;
  assert.equal(d.total, 1);
  assert.equal(d.shift.filled_count, 1);
  await mark(s.id, other, "assigned", 409);
  const unchangedVersion = d.shift.version;
  await mark(s.id, winner, "assigned");
  assert.equal((await get(s.id)).shift.version, unchangedVersion);
  await mark(s.id, winner, "confirmed");
  await church("/shifts/" + s.id, {
    method: "PUT",
    body: { ...payload, version: 1 },
    expected: 409,
  });
  await update(s.id, { capacity: 2 });
  await mark(s.id, other, "assigned");
  await update(s.id, { capacity: 1 }, 409);
  assert.equal((await get(s.id)).shift.capacity, 2);
  await mark(s.id, other, "declined");
  assert.equal((await get(s.id)).shift.filled_count, 1);
  await mark(s.id, other, "removed");
  const [soft] = await db.query(
    "SELECT status FROM church_volunteer_assignments WHERE shift_id=? AND member_id=?",
    [s.id, other],
  );
  assert.equal(soft[0].status, "removed");
  const overlapping = await create({ title: "Other entrance" });
  await mark(overlapping.id, winner, "assigned", 409);
  const adjacent = await create({
    title: "After service",
    starts_at: payload.ends_at,
    ends_at: "2030-06-09T11:00:00Z",
  });
  await mark(adjacent.id, winner, "assigned");
  const beforeEdit = (await get(adjacent.id)).shift;
  await update(adjacent.id, { starts_at: "2030-06-09T09:30:00Z" }, 409);
  assert.equal((await get(adjacent.id)).shift.version, beforeEdit.version);
  assert.equal(
    (await get(adjacent.id)).shift.starts_at,
    "2030-06-09T10:00:00.000Z",
  );
  // Cross-shift concurrency is serialized, including separate ministries.
  let secondGroup = (
    await church("/groups", {
      method: "POST",
      body: { name: "Second ministry", kind: "ministry" },
      expected: 201,
    })
  ).data.group;
  secondGroup = (
    await church(`/groups/${secondGroup.id}/members/${people[2].id}`, {
      method: "PUT",
      body: { version: secondGroup.version, role: "member" },
    })
  ).data.group;
  const x = await create({
      title: "Concurrent A",
      starts_at: "2030-07-01T08:00:00Z",
      ends_at: "2030-07-01T10:00:00Z",
    }),
    y = await create({
      title: "Concurrent B",
      group_id: secondGroup.id,
      starts_at: x.starts_at,
      ends_at: x.ends_at,
    });
  const samePerson = await Promise.all(
    [x, y].map((v) =>
      church(`/shifts/${v.id}/assignments/${people[2].id}`, {
        method: "PUT",
        body: { version: v.version, status: "assigned" },
        expected: [200, 409],
      }),
    ),
  );
  assert.deepEqual(samePerson.map((v) => v.response.status).sort(), [200, 409]);
  await state(s.id, "cancelled");
  await mark(overlapping.id, winner, "assigned");
  await state(s.id, "scheduled", 409);
  assert.equal((await get(s.id)).shift.state, "cancelled");
  await mark(overlapping.id, winner, "declined");
  await state(s.id, "scheduled");
  await mark(s.id, winner, "served");
  await state(s.id, "completed");
  await mark(s.id, winner, "no_show", 409);
  await update(s.id, { title: "Locked" }, 409);
  await state(s.id, "cancelled", 409);
  await state(s.id, "scheduled");
  await mark(s.id, winner, "no_show");
  assert.equal((await get(s.id)).shift.no_show_count, 1);
  assert.equal((await get(s.id)).shift.served_count, 0);
  // Historical assignments survive leaving a group, but a fresh reservation requires eligibility.
  group = (await church("/groups/" + group.id)).data.group;
  group = (
    await church(`/groups/${group.id}/members/${winner}`, {
      method: "PUT",
      body: { version: group.version, role: "removed" },
    })
  ).data.group;
  assert.ok(
    (await get(s.id)).assignments.find((m) => m.id === winner).group_left_at,
  );
  await mark(s.id, winner, "confirmed");
  await mark(s.id, winner, "declined");
  await mark(s.id, winner, "assigned", 409);
  group = (
    await church(`/groups/${group.id}/members/${winner}`, {
      method: "PUT",
      body: { version: group.version, role: "member" },
    })
  ).data.group;
  await mark(s.id, winner, "assigned");
  const w = (await church("/members/" + winner)).data.member;
  await church(`/members/${winner}/archive`, {
    method: "POST",
    body: { version: w.version, archived: true },
  });
  assert.ok(
    (await get(s.id)).assignments.find((m) => m.id === winner).archived_at,
  );
  await mark(s.id, winner, "confirmed", 409);
  await mark(s.id, winner, "declined");
  const wa = (await church("/members/" + winner)).data.member;
  await church(`/members/${winner}/archive`, {
    method: "POST",
    body: { version: wa.version, archived: false },
  });
  await mark(s.id, winner, "assigned");
  group = (
    await church(`/groups/${group.id}/archive`, {
      method: "POST",
      body: { version: group.version, archived: true },
    })
  ).data.group;
  await church("/shifts", { method: "POST", body: payload, expected: 409 });
  await update(s.id, { title: "Archived group" }, 409);
  await mark(s.id, other, "assigned", 409);
  await church(`/shifts/${s.id}/candidates`, { expected: 409 });
  await state(s.id, "cancelled");
  await state(s.id, "scheduled", 409);
  group = (
    await church(`/groups/${group.id}/archive`, {
      method: "POST",
      body: { version: group.version, archived: false },
    })
  ).data.group;
  await state(s.id, "scheduled");
  const csv = await church(`/shifts/${s.id}/export`);
  assert.match(csv.data, /"'=Morning welcome"/);
  assert.match(
    csv.response.headers.get("content-disposition"),
    /church-volunteer-roster.csv/,
  );
  assert.ok(!csv.data.includes("church-owner@"));
  const [audit] = await db.query(
    "SELECT changed_fields FROM church_activity WHERE entity_type='shift'",
  );
  assert.ok(
    audit.every((a) => !a.changed_fields.includes(payload.instructions)),
  );
  assert.ok(
    (await church("/activity")).data.activity.some(
      (a) => a.entity_type === "shift" && a.record_name,
    ),
  );
  const list = (
    await church(
      "/shifts?state=scheduled&group_id=" + group.id + "&search=Morning",
    )
  ).data;
  assert.equal(list.total, 1);
  assert.equal(
    (await church("/shifts?from=2030-06-09T00:00:00Z&to=2030-06-10T00:00:00Z"))
      .data.total,
    3,
  );
  await church("/shifts?state=unknown", { expected: 400 });
  await church("/shifts?from=2030-06-09T00:00:00Z", { expected: 400 });
  await church("/shifts/" + randomUUID(), { expected: 404 });
  await church("/shifts/not-an-id", { expected: 400 });
  await church(`/shifts/${s.id}/state`, {
    method: "POST",
    body: null,
    expected: 400,
  });
  return s.id;
}
