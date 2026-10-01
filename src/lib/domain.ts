export type AppRole = "admin" | "member";
export type AccessMode = "admin" | "member" | "shared";
export type PairingRole = "leader" | "follower";
export type ExperienceLevel = "beginner" | "advanced" | "experienced";
export type AgeGroup = "young" | "old";
export type EventType = "rehearsal" | "performance";
export type EventStatus =
  | "draft"
  | "open"
  | "confirmed"
  | "closed"
  | "cancelled";
export type AttendanceStatus =
  | "present"
  | "partial"
  | "absent"
  | "excused"
  | "unknown";
export type InterestStatus = "yes" | "no" | "maybe" | "substitute" | "unset";

export interface MemberAccount {
  memberId: string;
  email?: string;
  role: AppRole;
  linkedUserId?: string;
  activatedAt?: string;
  lastInvitationSentAt?: string;
  lastSignInAt?: string;
}

export interface Member {
  id: string;
  fullName: string;
  shortName: string;
  role: PairingRole;
  experience: ExperienceLevel;
  /** False when a read-only payload intentionally omits the private level. */
  experienceKnown?: boolean;
  ageGroup: AgeGroup | null;
  ageGroups?: AgeGroup[];
  active: boolean;
  joinedAt: string;
  note?: string;
  account?: MemberAccount;
}

export interface AttendanceRecord {
  memberId: string;
  status: AttendanceStatus;
  attendedMinutes?: number;
  attendancePercent?: number;
  standing?: boolean;
  actualStanding?: boolean;
  memberResponse?: {
    interest: InterestStatus;
    note?: string;
    at: string;
  } | null;
  adminResponse?: {
    interest: InterestStatus;
    note?: string;
    at: string;
  } | null;
  adminChangedAt?: string | null;
  /** Server-calculated value used by restricted views that cannot see weights. */
  earnedPoints?: number;
  interest: InterestStatus;
  selected: boolean;
  note?: string;
}

export type AttendanceDefaults = Pick<AttendanceRecord, "interest" | "status"> &
  Pick<Partial<AttendanceRecord>, "attendancePercent" | "note">;

export interface ProgramCatalogItem {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
}

export interface EventProgramItem {
  id: string;
  name: string;
  catalogId?: string;
  custom: boolean;
  sortOrder: number;
}

export interface EventProgramUpdateItem {
  /** Existing event-program ID. Omit for a newly added item. */
  id?: string;
  /** Exactly one of catalogId or customName must be present. */
  catalogId?: string;
  customName?: string;
}

export interface PairingBlock {
  id: string;
  name: string;
  programItemIds: string[];
  appliesToAll: boolean;
  sortOrder: number;
}

export interface DancePair {
  id: string;
  leaderId: string;
  followerId: string;
  /** One-based compatibility ordinal retained during the round-to-block migration. */
  round: number;
  blockId?: string;
  blockName?: string;
  programItemIds?: string[];
  locked?: boolean;
  reason?: string;
  actual?: boolean;
  ageGroup?: AgeGroup;
  belowLine?: boolean;
}

