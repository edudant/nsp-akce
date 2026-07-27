import type {
  AppApi,
  AttendanceRecord,
  AttendanceStatus,
  DancePair,
  DemoDatabase,
  EnsembleEvent,
  EventStatus,
  EventType,
  ExperienceLevel,
  InterestStatus,
  Member,
  PairingRole,
  ScoreRow,
} from "./demoData";
import { requireSupabase } from "./supabase";

interface MemberRow {
  id: string;
  display_name: string;
  short_name: string;
  pairing_role: "lead" | "follow";
  experience_level: ExperienceLevel;
  active_from: string | null;
  is_active: boolean;
  admin_note?: string | null;
}

interface EventRow {
  id: string;
  season_id: string;
  type: EventType;
  title: string;
  location: string | null;
  starts_at: string;
  ends_at: string;
  status: EventStatus;
  points_weight: number | string;
  capacity: number | null;
  required_pairs: number | null;
  response_deadline: string | null;
  program: string | null;
  note: string | null;
}

interface AttendanceRow {
  event_id: string;
  member_id: string;
  status: "unrecorded" | "full" | "partial" | "absent" | "excused";
  minutes_present: number | null;
}

interface ResponseRow {
  event_id: string;
  member_id: string;
  response: "unanswered" | "yes" | "no" | "maybe" | "substitute";
  note: string | null;
}

interface ParticipantRow {
  event_id: string;
  member_id: string;
  status: "invited" | "selected" | "substitute" | "declined";
}

interface PreferenceRow {
  member_a_id: string;
  member_b_id: string;
  kind: "forbidden" | "discouraged" | "preferred";
  strength: number;
  private_reason: string | null;
}

interface PairingRunRow {
  id: string;
  event_id: string;
  status: "draft" | "published" | "superseded";
  generated_at: string;
}

interface EventPairRow {
  id: string;
  pairing_run_id: string;
  round_number: number;
  member_a_id: string;
  member_b_id: string;
  is_locked: boolean;
  is_confirmed_actual: boolean;
  explanation: string;
}

interface SharedScore {
  memberId: string;
  displayName: string;
  pairingRole: "lead" | "follow";
  totalPoints: number | string;
  rehearsalPoints: number | string;
  performancePoints: number | string;
  fullAttendanceCount: number;
  partialAttendanceCount: number;
  excusedCount: number;
  possiblePoints?: number | string;
}

interface ScoreViewRow {
  member_id: string;
  season_id: string;
  total_points: number | string;
  rehearsal_points: number | string;
  performance_points: number | string;
  full_attendance_count: number;
  partial_attendance_count: number;
  excused_count: number;
  possible_points: number | string;
}

interface SharedEvent {
  id: string;
  type: EventType;
  title: string;
  location: string | null;
  startsAt: string;
  endsAt: string;
  status: EventStatus;
  responseDeadline: string | null;
}

interface SharedOverview {
  events: SharedEvent[];
  scores: SharedScore[];
  generatedAt: string;
}

interface SharedAttendance {
  memberId: string;
  displayName: string;
  attendanceStatus: AttendanceRow["status"];
  points: number | string;
}

interface SharedPair {
  roundNumber: number;
  memberAId: string;
  memberAName: string;
  memberBId: string;
  memberBName: string;
  explanation: string;
}

