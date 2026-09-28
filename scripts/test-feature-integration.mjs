// Runs ONLY against local Supabase. Uses synthetic example.invalid fixtures.
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { writeFile } from "node:fs/promises";
const port = Number(process.env.NSP_TEST_PORT_BASE || 54321);
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65000);
const url = `http://127.0.0.1:${port}`;
const jwt = (role) => {
  const part = (x) => Buffer.from(JSON.stringify(x)).toString("base64url");
  const body =
    part({ alg: "HS256", typ: "JWT" }) +
    "." +
    part({
      iss: "supabase-demo",
      role,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
  return (
    body +
    "." +
    createHmac(
      "sha256",
      "super-secret-jwt-token-with-at-least-32-characters-long",
    )
      .update(body)
      .digest("base64url")
  );
};
const anon = jwt("anon"),
  service = jwt("service_role");
const client = (key) =>
  createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const root = client(service);
const tag = randomUUID().slice(0, 8);
const password = "Local-test-password-27!";
const ok = ({ data, error }) => {
  if (error)
    throw new Error([error.message, error.details].filter(Boolean).join("\n"));
  return data;
};
const fail = (result) =>
  assert.ok(result.error, "Expected request to be rejected");
let checks = 0;
const pass = (name) => {
  checks++;
  console.log(`OK ${name}`);
};
const members = [],
  users = [],
  eventIds = [],
  seasonIds = [];
try {
  for (const [index, role, group] of [
    [0, "admin", "old"],
    [1, "member", "old"],
    [2, "member", "old"],
    [3, "member", "young"],
    [4, "member", "young"],
  ]) {
    const id = randomUUID(),
      email = `nsp-${tag}-${index}@example.invalid`;
    ok(
      await root.from("members").insert({
        id,
        display_name: `Test ${tag} ${index}`,
        short_name: `T${index}`,
        pairing_role: index === 2 || index === 4 ? "follow" : "lead",
        experience_level: index === 1 ? "beginner" : "experienced",
        age_group: group,
        age_groups: index === 1 ? ["old", "young"] : [group],
        is_active: true,
        admin_note: "PRIVATE TEST NOTE",
      }),
    );
    members.push({ id, email });
    ok(
      await root
        .from("member_accounts")
        .insert({ member_id: id, email, desired_role: role }),
    );
    const created = ok(
      await root.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      }),
    );
    users.push(created.user.id);
  }
  const admin = client(anon),
    member = client(anon),
    other = client(anon);
  ok(
    await admin.auth.signInWithPassword({ email: members[0].email, password }),
  );
  ok(
    await member.auth.signInWithPassword({ email: members[1].email, password }),
  );
  ok(
    await other.auth.signInWithPassword({ email: members[2].email, password }),
  );
  const rpc = (c, action, payload) =>
    c.rpc("mutate_app_v3", { action, payload });
  const db = (c) => c.rpc("get_app_database_v3").then(ok);
  const date = (days = 0) =>
    new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  const dance = ok(
    await rpc(admin, "season", {
      name: `Dance ${tag}`,
      kind: "dance",
      dateFrom: date(-365),
      dateTo: date(365),
      active: true,
    }),
  ).id;
  seasonIds.push(dance);
  const carols = ok(
    await rpc(admin, "season", {
      name: `Carols ${tag}`,
      kind: "carols",
      dateFrom: date(-365),
      dateTo: date(365),
      active: true,
    }),
  ).id;
  seasonIds.push(carols);
  assert.equal((await db(admin)).seasons.filter((s) => s.active).length, 2);
  pass("Overlapping dance and carol seasons");
  const privateDb = await db(member);
  assert.ok(
    privateDb.members.every(
      (m) => !("experience" in m) && !("note" in m) && !("account" in m),
    ),
  );
  const preview = ok(await admin.rpc("member_preview_v3"));
  assert.equal(preview.accessMode, "member");
  assert.equal(preview.myMemberId, members[0].id);
  assert.deepEqual(preview.preferences, []);
  assert.ok(
    preview.members.every(
      (m) =>
        !m.experienceKnown &&
        !("experience" in m) &&
        !("note" in m) &&
        !("account" in m),
    ),
  );
  const previewScores = ok(
    await admin.rpc("member_preview_v3", { filters: { seasonId: dance } }),
  );
  assert.ok(
    previewScores.every(
      (r) => !r.member.experienceKnown && !("experience" in r.member),
    ),
  );
  assert.equal((await db(admin)).accessMode, "admin");
  assert.ok((await db(admin)).members.every((m) => m.experienceKnown));
  fail(await member.rpc("member_preview_v3"));
  fail(await client(anon).rpc("member_preview_v3"));
  pass(
    "Member preview restricts private data and scores, preserves own identity and real admin access, rejects non-admins",
  );
  fail(await member.from("members").select("experience_level"));
  fail(await member.rpc("get_member_home"));
  fail(await member.rpc("get_member_session_context"));
  fail(await member.rpc("get_member_history"));
  pass(
    "Private experience and notes absent from member payload and legacy endpoints",
  );
  fail(
    await rpc(member, "season", {
      name: "Denied",
      kind: "dance",
      dateFrom: date(),
      dateTo: date(),
      active: false,
    }),
  );
  fail(
    await rpc(member, "member", {
      id: members[1].id,
      experience: "experienced",
    }),
  );
  pass("Member cannot change administrative data");
  const input = (type, seasonId = dance) => ({
    seasonId,
    type,
    title: `Event ${tag}`,
    date: date(-1),
    startTime: "19:00",
    endTime: "21:00",
    location: "Stará škola",
    weight: 2,
    responseDeadline: new Date(Date.now() + 3600000).toISOString(),
    oldPairs: 1,
    youngPairs: 0,
    singing: true,
  });
  const rehearsal = ok(await rpc(admin, "event", input("rehearsal"))).id;
  eventIds.push(rehearsal);
  ok(await rpc(member, "response", { id: rehearsal, interest: "yes" }));
  ok(await rpc(other, "response", { id: rehearsal, interest: "no" }));
  fail(
    await rpc(member, "response", {
      id: rehearsal,
      interest: "maybe",
      note: "No",
    }),
  );
  pass("Rehearsal allows only yes/no and remains open after start");
  ok(
    await rpc(admin, "attendance", {
      id: rehearsal,
      memberId: members[1].id,
      status: "partial",
      attendancePercent: 75,
      selected: true,
    }),
  );
  ok(await rpc(admin, "event", { id: rehearsal, status: "closed" }));
  let event = (await db(admin)).events.find((e) => e.id === rehearsal);
  assert.equal(
    event.attendance.find((r) => r.memberId === members[1].id)
      .attendancePercent,
    75,
  );
  assert.equal(
    event.attendance.find((r) => r.memberId === members[2].id).status,
    "absent",
  );
  assert.equal(
    event.attendance.find((r) => r.memberId === members[3].id).status,
    "unknown",
  );
  fail(await rpc(member, "response", { id: rehearsal, interest: "no" }));
  pass(
    "Closure prefills only unanswered actual attendance and locks member responses",
  );
  let scores = ok(
    await member.rpc("scores_v3", { filters: { seasonId: dance } }),
  );
  assert.equal(scores.find((s) => s.member.id === members[1].id).total, 1.5);
  assert.equal(
    ok(await member.rpc("scores_v3", { filters: { seasonId: carols } })).find(
      (s) => s.member.id === members[1].id,
    ).total,
    0,
  );
  fail(
    await rpc(admin, "attendance", {
      id: rehearsal,
      memberId: members[1].id,
      status: "partial",
      attendancePercent: 101,
    }),
  );
  pass("Percentage points and seasonal isolation");
  const performance = ok(await rpc(admin, "event", input("performance"))).id;
  eventIds.push(performance);
  const draftPreviewEvent = ok(
    await rpc(admin, "event", { ...input("rehearsal"), status: "draft" }),
  ).id;
  eventIds.push(draftPreviewEvent);
  ok(await rpc(admin, "event", { id: draftPreviewEvent, status: "draft" }));
  const openPreview = ok(await admin.rpc("member_preview_v3"));
  assert.ok(!openPreview.events.some((e) => e.id === draftPreviewEvent));
  const previewPerformance = openPreview.events.find(
    (e) => e.id === performance,
  );
  assert.equal(previewPerformance.attendanceScope, "self");
  assert.ok(
    previewPerformance.attendance.every((a) => a.memberId === members[0].id),
  );
  pass(
    "Member preview hides draft events and others' open performance responses",
  );
  fail(
    await rpc(member, "response", {
      id: performance,
      interest: "maybe",
      note: "",
    }),
  );
  ok(
    await rpc(member, "response", {
      id: performance,
      interest: "maybe",
      note: "Čekám na potvrzení",
    }),
  );
  ok(await rpc(other, "response", { id: performance, interest: "yes" }));
  assert.equal(
    (await db(member)).events.find((e) => e.id === performance).attendance
      .length,
    1,
  );
  ok(
    await rpc(member, "wishes", {
      id: performance,
      partnerIds: [members[2].id],
    }),
  );
  fail(
    await rpc(member, "wishes", {
      id: performance,
      partnerIds: [members[4].id, members[0].id],
    }),
  );
  fail(
    await rpc(other, "wishes", {
      id: performance,
      partnerIds: [members[3].id],
    }),
  );
  const [memberA, memberB] = [members[1].id, members[2].id].sort();
  ok(
    await root.from("pairing_preferences").insert({
      member_a_id: memberA,
      member_b_id: memberB,
      kind: "forbidden",
      strength: 5,
      private_reason: "PRIVATE REASON",
    }),
  );
  assert.ok(
    !(await db(member)).events
      .find((e) => e.id === performance)
      .partnerOptions.includes(members[2].id),
  );
  fail(
    await rpc(member, "wishes", {
      id: performance,
      partnerIds: [members[2].id],
    }),
  );
  await root
    .from("pairing_preferences")
    .delete()
    .eq("member_a_id", memberA)
    .eq("member_b_id", memberB);
  pass("Required maybe note, private responses and compatible partner wishes");
  ok(
    await rpc(admin, "event", {
      id: performance,
      responseDeadline: new Date(Date.now() - 60000).toISOString(),
    }),
  );
  ok(await root.rpc("confirm_due_events"));
  event = (await db(member)).events.find((e) => e.id === performance);
  assert.equal(event.status, "confirmed");
  assert.ok(event.attendance.length > 1);
  assert.equal(
    event.attendance.find((r) => r.memberId === members[1].id).interest,
    "maybe",
  );
  fail(await rpc(member, "response", { id: performance, interest: "yes" }));
  fail(await rpc(member, "wishes", { id: performance, partnerIds: [] }));
  ok(
    await rpc(admin, "attendance", {
      id: performance,
      memberId: members[1].id,
      interest: "yes",
      note: "Admin correction",
    }),
  );
  ok(
    await rpc(admin, "adminWishes", {
      id: performance,
      memberId: members[1].id,
      partnerIds: [members[2].id],
    }),
  );
  assert.ok(
    (await db(admin)).partnerWishes.some(
      (w) =>
        w.eventId === performance &&
        w.memberId === members[1].id &&
        w.partnerId === members[2].id,
    ),
  );
  pass(
    "Backend deadline confirms, preserves maybe and locks response and wishes",
  );
  fail(
    await rpc(admin, "event", {
      ...input("performance"),
      responseDeadline: null,
    }),
  );
  // Full roster selection is shared with pairing; forbidden and duplicate members are server checked.
  for (const m of members.slice(1))
    ok(
      await rpc(admin, "attendance", {
        id: performance,
        memberId: m.id,
        selected: true,
        status: "present",
      }),
    );
  const pairs = [
    {
      leaderId: members[1].id,
      followerId: members[2].id,
      ageGroup: "old",
      belowLine: false,
    },
    {
      leaderId: members[3].id,
      followerId: members[4].id,
      ageGroup: "young",
      belowLine: true,
    },
  ];
  const save = (id, p, published) =>
    admin.rpc("save_pairs_v3", { event_id: id, pairs: p, published });
  ok(await save(performance, pairs, false));
  assert.equal(
    ok(await admin.rpc("member_preview_v3")).events.find(
      (e) => e.id === performance,
    ).pairs.length,
    0,
  );
  pass("Member preview hides unpublished performance pairs");
  assert.equal(
    (await db(member)).events.find((e) => e.id === performance).pairs.length,
    0,
  );
  fail(await save(performance, [...pairs, { ...pairs[0] }], true));
  fail(await save(performance, [{ ...pairs[0], ageGroup: "young" }], true));
  const run = ok(await save(performance, pairs, true));
  assert.equal(
    (await db(member)).events.find((e) => e.id === performance).pairs.length,
    2,
  );
  ok(await rpc(admin, "event", { id: performance, status: "closed" }));
  assert.equal(
    ok(await admin.rpc("confirm_actual_pairs", { target_run_id: run })),
    1,
  );
  event = (await db(admin)).events.find((e) => e.id === performance);
  assert.equal(event.actualPairs.length, 1);
  assert.equal(event.attendance.filter((r) => r.actualStanding).length, 2);
  fail(await rpc(admin, "event", { id: performance, seasonId: carols }));
  pass(
    "Pair draft privacy, publication, group/duplicate validation and actual pairs excluding below line",
  );
  ok(
    await rpc(admin, "attendance", {
      id: rehearsal,
      memberId: members[2].id,
      selected: true,
      status: "present",
    }),
  );
  ok(await save(rehearsal, [pairs[0]], true));
  ok(await save(rehearsal, [pairs[0]], true));
  event = (await db(member)).events.find((e) => e.id === rehearsal);
  assert.equal(event.pairSets.filter((s) => s.published).length, 2);
  assert.equal(event.actualPairs.length, 0);
  pass("Multiple rehearsal sets are visible and never actual history");
  const carolEvent = ok(
    await rpc(admin, "event", input("performance", carols)),
  ).id;
  eventIds.push(carolEvent);
  fail(await save(carolEvent, pairs, true));
  fail(
    await rpc(member, "wishes", {
      id: carolEvent,
      partnerIds: [members[2].id],
    }),
  );
  ok(
    await rpc(admin, "attendance", {
      id: carolEvent,
      memberId: members[1].id,
      status: "partial",
      attendancePercent: 50,
    }),
  );
  ok(await rpc(admin, "event", { id: carolEvent, status: "closed" }));
  assert.equal(
    ok(await member.rpc("scores_v3", { filters: { seasonId: carols } })).find(
      (s) => s.member.id === members[1].id,
    ).total,
    1,
  );
  assert.equal(
    ok(
      await member.rpc("scores_v3", {
        filters: { dateFrom: date(-2), dateTo: date(0) },
      }),
    ).find((s) => s.member.id === members[1].id).total,
    4.5,
  );
  pass(
    "Carols have separate percentage points without pairing, custom date totals combine seasons",
  );
  const catalog = await db(admin);
  assert.equal(catalog.songs.length, 57);
  assert.equal(catalog.songCategories.length, 2);
  assert.equal(catalog.songs.filter((s) => s.name.includes("/")).length, 3);
  pass("57 clean song entries and two categories");
  const songId = catalog.songs[0].id;
  ok(
    await rpc(admin, "series", {
      id: performance,
      name: "Series A",
      songIds: [songId],
      confirmed: false,
    }),
  );
  assert.equal(
    ok(await admin.rpc("member_preview_v3")).events.find(
      (e) => e.id === performance,
    ).songSeries.length,
    0,
  );
  let series = (await db(admin)).events
    .find((e) => e.id === performance)
    .songSeries.find((s) => s.name === "Series A");
  assert.equal(
    (await db(member)).events.find((e) => e.id === performance).songSeries
      .length,
    0,
  );
  fail(
    await rpc(member, "series", {
      id: performance,
      name: "Denied",
      songIds: [],
      confirmed: false,
    }),
  );
  fail(
    await rpc(admin, "series", {
      id: performance,
      name: "Series B",
      songIds: [songId],
      confirmed: false,
    }),
  );
  ok(
    await rpc(admin, "series", {
      id: performance,
      seriesId: series.id,
      name: series.name,
      songIds: [songId],
      confirmed: true,
    }),
  );
  assert.equal(
    (await db(member)).events.find((e) => e.id === performance).songSeries
      .length,
    1,
  );
  ok(
    await rpc(admin, "series", {
      id: performance,
      seriesId: series.id,
      name: series.name,
      songIds: [],
      confirmed: false,
    }),
  );
  ok(
    await rpc(admin, "series", {
      id: performance,
      name: "Series B",
      songIds: [songId],
      confirmed: true,
    }),
  );
  ok(
    await rpc(admin, "series", {
      id: rehearsal,
      name: "Other event",
      songIds: [songId],
      confirmed: true,
    }),
  );
  pass(
    "Series visibility, event-wide uniqueness and reuse after removal and on other event",
  );
  const sharedCode = ok(await admin.rpc("rotate_shared_code"));
  const shared = client(anon);
  ok(await shared.auth.signInAnonymously());
  ok(await shared.rpc("verify_shared_code", { code: sharedCode }));
  const sharedDb = await db(shared);
  assert.equal(sharedDb.accessMode, "shared");
  assert.ok(
    sharedDb.members.every((m) => !("experience" in m) && !("note" in m)),
  );
  assert.equal(
    sharedDb.events.find((e) => e.id === performance).songSeries.length,
    1,
  );
  fail(await rpc(shared, "song", { name: "Denied", active: true }));
  pass("Shared access sees confirmed series and scores, cannot edit");
  fail(
    await member.rpc("authorize_member_login_code", {
      target_member_id: members[2].id,
    }),
  );
  const codeResult = await admin.functions.invoke(
    "generate-member-login-code",
    { body: { memberId: members[2].id } },
  );
  if (codeResult.error?.context)
    console.log(
      "Local function diagnostic:",
      await codeResult.error.context.json(),
    );
  const generated = ok(codeResult);
  assert.match(generated.code, /^\d{6}$/);
  assert.equal(generated.email, members[2].email);
  const fresh = client(anon);
  ok(
    await fresh.auth.verifyOtp({
      email: generated.email,
      token: generated.code,
      type: "email",
    }),
  );
  assert.equal((await db(fresh)).myMemberId, members[2].id);
  fail(
    await client(anon).auth.verifyOtp({
      email: generated.email,
      token: generated.code,
      type: "email",
    }),
  );
  fail(
    await admin.functions.invoke("generate-member-login-code", {
      body: { memberId: members[2].id },
    }),
  );
  fail(
    await member.functions.invoke("generate-member-login-code", {
      body: { memberId: members[3].id },
    }),
  );
  pass(
    "Admin OTP works in separate session exactly once, is rate limited and unavailable to members",
  );
  const raceSong = catalog.songs[1].id;
  const race = await Promise.all(
    ["Race A", "Race B"].map((name) =>
      rpc(admin, "series", {
        id: rehearsal,
        name,
        songIds: [raceSong],
        confirmed: false,
      }),
    ),
  );
  assert.equal(race.filter((r) => !r.error).length, 1);
  pass("Concurrent series edits cannot reserve the same song twice");
  const automatic = ok(
    await rpc(admin, "event", {
      ...input("performance"),
      responseDeadline: new Date(Date.now() + 2000).toISOString(),
    }),
  ).id;
  eventIds.push(automatic);
  let automaticStatus;
  for (let attempt = 0; attempt < 8; attempt++) {
    automaticStatus = ok(
      await root.from("events").select("status").eq("id", automatic).single(),
    ).status;
    if (automaticStatus === "confirmed") break;
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }
  assert.equal(automaticStatus, "confirmed");
  pass(
    "Scheduled deadline confirms automatically without any app database read",
  );
  console.log(`Integration checks passed: ${checks}`);
  if (process.env.NSP_KEEP_TEST_FIXTURES === "1") {
    await writeFile(
      "/tmp/nsp-supabase-tests/browser-fixture.json",
      JSON.stringify({
        url,
        anon,
        password,
        adminEmail: members[0].email,
        memberEmail: members[1].email,
        performance,
        rehearsal,
        dance,
        carols,
        sharedCode,
      }),
    );
    console.log(
      "Synthetic browser fixtures retained in /tmp/nsp-supabase-tests/browser-fixture.json",
    );
  }
} finally {
  if (process.env.NSP_KEEP_TEST_FIXTURES !== "1") {
    for (const id of eventIds) await root.from("events").delete().eq("id", id);
    for (const id of users) await root.auth.admin.deleteUser(id);
    for (const m of members) await root.from("members").delete().eq("id", m.id);
    for (const id of seasonIds)
      await root.from("seasons").delete().eq("id", id);
  }
}
