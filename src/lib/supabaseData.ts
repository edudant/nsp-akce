import { getEmailAuthErrorMessage } from "./auth";
import type {
  AccessMode,
  AppApi,
  AppDatabase,
  AppRole,
  AttendanceRecord,
  AttendanceStatus,
  DancePair,
  EnsembleEvent,
  EventProgramItem,
  EventProgramUpdateItem,
  EventStatus,
  EventType,
  ExperienceLevel,
  InterestStatus,
  Member,
  MemberAccount,
  MemberHistoryEntry,
  PairingBlock,
  PairingRole,
  PartnerWish,
  ProgramCatalogItem,
  ScoreRow,
} from "./domain";
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

interface MemberAccountRow {
  member_id: string;
  email: string | null;
  desired_role: AppRole | null;
  linked_user_id: string | null;
  last_invitation_sent_at: string | null;
  last_sign_in_at: string | null;
  account_activated_at?: string | null;
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

interface MemberEventDetailRow {
  id: string;
  points_weight: number | string;
  capacity: number | null;
  required_pairs: number | null;
}

interface AttendanceRow {
  event_id: string;
  member_id: string;
  status: "unrecorded" | "full" | "partial" | "absent" | "excused";
  minutes_present: number | null;
  effective_points?: number | string | null;
}

interface MemberAttendanceDetailRow {
  event_id: string;
  member_id: string;
  minutes_present: number | null;
  effective_points: number | string | null;
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
  pairing_block_id: string | null;
  round_number: number;
  member_a_id: string;
  member_b_id: string;
  is_locked: boolean;
  is_confirmed_actual: boolean;
  explanation: string;
}

interface ProgramCatalogRow {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
}

interface EventProgramRow {
  id: string;
  event_id: string;
  catalog_program_id: string | null;
  custom_name: string | null;
  position: number;
}

interface PairingBlockRow {
  id: string;
  pairing_run_id: string;
  name: string;
  applies_to_all_program_items: boolean;
  position: number;
}

interface PairingBlockProgramRow {
  pairing_run_id: string;
  pairing_block_id: string;
  event_program_item_id: string;
}

interface PartnerWishRow {
  event_id: string;
  member_id: string;
  partner_member_id: string;
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

interface SharedEvent {
  id: string;
  type: EventType;
  title: string;
  location: string | null;
  startsAt: string;
  endsAt: string;
  status: EventStatus;
  responseDeadline: string | null;
  pointsWeight?: number | string;
  capacity?: number | null;
  requiredPairs?: number | null;
  programs?: Array<{
    id: string;
    name: string;
    position: number;
    isCustom: boolean;
  }>;
}

interface SharedOverview {
  events: SharedEvent[];
  scores: SharedScore[];
  generatedAt: string;
}

interface SharedProgram {
  id: string;
  name: string;
  position: number;
}

interface SharedPair {
  pairId?: string;
  roundNumber: number;
  pairingBlockId?: string;
  blockName?: string;
  memberAId: string;
  memberAName: string;
  memberBId: string;
  memberBName: string;
  explanation: string;
  programs?: SharedProgram[];
}

interface MemberHomeEvent {
  id: string;
  type: EventType;
  title: string;
  location: string | null;
  startsAt: string;
  endsAt: string;
  status: EventStatus;
  responseDeadline: string | null;
  canRespond: boolean;
  response: ResponseRow["response"];
  responseNote: string | null;
  attendanceStatus: AttendanceRow["status"];
  points: number | string;
  programs?: Array<{
    id: string;
    name: string;
    position: number;
    isCustom: boolean;
  }>;
}

interface MemberHome {
  member: {
    memberId: string;
    displayName: string;
    shortName: string;
    pairingRole: "lead" | "follow";
    experienceLevel: ExperienceLevel;
  };
  score: LeaderboardScore;
  events: MemberHomeEvent[];
  generatedAt: string;
}

interface LeaderboardScore {
  memberId: string;
  displayName: string;
  shortName?: string;
  pairingRole: "lead" | "follow";
  totalPoints: number | string;
  possiblePoints: number | string;
  rehearsalPoints: number | string;
  performancePoints: number | string;
  fullAttendanceCount: number;
  partialAttendanceCount: number;
  excusedCount: number;
}

interface MemberLeaderboard {
  scores: LeaderboardScore[];
  generatedAt: string;
}

interface HistoryProgram {
  id: string;
  name: string;
}

interface HistoryPair {
  partnerMemberId: string;
  partnerName: string;
  blockName?: string;
  programs?: HistoryProgram[];
}

interface HistoryEvent {
  eventId: string;
  title: string;
  type: EventType;
  startsAt: string;
  response: ResponseRow["response"];
  attendanceStatus: AttendanceRow["status"];
  points: number | string;
  pairs?: HistoryPair[];
}

interface MemberHistoryPayload {
  events: HistoryEvent[];
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

function accountFromRow(row: MemberAccountRow): MemberAccount | undefined {
  if (!row.email) return undefined;
  return {
    memberId: row.member_id,
    email: row.email,
    role: row.desired_role === "admin" ? "admin" : "member",
    linkedUserId: row.linked_user_id ?? undefined,
    activatedAt: row.account_activated_at ?? undefined,
    lastInvitationSentAt: row.last_invitation_sent_at ?? undefined,
    lastSignInAt: row.last_sign_in_at ?? undefined,
  };
}

function accountFromRpc(value: unknown): MemberAccount {
  const row = value as {
    memberId: string;
    email?: string | null;
    desiredRole?: AppRole | null;
    linkedUserId?: string | null;
    activatedAt?: string | null;
    lastInvitationSentAt?: string | null;
    lastSignInAt?: string | null;
  };
  return {
    memberId: row.memberId,
    email: row.email ?? undefined,
    role: row.desiredRole === "admin" ? "admin" : "member",
    linkedUserId: row.linkedUserId ?? undefined,
    activatedAt: row.activatedAt ?? undefined,
    lastInvitationSentAt: row.lastInvitationSentAt ?? undefined,
    lastSignInAt: row.lastSignInAt ?? undefined,
  };
}

function memberFromRow(row: MemberRow, account?: MemberAccount): Member {
  return {
    id: row.id,
    fullName: row.display_name,
    shortName: row.short_name,
    role: pairingRole(row.pairing_role),
    experience: row.experience_level,
    experienceKnown: true,
    active: row.is_active,
    joinedAt: row.active_from ?? new Date().toISOString().slice(0, 10),
    note: row.admin_note ?? undefined,
    account,
  };
}

function programFromRow(row: ProgramCatalogRow): ProgramCatalogItem {
  return {
    id: row.id,
    name: row.name,
    active: row.is_active,
    sortOrder: row.sort_order,
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

function eventPrograms(
  eventId: string,
  rows: EventProgramRow[],
  catalog: ProgramCatalogRow[],
): EventProgramItem[] {
  return rows
    .filter((row) => row.event_id === eventId)
    .sort((first, second) => first.position - second.position)
    .map((row) => {
      const catalogItem = catalog.find(
        (item) => item.id === row.catalog_program_id,
      );
      return {
        id: row.id,
        name: catalogItem?.name ?? row.custom_name ?? "Pásmo",
        catalogId: row.catalog_program_id ?? undefined,
        custom: row.catalog_program_id === null,
        sortOrder: row.position,
      };
    });
}

function chosenRunForEvent(
  event: EventRow,
  runs: PairingRunRow[],
  pairs: EventPairRow[],
): PairingRunRow | undefined {
  return runs
    .filter((run) => run.event_id === event.id)
    .sort((first, second) => {
      const firstHasActual = pairs.some(
        (pair) =>
          pair.pairing_run_id === first.id && pair.is_confirmed_actual,
      );
      const secondHasActual = pairs.some(
        (pair) =>
          pair.pairing_run_id === second.id && pair.is_confirmed_actual,
      );
      if (event.status === "closed" && firstHasActual !== secondHasActual) {
        return firstHasActual ? -1 : 1;
      }
      if (first.status === "published" && second.status !== "published") {
        return -1;
      }
      if (second.status === "published" && first.status !== "published") {
        return 1;
      }
      return second.generated_at.localeCompare(first.generated_at);
    })[0];
}

function runPairingBlocks(
  runId: string,
  programs: EventProgramItem[],
  rows: PairingBlockRow[],
  programRows: PairingBlockProgramRow[],
): PairingBlock[] {
  return rows
    .filter((row) => row.pairing_run_id === runId)
    .sort((first, second) => first.position - second.position)
    .map((row) => ({
      id: row.id,
      name: row.name,
      programItemIds: row.applies_to_all_program_items
        ? programs.map((program) => program.id)
        : programRows
            .filter((item) => item.pairing_block_id === row.id)
            .map((item) => item.event_program_item_id),
      appliesToAll: row.applies_to_all_program_items,
      sortOrder: row.position,
    }));
}

function eventFromRows(
  row: EventRow,
  members: Member[],
  attendanceRows: AttendanceRow[],
  responseRows: ResponseRow[],
  participantRows: ParticipantRow[],
  runs: PairingRunRow[],
  pairRows: EventPairRow[],
  catalogRows: ProgramCatalogRow[],
  eventProgramRows: EventProgramRow[],
  blockRows: PairingBlockRow[],
  blockProgramRows: PairingBlockProgramRow[],
): EnsembleEvent {
  const eventAttendance = attendanceRows.filter(
    (item) => item.event_id === row.id,
  );
  const eventResponses = responseRows.filter((item) => item.event_id === row.id);
  const eventParticipants = participantRows.filter(
    (item) => item.event_id === row.id,
  );
  const programs = eventPrograms(row.id, eventProgramRows, catalogRows);
  const chosenRun = chosenRunForEvent(row, runs, pairRows);
  const blocks = chosenRun
    ? runPairingBlocks(
        chosenRun.id,
        programs,
        blockRows,
        blockProgramRows,
      )
    : [];
  const pairs: DancePair[] = chosenRun
    ? pairRows
        .filter((pair) => pair.pairing_run_id === chosenRun.id)
        .map((pair) => {
          const block = blocks.find((item) => item.id === pair.pairing_block_id);
          return {
            id: pair.id,
            leaderId: pair.member_a_id,
            followerId: pair.member_b_id,
            round: pair.round_number,
            blockId: block?.id,
            blockName: block?.name,
            programItemIds: block?.programItemIds ?? [],
            locked: pair.is_locked,
            reason: pair.explanation || undefined,
            actual: pair.is_confirmed_actual,
          };
        })
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
    program:
      programs.map((program) => program.name).join(", ") ||
      row.program ||
      undefined,
    programItems: programs,
    pairingBlocks: blocks,
    note: row.note ?? undefined,
    responseDeadline: row.response_deadline
      ? localDate(row.response_deadline)
      : undefined,
    attendanceScope: "all",
    eventDetailsAvailable: true,
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
          earnedPoints:
            attendance?.effective_points == null
              ? undefined
              : numberValue(attendance.effective_points),
          interest: interestStatus(response?.response),
          selected: participant?.status === "selected",
          note: response?.note ?? undefined,
        };
      }),
    pairs,
    pairsPublished: chosenRun?.status === "published",
  };
}

function historyEntries(value: unknown): MemberHistoryEntry[] {
  const payload = value as MemberHistoryPayload | null;
  return (payload?.events ?? []).map((event) => ({
    eventId: event.eventId,
    title: event.title,
    type: event.type,
    date: localDate(event.startsAt),
    response: interestStatus(event.response),
    attendance: attendanceStatus(event.attendanceStatus),
    points: numberValue(event.points),
    pairs: (event.pairs ?? []).map((pair) => ({
      partnerId: pair.partnerMemberId,
      partnerName: pair.partnerName,
      blockName: pair.blockName,
      programNames: (pair.programs ?? []).map((program) => program.name),
    })),
  }));
}

async function getAccessMode(): Promise<AccessMode> {
  const client = requireSupabase();
  const { data: sessionData, error: sessionError } =
    await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session) throw new Error("Nejste přihlášeni.");
  if (sessionData.session.user.is_anonymous) return "shared";