export interface Season {
  id: string;
  name: string;
  kind: "dance" | "carols";
  dateFrom: string;
  dateTo: string;
  active: boolean;
}
export interface SongCategory {
  id: string;
  name: string;
}
export interface Song {
  id: string;
  kind?: "song" | "carol";
  hasText?: boolean;
  name: string;
  categoryId?: string;
  active: boolean;
}
export interface SongSeries {
  id: string;
  name: string;
  songIds: string[];
  confirmed: boolean;
}
export interface PairingRosterEntry {
  memberId: string;
  standing: boolean;
  fullName?: string;
  role?: Member["role"];
  ageGroups?: AgeGroup[];
}
export interface PairSet {
  id: string;
  name: string;
  createdAt: string;
  pairs: DancePair[];
  published: boolean;
  roster?: PairingRosterEntry[];
}
export interface ScoreFilter {
  seasonId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface EnsembleEvent {
  id: string;
  title: string;
  type: EventType;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  status: EventStatus;
  weight: number;
  capacityPairs: number;
  program?: string;
  programItems?: EventProgramItem[];
  pairingBlocks?: PairingBlock[];
  note?: string;
  responseDeadline?: string;
  /** Authoritative response availability calculated by the backend. */
  canRespond?: boolean;
  canClose?: boolean;
  partnerOptions?: string[];
  /** Describes whether attendance contains the whole roster, only the viewer, or no roster. */
  attendanceScope?: "all" | "self" | "none";
  /** False when a shared payload deliberately omits weight and capacity. */
  eventDetailsAvailable?: boolean;
  attendance: AttendanceRecord[];
  pairs: DancePair[];
  pairsPublished: boolean;
  seasonId?: string;
  seasonKind?: Season["kind"];
  oldPairs?: number;
  youngPairs?: number;
  singing?: boolean;
  songSeries?: SongSeries[];
  pairSets?: PairSet[];
  pairingRoster?: PairingRosterEntry[];
  pairingName?: string;
  pairingCreatedAt?: string;
  actualPairs?: DancePair[];
}

export interface PairPreference {
  id: string;
  memberAId: string;
  memberBId: string;
  kind: "forbidden" | "discouraged" | "preferred";
  strength?: number;
  privateReason?: string;
  validFrom?: string;
  validTo?: string;
}

export interface PartnerWish {
  eventId: string;
  memberId: string;
  partnerId: string;
}

export interface MemberHistoryEntry {
  eventId: string;
  title: string;
  type: EventType;
  date: string;
  response: InterestStatus;
  attendance: AttendanceStatus;
  points: number;
  pairs: Array<{
    partnerId: string;
    partnerName: string;
    blockName?: string;
    programNames: string[];
  }>;
}

export interface ScoreRow {
  member: Member;
  total: number;
  rehearsal: number;
  performance: number;
  fullAttendance: number;
  partialAttendance: number;
  excused: number;
  possible: number;
  attendanceRate: number;
}

export interface AppDatabase {
  members: Member[];
  events: EnsembleEvent[];
  preferences: PairPreference[];
  partnerWishes?: PartnerWish[];
  programCatalog?: ProgramCatalogItem[];
  scoreRows?: ScoreRow[];
  myMemberId?: string;
  myHistory?: MemberHistoryEntry[];
  accessMode: AccessMode;
  updatedAt: string;
  seasons?: Season[];
  songs?: Song[];
  songCategories?: SongCategory[];
}

export interface SessionUser {
  displayName: string;
  email?: string;
  memberId?: string;
  role: AppRole;
  accessMode: AccessMode;
}

export interface EventAuditEntry {
  id: string;
  at: string;
  actorKind: "member" | "admin" | "system" | "legacy";
  actorName: string;
  source: string;
  kind: "response" | "attendance" | "selection" | "status";
  memberId?: string;
  action: string;
  before: Record<string, string | number | boolean | null> | null;
  after: Record<string, string | number | boolean | null> | null;
}
export interface AppApi {
  getEventAudit(
    eventId: string,
    memberId?: string,
    memberPreview?: boolean,
  ): Promise<EventAuditEntry[]>;
  getDatabase(memberPreview?: boolean): Promise<AppDatabase>;
  getMembers(): Promise<Member[]>;
  getEvents(): Promise<EnsembleEvent[]>;
  getEvent(id: string): Promise<EnsembleEvent | null>;
  getMemberHistory(memberId?: string): Promise<MemberHistoryEntry[]>;
  updateAttendance(
    eventId: string,
    memberId: string,
    patch: Partial<AttendanceRecord>,
  ): Promise<EnsembleEvent>;
  addAttendanceBatch(
    eventId: string,
    memberIds: string[],
    defaults: AttendanceDefaults,
  ): Promise<void>;
  updateMyResponse(
    eventId: string,
    response: InterestStatus,
    note?: string,
  ): Promise<EnsembleEvent>;
  updateAllAttendance(
    eventId: string,
    status: AttendanceStatus,
  ): Promise<EnsembleEvent>;
  addEvent(
    input: Omit<EnsembleEvent, "id" | "attendance" | "pairs">,
  ): Promise<EnsembleEvent>;
  updateEventProgram(
    eventId: string,
    items: EventProgramUpdateItem[],
  ): Promise<EnsembleEvent>;
  savePairs(
    eventId: string,
    pairs: DancePair[],
    published?: boolean,
    blocks?: PairingBlock[],
    name?: string,
  ): Promise<EnsembleEvent>;
  updateEventStatus(
    eventId: string,
    status: EventStatus,
  ): Promise<EnsembleEvent>;
  confirmActualPairs(eventId: string): Promise<EnsembleEvent>;
  addPreference(input: Omit<PairPreference, "id">): Promise<PairPreference>;
  deletePreference(memberAId: string, memberBId: string): Promise<void>;
  updateMember(memberId: string, patch: Partial<Member>): Promise<Member>;
  addMember(input: Omit<Member, "id">): Promise<Member>;
  updateMemberAccount(
    memberId: string,
    email: string | null,
    role: AppRole,
  ): Promise<MemberAccount>;
  sendMemberInvitation(memberId: string): Promise<MemberAccount>;
  setMyPartnerWishes(eventId: string, partnerIds: string[]): Promise<void>;
  saveProgramCatalogItem(
    item: Omit<ProgramCatalogItem, "id"> & { id?: string },
  ): Promise<ProgramCatalogItem>;
  setPartnerWishes(
    eventId: string,
    memberId: string,
    partnerIds: string[],
  ): Promise<void>;
  saveSeason(input: Omit<Season, "id"> & { id?: string }): Promise<void>;
  getScores(filter: ScoreFilter, memberPreview?: boolean): Promise<ScoreRow[]>;
  saveSong(input: Omit<Song, "id"> & { id?: string }): Promise<void>;
  saveSongCategory(
    input: Omit<SongCategory, "id"> & { id?: string },
  ): Promise<void>;
  saveSongSeries(
    eventId: string,
    series: Omit<SongSeries, "id"> & { id?: string },
  ): Promise<void>;
  deleteSongSeries(eventId: string, seriesId: string): Promise<void>;
  updateEvent(eventId: string, patch: Partial<EnsembleEvent>): Promise<void>;
  generateMemberLoginCode(
    memberId: string,
  ): Promise<{ code: string; email: string }>;
}

export const roleLabels: Record<PairingRole, string> = {
  leader: "Tanečník",
  follower: "Tanečnice",
};

export const experienceLabels: Record<ExperienceLevel, string> = {
  beginner: "Začátečník",
  advanced: "Pokročilý",
  experienced: "Zkušený",
};

export const ageGroupLabels: Record<AgeGroup, string> = {
  young: "Mladý",
  old: "Starý",
};

export function ageGroupLabel(ageGroup: AgeGroup | null): string {
  return ageGroup ? ageGroupLabels[ageGroup] : "Nezařazeno";
}

export const eventTypeLabels: Record<EventType, string> = {
  rehearsal: "Zkouška",
  performance: "Vystoupení",
};

export const eventStatusLabels: Record<EventStatus, string> = {
  draft: "Návrh",
  open: "Otevřená",
  confirmed: "Potvrzená",
  closed: "Uzavřená",
  cancelled: "Zrušená",
};

export const attendanceLabels: Record<AttendanceStatus, string> = {
  present: "Přítomen",
  partial: "Částečně",
  absent: "Nepřítomen",
  excused: "Omluven",
  unknown: "Nezapsáno",
};

export const interestLabels: Record<InterestStatus, string> = {
  yes: "Přijdu",
  no: "Nepřijdu",
  maybe: "Zatím nevím",
  substitute: "Náhradník",
  unset: "Bez odpovědi",
};

export function getEventDurationMinutes(event: EnsembleEvent): number {
  const [startHour = 0, startMinute = 0] = event.startTime
    .split(":")
    .map(Number);
  const [endHour = 0, endMinute = 0] = event.endTime.split(":").map(Number);
  return Math.max(1, endHour * 60 + endMinute - startHour * 60 - startMinute);
}

export function getAttendancePoints(
  event: EnsembleEvent,
  record: AttendanceRecord,
): number {
  if (event.status === "cancelled") return 0;
  if (record.status === "present") return event.weight;
  if (record.status === "partial") {
    if (record.attendancePercent != null)
      return (
        (event.weight * Math.min(100, Math.max(0, record.attendancePercent))) /
        100
      );
    const proportion =
      (record.attendedMinutes ?? 0) / getEventDurationMinutes(event);
    return event.weight * Math.min(1, Math.max(0, proportion));
  }
  return 0;
}

export function calculateScores(database: AppDatabase): ScoreRow[] {
  if (database.scoreRows) {
    return [...database.scoreRows].sort(
      (first, second) => second.total - first.total,
    );
  }
  const scoredEvents = database.events.filter(
    (event) =>
      event.status === "closed" &&
      (!database.seasons?.some(
        (season) => season.active && season.kind === "dance",
      ) ||
        event.seasonId ===
          database.seasons.find(
            (season) => season.active && season.kind === "dance",
          )?.id),
  );

  return database.members
    .filter((member) => member.active)
    .map((member) => {
      let rehearsal = 0;
      let performance = 0;
      let fullAttendance = 0;
      let partialAttendance = 0;
      let excused = 0;
      for (const event of scoredEvents) {
        const record = event.attendance.find(
          (attendance) => attendance.memberId === member.id,
        );
        if (!record) continue;
        const points = getAttendancePoints(event, record);
        if (event.type === "rehearsal") rehearsal += points;
        else performance += points;
        if (record.status === "present") fullAttendance += 1;
        if (record.status === "partial") partialAttendance += 1;
        if (record.status === "excused") excused += 1;
      }
      const possible = scoredEvents.reduce(
        (total, event) => total + event.weight,
        0,
      );
      const total = rehearsal + performance;
      return {
        member,
        total,
        rehearsal,
        performance,
        fullAttendance,
        partialAttendance,
        excused,
        possible,
        attendanceRate: possible > 0 ? (total / possible) * 100 : 0,
      };
    })
    .sort((first, second) => second.total - first.total);
}