function numberValue(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pairingRole(value: "lead" | "follow"): PairingRole {
  return value === "lead" ? "leader" : "follower";
}

function attendanceStatus(
  value: AttendanceRow["status"] | undefined,
): AttendanceStatus {
  const statuses: Record<AttendanceRow["status"], AttendanceStatus> = {
    unrecorded: "unknown",
    full: "present",
    partial: "partial",
    absent: "absent",
    excused: "excused",
  };
  return value ? statuses[value] : "unknown";
}

function databaseAttendanceStatus(
  value: AttendanceStatus,
): AttendanceRow["status"] {
  const statuses: Record<AttendanceStatus, AttendanceRow["status"]> = {
    unknown: "unrecorded",
    present: "full",
    partial: "partial",
    absent: "absent",
    excused: "excused",
  };
  return statuses[value];
}

function interestStatus(
  value: ResponseRow["response"] | undefined,
): InterestStatus {
  if (!value || value === "unanswered") return "unset";
  return value;
}

function databaseInterestStatus(
  value: InterestStatus,
): ResponseRow["response"] {
  return value === "unset" ? "unanswered" : value;
}

function memberFromRow(row: MemberRow): Member {
  return {
    id: row.id,
    fullName: row.display_name,
    shortName: row.short_name,
    role: pairingRole(row.pairing_role),
    experience: row.experience_level,
    active: row.is_active,
    joinedAt: row.active_from ?? new Date().toISOString().slice(0, 10),
    note: row.admin_note ?? undefined,
  };
}

function localDate(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function localTime(iso: string): string {
  return new Intl.DateTimeFormat("cs-CZ", {
    timeZone: "Europe/Prague",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

function pragueLocalToIso(date: string, time: string): string {
  const approximation = new Date(`${date}T${time}:00Z`);
  const offsetName = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Prague",
    timeZoneName: "shortOffset",
  })
    .formatToParts(approximation)
    .find((part) => part.type === "timeZoneName")?.value;
  const match = offsetName?.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  const direction = match?.[1] === "-" ? -1 : 1;
  const offsetMinutes =
    direction *
    (Number(match?.[2] ?? 0) * 60 + Number(match?.[3] ?? 0));
  return new Date(approximation.getTime() - offsetMinutes * 60_000).toISOString();
}

function eventFromRows(
  row: EventRow,
  members: Member[],
  attendanceRows: AttendanceRow[],
  responseRows: ResponseRow[],
  participantRows: ParticipantRow[],
  runs: PairingRunRow[],
  pairRows: EventPairRow[],
): EnsembleEvent {
  const eventAttendance = attendanceRows.filter(
    (item) => item.event_id === row.id,
  );
  const eventResponses = responseRows.filter((item) => item.event_id === row.id);
  const eventParticipants = participantRows.filter(
    (item) => item.event_id === row.id,
  );
  const chosenRun = runs
    .filter((run) => run.event_id === row.id)
    .sort((first, second) => {
      const firstHasActual = pairRows.some(
        (pair) =>
          pair.pairing_run_id === first.id && pair.is_confirmed_actual,
      );
      const secondHasActual = pairRows.some(
        (pair) =>
          pair.pairing_run_id === second.id && pair.is_confirmed_actual,
      );
      if (
        row.status === "closed" &&
        firstHasActual !== secondHasActual
      ) {
        return firstHasActual ? -1 : 1;
      }
      if (first.status === "published" && second.status !== "published") return -1;
      if (second.status === "published" && first.status !== "published") return 1;
      return second.generated_at.localeCompare(first.generated_at);
    })[0];
  const pairs: DancePair[] = chosenRun
    ? pairRows
        .filter((pair) => pair.pairing_run_id === chosenRun.id)
        .map((pair) => ({
          id: pair.id,
          leaderId: pair.member_a_id,
          followerId: pair.member_b_id,
          round: pair.round_number,
          locked: pair.is_locked,
          reason: pair.explanation || undefined,
          actual: pair.is_confirmed_actual,
        }))
    : [];

  return {
    id: row.id,
    title: row.title,
    type: row.type,
    date: localDate(row.starts_at),
    startTime: localTime(row.starts_at),
    endTime: localTime(row.ends_at),
    location: row.location ?? "",
    status: row.status,
    weight: numberValue(row.points_weight),
    capacityPairs: row.required_pairs ?? Math.floor((row.capacity ?? 20) / 2),
    program: row.program ?? undefined,
    note: row.note ?? undefined,
    responseDeadline: row.response_deadline
      ? localDate(row.response_deadline)
      : undefined,
    attendance: members
      .filter((member) => member.active)
      .map((member): AttendanceRecord => {
        const attendance = eventAttendance.find(
          (item) => item.member_id === member.id,
        );
        const response = eventResponses.find(
          (item) => item.member_id === member.id,
        );
        const participant = eventParticipants.find(
          (item) => item.member_id === member.id,
        );
        return {
          memberId: member.id,
          status: attendanceStatus(attendance?.status),
          attendedMinutes: attendance?.minutes_present ?? undefined,
          interest: interestStatus(response?.response),
          selected: participant?.status === "selected",
          note: response?.note ?? undefined,
        };
      }),
    pairs,
    pairsPublished: chosenRun?.status === "published",
  };
}

async function getAccessMode(): Promise<"staff" | "shared"> {
  const { data, error } = await requireSupabase().auth.getSession();
  if (error) throw error;
  if (!data.session) throw new Error("Nejste přihlášeni.");
  return data.session.user.is_anonymous ? "shared" : "staff";
}

async function getStaffDatabase(): Promise<DemoDatabase> {
  const client = requireSupabase();
  const [
    seasonsResult,
    membersResult,
    eventsResult,
    attendanceResult,
    responsesResult,
    participantsResult,
    preferencesResult,
    runsResult,
    pairsResult,
    scoresResult,
  ] = await Promise.all([
    client.from("seasons").select("id").eq("is_current", true).limit(1),
    client.rpc("get_staff_members"),
    client.from("events").select("*").order("starts_at"),
    client.from("attendance").select("*"),
    client.from("event_responses").select("*"),
    client.from("event_participants").select("*"),
    client.from("pairing_preferences").select("*"),
    client.from("pairing_runs").select("*").order("generated_at", {
      ascending: false,
    }),
    client.from("event_pairs").select("*"),
    client.from("member_scores").select("*"),
  ]);

  const firstError = [
    seasonsResult.error,
    membersResult.error,
    eventsResult.error,
    attendanceResult.error,
    responsesResult.error,
    participantsResult.error,
    preferencesResult.error,
    runsResult.error,
    pairsResult.error,
    scoresResult.error,
  ].find(Boolean);
  if (firstError) throw firstError;

  const memberRows = (membersResult.data ?? []) as MemberRow[];
  const eventRows = (eventsResult.data ?? []) as EventRow[];
  const attendanceRows = (attendanceResult.data ?? []) as AttendanceRow[];
  const responseRows = (responsesResult.data ?? []) as ResponseRow[];
  const participantRows = (participantsResult.data ?? []) as ParticipantRow[];
  const preferenceRows = (preferencesResult.data ?? []) as PreferenceRow[];
  const runs = (runsResult.data ?? []) as PairingRunRow[];
  const pairs = (pairsResult.data ?? []) as EventPairRow[];
  const currentSeasonId = (
    (seasonsResult.data ?? [])[0] as { id?: string } | undefined
  )?.id;
  const scoreRows = ((scoresResult.data ?? []) as ScoreViewRow[]).filter(
    (score) => !currentSeasonId || score.season_id === currentSeasonId,
  );
  const members = memberRows.map(memberFromRow);

  return {
    members,
    events: eventRows.map((event) =>
      eventFromRows(
        event,
        members,
        attendanceRows,
        responseRows,
        participantRows,
        runs,
        pairs,
      ),
    ),
    preferences: preferenceRows.map((preference, index) => ({
      id: `${preference.member_a_id}:${preference.member_b_id}:${index}`,
      memberAId: preference.member_a_id,
      memberBId: preference.member_b_id,
      kind: preference.kind,
      strength: preference.strength,
      privateReason: preference.private_reason ?? undefined,
    })),
    scoreRows: scoreRows
      .map((score): ScoreRow | null => {
        const member = members.find((item) => item.id === score.member_id);
        if (!member) return null;
        const possible = numberValue(score.possible_points);
        const total = numberValue(score.total_points);
        return {
          member,
          total,
          rehearsal: numberValue(score.rehearsal_points),
          performance: numberValue(score.performance_points),
          fullAttendance: score.full_attendance_count,
          partialAttendance: score.partial_attendance_count,
          excused: score.excused_count,
          possible,
          attendanceRate: possible > 0 ? (total / possible) * 100 : 0,
        };
      })
      .filter((score): score is ScoreRow => Boolean(score))
      .sort((first, second) => second.total - first.total),
    updatedAt: new Date().toISOString(),
  };
}

function sharedMember(score: SharedScore): Member {
  return {
    id: score.memberId,
    fullName: score.displayName,
    shortName: score.displayName,
    role: pairingRole(score.pairingRole),
    experience: "advanced",
    active: true,
    joinedAt: "2026-01-01",
  };
}

function sharedEvent(row: SharedEvent): EnsembleEvent {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    date: localDate(row.startsAt),
    startTime: localTime(row.startsAt),
    endTime: localTime(row.endsAt),
    location: row.location ?? "",
    status: row.status,
    weight: 1,
    capacityPairs: 0,
    responseDeadline: row.responseDeadline
      ? localDate(row.responseDeadline)
      : undefined,
    attendance: [],
    pairs: [],
    pairsPublished: false,
  };
}

async function getSharedDatabase(): Promise<DemoDatabase> {
  const { data, error } = await requireSupabase().rpc("get_shared_overview");
  if (error) throw error;
  const overview = data as unknown as SharedOverview;
  const members = (overview.scores ?? []).map(sharedMember);
  const maxPossible = Math.max(
    0,
    ...(overview.scores ?? []).map((score) =>
      numberValue(score.possiblePoints ?? score.totalPoints),
    ),
  );
  const scoreRows: ScoreRow[] = (overview.scores ?? []).map((score) => {
    const member =
      members.find((item) => item.id === score.memberId) ?? sharedMember(score);
    const possible = numberValue(score.possiblePoints) || maxPossible;
    const total = numberValue(score.totalPoints);
    return {
      member,
      total,
      rehearsal: numberValue(score.rehearsalPoints),
      performance: numberValue(score.performancePoints),
      fullAttendance: score.fullAttendanceCount,
      partialAttendance: score.partialAttendanceCount,
      excused: score.excusedCount,
      possible,
      attendanceRate: possible > 0 ? (total / possible) * 100 : 0,
    };
  });

  return {
    members,
    events: (overview.events ?? []).map(sharedEvent),
    preferences: [],
    scoreRows,
    updatedAt: overview.generatedAt ?? new Date().toISOString(),
  };
}

async function getDatabase(): Promise<DemoDatabase> {
  return (await getAccessMode()) === "shared"
    ? getSharedDatabase()
    : getStaffDatabase();
}

async function getEvent(id: string): Promise<EnsembleEvent | null> {
  const mode = await getAccessMode();
  const database = await (mode === "shared"
    ? getSharedDatabase()
    : getStaffDatabase());
  const event = database.events.find((item) => item.id === id);
  if (!event || mode === "staff") return event ?? null;

  const [attendanceResult, pairsResult] = await Promise.all([
    event.status === "closed"
      ? requireSupabase().rpc("get_shared_event_attendance", {
          target_event_id: id,
        })
      : Promise.resolve({ data: [], error: null }),
    requireSupabase().rpc("get_shared_event_pairs", {
      target_event_id: id,
    }),
  ]);
  if (attendanceResult.error) throw attendanceResult.error;
  if (pairsResult.error) throw pairsResult.error;
  const attendance = (attendanceResult.data ?? []) as unknown as SharedAttendance[];
  const pairs = (pairsResult.data ?? []) as unknown as SharedPair[];
  return {
    ...event,
    attendance: attendance.map((record) => ({
      memberId: record.memberId,
      status: attendanceStatus(record.attendanceStatus),
      interest: "unset",
      selected: false,
    })),
    pairs: pairs.map((pair, index) => ({
      id: `shared-${pair.roundNumber}-${index}`,
      leaderId: pair.memberAId,
      followerId: pair.memberBId,
      round: pair.roundNumber,
      reason: pair.explanation,
    })),
    pairsPublished: pairs.length > 0,
  };
}

async function requireStaff(): Promise<void> {
  if ((await getAccessMode()) !== "staff") {
    throw new Error("Členský náhled je pouze pro čtení.");
  }
}

export const supabaseApi: AppApi = {
  getDatabase,

  async getMembers() {
    return (await getDatabase()).members;
  },

  async getEvents() {
    return (await getDatabase()).events;
  },

  getEvent,

  async updateAttendance(eventId, memberId, patch) {
    await requireStaff();
    const client = requireSupabase();
    const { error } = await client.rpc("update_event_member_state", {
      target_event_id: eventId,
      target_member_id: memberId,
      new_attendance_status: patch.status
        ? databaseAttendanceStatus(patch.status)
        : null,
      set_minutes: "attendedMinutes" in patch,
      new_minutes_present: patch.attendedMinutes ?? null,
      new_response: patch.interest
        ? databaseInterestStatus(patch.interest)
        : null,
      new_selected:
        typeof patch.selected === "boolean" ? patch.selected : null,
    });
    if (error) throw error;
    const event = await getEvent(eventId);
    if (!event) throw new Error("Událost nebyla nalezena.");
    return event;
  },

  async updateAllAttendance(eventId, status) {
    await requireStaff();
    const { error } = await requireSupabase().rpc(
      "update_all_event_attendance",
      {
        target_event_id: eventId,
        new_attendance_status: databaseAttendanceStatus(status),
      },
    );
    if (error) throw error;
    const updated = await getEvent(eventId);
    if (!updated) throw new Error("Událost nebyla nalezena.");
    return updated;
  },

  async addEvent(input) {
    await requireStaff();
    const client = requireSupabase();
    const seasonResult = await client
      .from("seasons")
      .select("id")
      .eq("is_current", true)
      .single();
    if (seasonResult.error) throw seasonResult.error;
    const { data, error } = await client
      .from("events")
      .insert({
        season_id: (seasonResult.data as { id: string }).id,
        type: input.type,
        title: input.title,
        location: input.location || null,
        starts_at: pragueLocalToIso(input.date, input.startTime),
        ends_at: pragueLocalToIso(input.date, input.endTime),
        status: input.status,
        points_weight: input.weight,
        required_pairs: input.capacityPairs,
        response_deadline: input.responseDeadline
          ? pragueLocalToIso(input.responseDeadline, "23:59")
          : null,
        visibility: "shared",
        program: input.program ?? null,
        note: input.note ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    const event = await getEvent((data as { id: string }).id);
    if (!event) throw new Error("Událost se nepodařila načíst.");
    return event;
  },

  async savePairs(eventId, pairs, published = false) {
    await requireStaff();
    const client = requireSupabase();
    const { data: runData, error: runError } = await client
      .from("pairing_runs")
      .insert({
        event_id: eventId,
        seed: Date.now(),
        algorithm_version: "mvp-1",
        rules_snapshot: {},
        status: "draft",
      })
      .select("id")
      .single();
    if (runError) throw runError;
    const runId = (runData as { id: string }).id;
    if (pairs.length > 0) {
      const { error } = await client.from("event_pairs").insert(
        pairs.map((pair) => ({
          pairing_run_id: runId,
          round_number: pair.round,
          member_a_id: pair.leaderId,
          member_b_id: pair.followerId,
          is_locked: Boolean(pair.locked),
          explanation: pair.reason ?? "",
        })),
      );
      if (error) throw error;
    }
    if (published) {
      const { error } = await client.rpc("publish_pairing_run", {
        target_run_id: runId,
      });
      if (error) throw error;
    }
    const event = await getEvent(eventId);
    if (!event) throw new Error("Událost nebyla nalezena.");
    return event;
  },

  async updateEventStatus(eventId, status) {
    await requireStaff();
    const { error } = await requireSupabase()
      .from("events")
      .update({ status })
      .eq("id", eventId);
    if (error) throw error;
    const event = await getEvent(eventId);
    if (!event) throw new Error("Událost nebyla nalezena.");
    return event;
  },

  async confirmActualPairs(eventId) {
    await requireStaff();
    const client = requireSupabase();
    const { data, error } = await client
      .from("pairing_runs")
      .select("id")
      .eq("event_id", eventId)
      .eq("status", "published")
      .single();
    if (error) throw error;
    const { error: confirmError } = await client.rpc("confirm_actual_pairs", {
      target_run_id: (data as { id: string }).id,
    });
    if (confirmError) throw confirmError;
    const event = await getEvent(eventId);
    if (!event) throw new Error("Událost nebyla nalezena.");
    return event;
  },

  async addPreference(input) {
    await requireStaff();
    const [memberAId, memberBId] = [
      input.memberAId,
      input.memberBId,
    ].sort();
    const { data, error } = await requireSupabase()
      .from("pairing_preferences")
      .upsert(
        {
          member_a_id: memberAId,
          member_b_id: memberBId,
          kind: input.kind,
          strength: input.strength ?? 3,
          private_reason: input.privateReason ?? null,
        },
        { onConflict: "member_a_id,member_b_id" },
      )
      .select("*")
      .single();
    if (error) throw error;
    const row = data as PreferenceRow;
    return {
      id: `${row.member_a_id}:${row.member_b_id}`,
      memberAId: row.member_a_id,
      memberBId: row.member_b_id,
      kind: row.kind,
      strength: row.strength,
      privateReason: row.private_reason ?? undefined,
    };
  },

  async deletePreference(memberAId, memberBId) {
    await requireStaff();
    const [firstId, secondId] = [memberAId, memberBId].sort();
    const { error } = await requireSupabase()
      .from("pairing_preferences")
      .delete()
      .eq("member_a_id", firstId)
      .eq("member_b_id", secondId);
    if (error) throw error;
  },

  async updateMember(memberId, patch) {
    await requireStaff();
    const databasePatch: Record<string, unknown> = {};
    if ("fullName" in patch) databasePatch.display_name = patch.fullName;
    if ("shortName" in patch) databasePatch.short_name = patch.shortName;
    if ("role" in patch) {
      databasePatch.pairing_role = patch.role === "leader" ? "lead" : "follow";
    }
    if ("experience" in patch) {
      databasePatch.experience_level = patch.experience;
    }
    if ("active" in patch) databasePatch.is_active = patch.active;
    if ("joinedAt" in patch) databasePatch.active_from = patch.joinedAt;
    if ("note" in patch) databasePatch.admin_note = patch.note ?? null;
    const { data, error } = await requireSupabase()
      .from("members")
      .update(databasePatch)
      .eq("id", memberId)
      .select(
        "id,display_name,short_name,pairing_role,experience_level,active_from,is_active",
      )
      .single();
    if (error) throw error;
    return memberFromRow(data as MemberRow);
  },

  async addMember(input) {
    await requireStaff();
    const { data, error } = await requireSupabase()
      .from("members")
      .insert({
        display_name: input.fullName,
        short_name: input.shortName,
        pairing_role: input.role === "leader" ? "lead" : "follow",
        experience_level: input.experience,
        is_active: input.active,
        active_from: input.joinedAt,
        admin_note: input.note ?? null,
      })
      .select(
        "id,display_name,short_name,pairing_role,experience_level,active_from,is_active",
      )
      .single();
    if (error) throw error;
    return memberFromRow(data as MemberRow);
  },

  async reset() {
    throw new Error("Produkční data nelze obnovit tlačítkem ukázkového režimu.");
  },
};