  const { data, error } = await client.rpc("get_my_roles");
  if (error) throw error;
  const roles = Array.isArray(data) ? data : [];
  if (roles.includes("admin")) return "admin";
  if (roles.includes("member")) return "member";
  throw new Error("Tento účet nemá aktivní přístup do aplikace.");
}

async function getAdminDatabase(): Promise<AppDatabase> {
  const client = requireSupabase();
  const [
    seasonsResult,
    membersResult,
    accountsResult,
    eventsResult,
    attendanceResult,
    responsesResult,
    participantsResult,
    preferencesResult,
    wishesResult,
    runsResult,
    pairsResult,
    scoresResult,
    catalogResult,
    eventProgramsResult,
    blocksResult,
    blockProgramsResult,
  ] = await Promise.all([
    client.from("seasons").select("id").eq("is_current", true).limit(1),
    client.rpc("get_staff_members"),
    client.rpc("get_admin_member_accounts"),
    client.from("events").select("*").order("starts_at"),
    client.from("attendance").select("*"),
    client.from("event_responses").select("*"),
    client.from("event_participants").select("*"),
    client.from("pairing_preferences").select("*"),
    client.from("event_partner_wishes").select("*"),
    client.rpc("get_pairing_runs_for_app"),
    client.rpc("get_event_pairs_for_app"),
    client.from("member_scores").select("*"),
    client.from("program_catalog").select("*").order("sort_order"),
    client.from("event_program_items").select("*").order("position"),
    client.from("pairing_blocks").select("*").order("position"),
    client.from("pairing_block_program_items").select("*"),
  ]);

  const firstError = [
    seasonsResult.error,
    membersResult.error,
    accountsResult.error,
    eventsResult.error,
    attendanceResult.error,
    responsesResult.error,
    participantsResult.error,
    preferencesResult.error,
    wishesResult.error,
    runsResult.error,
    pairsResult.error,
    scoresResult.error,
    catalogResult.error,
    eventProgramsResult.error,
    blocksResult.error,
    blockProgramsResult.error,
  ].find(Boolean);
  if (firstError) throw firstError;

  const accountRows = (accountsResult.data ?? []) as MemberAccountRow[];
  const members = ((membersResult.data ?? []) as MemberRow[]).map((row) =>
    memberFromRow(
      row,
      accountFromRow(
        accountRows.find((account) => account.member_id === row.id) ?? {
          member_id: row.id,
          email: null,
          desired_role: null,
          linked_user_id: null,
          last_invitation_sent_at: null,
          last_sign_in_at: null,
        },
      ),
    ),
  );
  const eventRows = (eventsResult.data ?? []) as EventRow[];
  const attendanceRows = (attendanceResult.data ?? []) as AttendanceRow[];
  const responseRows = (responsesResult.data ?? []) as ResponseRow[];
  const participantRows = (participantsResult.data ?? []) as ParticipantRow[];
  const preferenceRows = (preferencesResult.data ?? []) as PreferenceRow[];
  const wishRows = (wishesResult.data ?? []) as PartnerWishRow[];
  const runs = (runsResult.data ?? []) as PairingRunRow[];
  const pairs = (pairsResult.data ?? []) as EventPairRow[];
  const catalogRows = (catalogResult.data ?? []) as ProgramCatalogRow[];
  const eventProgramRows = (eventProgramsResult.data ?? []) as EventProgramRow[];
  const blockRows = (blocksResult.data ?? []) as PairingBlockRow[];
  const blockProgramRows = (blockProgramsResult.data ?? []) as PairingBlockProgramRow[];
  const currentSeasonId = (
    (seasonsResult.data ?? [])[0] as { id?: string } | undefined
  )?.id;
  const scoreRows = ((scoresResult.data ?? []) as ScoreViewRow[]).filter(
    (score) => !currentSeasonId || score.season_id === currentSeasonId,
  );

  return {
    accessMode: "admin",
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
        catalogRows,
        eventProgramRows,
        blockRows,
        blockProgramRows,
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
    partnerWishes: wishRows.map((wish): PartnerWish => ({
      eventId: wish.event_id,
      memberId: wish.member_id,
      partnerId: wish.partner_member_id,
    })),
    programCatalog: catalogRows.map(programFromRow),
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

function leaderboardMember(
  score: LeaderboardScore,
  own?: MemberHome["member"],
): Member {
  const isOwn = own?.memberId === score.memberId;
  return {
    id: score.memberId,
    fullName: score.displayName,
    shortName: score.shortName || score.displayName,
    role: pairingRole(score.pairingRole),
    experience: isOwn ? own.experienceLevel : "advanced",
    experienceKnown: isOwn,
    active: true,
    joinedAt: "",
  };
}

function memberEvent(
  row: MemberHomeEvent,
  memberId: string,
  eventRow?: MemberEventDetailRow,
  attendanceRow?: MemberAttendanceDetailRow,
): EnsembleEvent {
  const programs: EventProgramItem[] = (row.programs ?? []).map((program) => ({
    id: program.id,
    name: program.name,
    custom: program.isCustom,
    sortOrder: program.position,
  }));
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    date: localDate(row.startsAt),
    startTime: localTime(row.startsAt),
    endTime: localTime(row.endsAt),
    location: row.location ?? "",
    status: row.status,
    weight: numberValue(eventRow?.points_weight),
    capacityPairs:
      eventRow?.required_pairs ??
      (eventRow?.capacity == null ? 0 : Math.floor(eventRow.capacity / 2)),
    program: programs.map((program) => program.name).join(", ") || undefined,
    programItems: programs,
    responseDeadline: row.responseDeadline
      ? localDate(row.responseDeadline)
      : undefined,
    canRespond: row.canRespond,
    attendanceScope: "self",
    eventDetailsAvailable: Boolean(eventRow),
    attendance: [
      {
        memberId,
        status: attendanceStatus(row.attendanceStatus),
        attendedMinutes: attendanceRow?.minutes_present ?? undefined,
        earnedPoints: numberValue(
          attendanceRow?.effective_points ?? row.points,
        ),
        interest: interestStatus(row.response),
        selected: false,
        note: row.responseNote ?? undefined,
      },
    ],
    pairs: [],
    pairingBlocks: [],
    pairsPublished: false,
  };
}

function memberScoreRow(
  score: LeaderboardScore,
  member: Member,
): ScoreRow {
  const total = numberValue(score.totalPoints);
  const possible = numberValue(score.possiblePoints);
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
}

async function getMemberDatabase(): Promise<AppDatabase> {
  const client = requireSupabase();
  const [
    homeResult,
    leaderboardResult,
    historyResult,
    wishesResult,
    catalogResult,
    runsResult,
    pairsResult,
    blocksResult,
    blockProgramsResult,
    eventDetailsResult,
    ownAttendanceResult,
  ] = await Promise.all([
    client.rpc("get_member_home"),
    client.rpc("get_member_leaderboard"),
    client.rpc("get_member_history"),
    client.from("event_partner_wishes").select("*"),
    client.from("program_catalog").select("*").order("sort_order"),
    client.rpc("get_pairing_runs_for_app"),
    client.rpc("get_event_pairs_for_app"),
    client.from("pairing_blocks").select("*").order("position"),
    client.from("pairing_block_program_items").select("*"),
    client.from("events").select("id,points_weight,required_pairs,capacity"),
    client
      .from("attendance")
      .select("event_id,member_id,minutes_present,effective_points"),
  ]);
  const firstError = [
    homeResult.error,
    leaderboardResult.error,
    historyResult.error,
    wishesResult.error,
    catalogResult.error,
    runsResult.error,
    pairsResult.error,
    blocksResult.error,
    blockProgramsResult.error,
    eventDetailsResult.error,
    ownAttendanceResult.error,
  ].find(Boolean);
  if (firstError) throw firstError;

  const home = homeResult.data as unknown as MemberHome;
  const leaderboard = leaderboardResult.data as unknown as MemberLeaderboard;
  const members = (leaderboard.scores ?? []).map((score) =>
    leaderboardMember(score, home.member),
  );
  if (!members.some((member) => member.id === home.member.memberId)) {
    members.push({
      id: home.member.memberId,
      fullName: home.member.displayName,
      shortName: home.member.shortName,
      role: pairingRole(home.member.pairingRole),
      experience: home.member.experienceLevel,
      experienceKnown: true,
      active: true,
      joinedAt: "",
    });
  }
  const eventDetails = (eventDetailsResult.data ?? []) as MemberEventDetailRow[];
  const ownAttendance = (ownAttendanceResult.data ?? []) as MemberAttendanceDetailRow[];
  const events = (home.events ?? []).map((event) => {
    const eventRow = eventDetails.find((row) => row.id === event.id);
    const attendanceRow = ownAttendance.find(
      (row) => row.event_id === event.id && row.member_id === home.member.memberId,
    );
    return memberEvent(event, home.member.memberId, eventRow, attendanceRow);
  });
  const runs = (runsResult.data ?? []) as PairingRunRow[];
  const pairs = (pairsResult.data ?? []) as EventPairRow[];
  const blockRows = (blocksResult.data ?? []) as PairingBlockRow[];
  const blockProgramRows = (blockProgramsResult.data ?? []) as PairingBlockProgramRow[];

  for (const event of events) {
    const run = runs
      .filter((item) => item.event_id === event.id)
      .sort((first, second) =>
        second.generated_at.localeCompare(first.generated_at),
      )[0];
    if (!run) continue;
    const blocks = runPairingBlocks(
      run.id,
      event.programItems ?? [],
      blockRows,
      blockProgramRows,
    );
    event.pairingBlocks = blocks;
    event.pairs = pairs
      .filter((pair) => pair.pairing_run_id === run.id)
      .map((pair) => {
        const block = blocks.find((item) => item.id === pair.pairing_block_id);
        return {
          id: pair.id,
          leaderId: pair.member_a_id,
          followerId: pair.member_b_id,
          round: pair.round_number,
          blockId: block?.id,
          blockName: block?.name,
          programItemIds: block?.programItemIds ?? [],
          reason: pair.explanation || undefined,
          actual: pair.is_confirmed_actual,
        };
      });
    event.pairsPublished = true;
  }

  const scoreRows = (leaderboard.scores ?? [])
    .map((score) => {
      const member = members.find((item) => item.id === score.memberId);
      return member ? memberScoreRow(score, member) : null;
    })
    .filter((score): score is ScoreRow => Boolean(score));

  return {
    accessMode: "member",
    members,
    events,
    preferences: [],
    partnerWishes: ((wishesResult.data ?? []) as PartnerWishRow[]).map(
      (wish) => ({
        eventId: wish.event_id,
        memberId: wish.member_id,
        partnerId: wish.partner_member_id,
      }),
    ),
    programCatalog: ((catalogResult.data ?? []) as ProgramCatalogRow[]).map(
      programFromRow,
    ),
    scoreRows,
    myMemberId: home.member.memberId,
    myHistory: historyEntries(historyResult.data),
    updatedAt:
      home.generatedAt || leaderboard.generatedAt || new Date().toISOString(),
  };
}

function sharedMember(score: SharedScore): Member {
  return {
    id: score.memberId,
    fullName: score.displayName,
    shortName: score.displayName,
    role: pairingRole(score.pairingRole),
    experience: "advanced",
    experienceKnown: false,
    active: true,
    joinedAt: "",
  };
}

function sharedEvent(row: SharedEvent): EnsembleEvent {
  const programs: EventProgramItem[] = (row.programs ?? []).map((program) => ({
    id: program.id,
    name: program.name,
    custom: program.isCustom,
    sortOrder: program.position,
  }));
  const detailsAvailable = row.pointsWeight != null;
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    date: localDate(row.startsAt),
    startTime: localTime(row.startsAt),
    endTime: localTime(row.endsAt),
    location: row.location ?? "",
    status: row.status,
    weight: numberValue(row.pointsWeight),
    capacityPairs:
      row.requiredPairs ??
      (row.capacity == null ? 0 : Math.floor(row.capacity / 2)),
    program: programs.map((program) => program.name).join(", ") || undefined,
    programItems: programs,
    responseDeadline: row.responseDeadline
      ? localDate(row.responseDeadline)
      : undefined,
    canRespond: false,
    attendanceScope: "none",
    eventDetailsAvailable: detailsAvailable,
    attendance: [],
    pairs: [],
    pairsPublished: false,
  };
}

async function getSharedDatabase(): Promise<AppDatabase> {
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
    accessMode: "shared",
    members,
    events: (overview.events ?? []).map(sharedEvent),
    preferences: [],
    scoreRows,
    updatedAt: overview.generatedAt ?? new Date().toISOString(),
  };
}

async function getDatabase(): Promise<AppDatabase> {
  const mode = await getAccessMode();
  if (mode === "shared") return getSharedDatabase();
  if (mode === "member") return getMemberDatabase();
  return getAdminDatabase();
}

async function getEvent(id: string): Promise<EnsembleEvent | null> {
  const mode = await getAccessMode();
  if (mode !== "shared") {
    const database =
      mode === "member" ? await getMemberDatabase() : await getAdminDatabase();
    return database.events.find((event) => event.id === id) ?? null;
  }

  const database = await getSharedDatabase();
  const event = database.events.find((item) => item.id === id);
  if (!event) return null;
  const pairsResult = await requireSupabase().rpc("get_shared_event_pairs", {
    target_event_id: id,
  });
  if (pairsResult.error) throw pairsResult.error;
  const pairs = (pairsResult.data ?? []) as unknown as SharedPair[];
  const blockMap = new Map<string, PairingBlock>();
  for (const pair of pairs) {
    const blockId = pair.pairingBlockId ?? `legacy-${pair.roundNumber}`;
    if (!blockMap.has(blockId)) {
      blockMap.set(blockId, {
        id: blockId,
        name: pair.blockName ?? `Kolo ${pair.roundNumber}`,
        programItemIds: (pair.programs ?? []).map((program) => program.id),
        appliesToAll: false,
        sortOrder: pair.roundNumber,
      });
    }
  }
  const programs = Array.from(
    new Map(
      [
        ...(event.programItems ?? []).map((program) => ({
          id: program.id,
          name: program.name,
          position: program.sortOrder,
        })),
        ...pairs.flatMap((pair) => pair.programs ?? []),
      ].map((program) => [program.id, program]),
    ).values(),
  )
    .sort((first, second) => first.position - second.position)
    .map((program): EventProgramItem => ({
      id: program.id,
      name: program.name,
      custom: false,
      sortOrder: program.position,
    }));
  return {
    ...event,
    program: programs.map((program) => program.name).join(", ") || undefined,
    programItems: programs,
    pairingBlocks: [...blockMap.values()].sort(
      (first, second) => first.sortOrder - second.sortOrder,
    ),
    attendance: [],
    attendanceScope: "none",
    pairs: pairs.map((pair, index) => ({
      id: pair.pairId ?? `shared-${pair.roundNumber}-${index}`,
      leaderId: pair.memberAId,
      followerId: pair.memberBId,
      round: pair.roundNumber,
      blockId: pair.pairingBlockId,
      blockName: pair.blockName ?? `Kolo ${pair.roundNumber}`,
      programItemIds: (pair.programs ?? []).map((program) => program.id),
      reason: pair.explanation,
      actual: event.status === "closed",
    })),
    pairsPublished: pairs.length > 0,
  };
}

async function requireAdmin(): Promise<void> {
  if ((await getAccessMode()) !== "admin") {
    throw new Error("Tuto změnu může provést pouze správce.");
  }
}

async function cleanupPairingRun(runId: string): Promise<void> {
  await requireSupabase().from("pairing_runs").delete().eq("id", runId);
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

  async getMemberHistory(memberId) {
    const mode = await getAccessMode();
    const client = requireSupabase();
    const result =
      mode === "admin"
        ? await client.rpc("get_admin_member_history", {
            target_member_id: memberId,
          })
        : await client.rpc("get_member_history");
    if (result.error) throw result.error;
    return historyEntries(result.data);
  },

  async updateAttendance(eventId, memberId, patch) {
    await requireAdmin();
    const { error } = await requireSupabase().rpc(
      "update_event_member_state",
      {
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
      },
    );
    if (error) throw error;
    const event = await getEvent(eventId);
    if (!event) throw new Error("Událost nebyla nalezena.");
    return event;
  },

  async updateMyResponse(eventId, response) {
    const { error } = await requireSupabase().rpc("set_my_event_response", {
      target_event_id: eventId,
      new_response: databaseInterestStatus(response),
      response_note: null,
    });
    if (error) throw error;
    const event = await getEvent(eventId);
    if (!event) throw new Error("Událost nebyla nalezena.");
    return event;
  },

  async updateAllAttendance(eventId, status) {
    await requireAdmin();
    const { error } = await requireSupabase().rpc(
      "update_all_event_attendance",
      {
        target_event_id: eventId,
        new_attendance_status: databaseAttendanceStatus(status),
      },
    );
    if (error) throw error;
    const event = await getEvent(eventId);
    if (!event) throw new Error("Událost nebyla nalezena.");
    return event;
  },

  async addEvent(input) {
    await requireAdmin();
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
        visibility: "public",
        program: input.program ?? null,
        note: input.note ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    const eventId = (data as { id: string }).id;
    if ((input.programItems ?? []).length > 0) {
      const programResult = await client.from("event_program_items").insert(
        (input.programItems ?? []).map((program, index) => ({
          event_id: eventId,
          catalog_program_id: program.catalogId ?? null,
          custom_name: program.catalogId ? null : program.name,
          position: index + 1,
        })),
      );
      if (programResult.error) {
        await client.from("events").delete().eq("id", eventId);
        throw programResult.error;
      }
    }
    const event = await getEvent(eventId);
    if (!event) throw new Error("Událost se nepodařila načíst.");
    return event;
  },

  async updateEventProgram(eventId, items: EventProgramUpdateItem[]) {
    await requireAdmin();
    const { error } = await requireSupabase().rpc("update_event_program", {
      target_event_id: eventId,
      program_items: items.map((item) => ({
        id: item.id ?? null,
        catalogId: item.catalogId ?? null,
        customName: item.customName?.trim() || null,
      })),
    });
    if (error) throw error;
    const event = await getEvent(eventId);
    if (!event) throw new Error("Událost nebyla nalezena.");
    return event;
  },

  async savePairs(eventId, pairs, published = false, blocks = []) {
    await requireAdmin();
    const client = requireSupabase();
    const { data: runData, error: runError } = await client
      .from("pairing_runs")
      .insert({
        event_id: eventId,
        seed: Date.now(),
        algorithm_version: "mvp-2",
        rules_snapshot: {},
        status: "draft",
      })
      .select("id")
      .single();
    if (runError) throw runError;
    const runId = (runData as { id: string }).id;
    const normalizedBlocks = blocks.length
      ? [...blocks].sort((first, second) => first.sortOrder - second.sortOrder)
      : [...new Set(pairs.map((pair) => pair.round))]
          .sort((first, second) => first - second)
          .map(
            (round): PairingBlock => ({
              id: `legacy-${round}`,
              name: `Kolo ${round}`,
              programItemIds: [],
              appliesToAll: true,
              sortOrder: round,
            }),
          );
    try {
      const blockResult = await client
        .from("pairing_blocks")
        .insert(
          normalizedBlocks.map((block, index) => ({
            pairing_run_id: runId,
            name: block.name,
            applies_to_all_program_items: block.appliesToAll,
            position: index + 1,
            is_legacy_round: blocks.length === 0,
          })),
        )
        .select("id,position");
      if (blockResult.error) throw blockResult.error;
      const insertedBlocks = (blockResult.data ?? []) as Array<{
        id: string;
        position: number;
      }>;
      const localToDatabaseBlock = new Map<string, string>();
      normalizedBlocks.forEach((block, index) => {
        const inserted = insertedBlocks.find(
          (candidate) => candidate.position === index + 1,
        );
        if (inserted) localToDatabaseBlock.set(block.id, inserted.id);
      });
      const blockProgramInserts = normalizedBlocks.flatMap((block) => {
        if (block.appliesToAll) return [];
        const blockId = localToDatabaseBlock.get(block.id);
        if (!blockId) return [];
        return block.programItemIds.map((programId) => ({
          pairing_run_id: runId,
          pairing_block_id: blockId,
          event_program_item_id: programId,
        }));
      });
      if (blockProgramInserts.length > 0) {
        const result = await client
          .from("pairing_block_program_items")
          .insert(blockProgramInserts);
        if (result.error) throw result.error;
      }
      if (pairs.length > 0) {
        const pairResult = await client.from("event_pairs").insert(
          pairs.map((pair) => {
            const fallbackBlock = normalizedBlocks.find(
              (block) => block.sortOrder === pair.round,
            );
            return {
              pairing_run_id: runId,
              pairing_block_id: localToDatabaseBlock.get(
                pair.blockId ?? fallbackBlock?.id ?? "",
              ),
              round_number: pair.round,
              member_a_id: pair.leaderId,
              member_b_id: pair.followerId,
              is_locked: Boolean(pair.locked),
              explanation: pair.reason ?? "",
            };
          }),
        );
        if (pairResult.error) throw pairResult.error;
      }
      if (published) {
        const publishResult = await client.rpc("publish_pairing_run", {
          target_run_id: runId,
        });
        if (publishResult.error) throw publishResult.error;
      }
    } catch (error) {
      await cleanupPairingRun(runId);
      throw error;
    }
    const event = await getEvent(eventId);
    if (!event) throw new Error("Událost nebyla nalezena.");
    return event;
  },

  async updateEventStatus(eventId, status) {
    await requireAdmin();
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
    await requireAdmin();
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
    await requireAdmin();
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
    await requireAdmin();
    const [firstId, secondId] = [memberAId, memberBId].sort();
    const { error } = await requireSupabase()
      .from("pairing_preferences")
      .delete()
      .eq("member_a_id", firstId)
      .eq("member_b_id", secondId);
    if (error) throw error;
  },

  async updateMember(memberId, patch) {
    await requireAdmin();
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
    if ("joinedAt" in patch) databasePatch.active_from = patch.joinedAt || null;
    if ("note" in patch) databasePatch.admin_note = patch.note ?? null;
    const { data, error } = await requireSupabase()
      .from("members")
      .update(databasePatch)
      .eq("id", memberId)
      .select(
        "id,display_name,short_name,pairing_role,experience_level,active_from,is_active,admin_note",
      )
      .single();
    if (error) throw error;
    return memberFromRow(data as MemberRow);
  },

  async addMember(input) {
    await requireAdmin();
    const { data, error } = await requireSupabase()
      .from("members")
      .insert({
        display_name: input.fullName,
        short_name: input.shortName,
        pairing_role: input.role === "leader" ? "lead" : "follow",
        experience_level: input.experience,
        is_active: input.active,
        active_from: input.joinedAt || null,
        admin_note: input.note ?? null,
      })
      .select(
        "id,display_name,short_name,pairing_role,experience_level,active_from,is_active,admin_note",
      )
      .single();
    if (error) throw error;
    return memberFromRow(data as MemberRow);
  },

  async updateMemberAccount(memberId, email, role) {
    await requireAdmin();
    const { data, error } = await requireSupabase().rpc(
      "upsert_member_account",
      {
        target_member_id: memberId,
        new_email: email?.trim().toLowerCase() || null,
        new_role: role,
      },
    );
    if (error) throw error;
    return accountFromRpc(data);
  },

  async sendMemberInvitation(memberId) {
    await requireAdmin();
    const client = requireSupabase();
    const invitation = await client.functions.invoke("send-member-invitation", {
      body: { memberId },
    });
    if (invitation.error) {
      let cause: unknown = invitation.error;
      const context = (invitation.error as { context?: unknown }).context;
      if (context instanceof Response) {
        try {
          const body = (await context.json()) as { error?: unknown };
          if (typeof body.error === "string") cause = new Error(body.error);
        } catch {
          // Keep the original Functions error when the response is not JSON.
        }
      }
      throw new Error(getEmailAuthErrorMessage(cause, "request"));
    }
    const accounts = await client.rpc("get_admin_member_accounts");
    if (accounts.error) throw accounts.error;
    const row = ((accounts.data ?? []) as MemberAccountRow[]).find(
      (account) => account.member_id === memberId,
    );
    if (!row) throw new Error("Účet se po odeslání pozvánky nepodařilo načíst.");
    return accountFromRow(row) ?? {
      memberId,
      role: "member",
    };
  },

  async setMyPartnerWishes(eventId, partnerIds) {
    const { error } = await requireSupabase().rpc("set_my_partner_wishes", {
      target_event_id: eventId,
      partner_member_ids: partnerIds,
    });
    if (error) throw error;
  },

  async saveProgramCatalogItem(item) {
    await requireAdmin();
    const client = requireSupabase();
    const payload = {
      name: item.name.trim(),
      is_active: item.active,
      sort_order: item.sortOrder,
    };
    const result = item.id
      ? await client
          .from("program_catalog")
          .update(payload)
          .eq("id", item.id)
          .select("*")
          .single()
      : await client.from("program_catalog").insert(payload).select("*").single();
    if (result.error) throw result.error;
    return programFromRow(result.data as ProgramCatalogRow);
  },
};
