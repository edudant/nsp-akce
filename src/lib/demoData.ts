export type AppRole = "admin" | "recorder" | "member";
export type PairingRole = "leader" | "follower";
export type ExperienceLevel = "beginner" | "advanced" | "experienced";
export type EventType = "rehearsal" | "performance";
export type EventStatus = "draft" | "open" | "closed" | "cancelled";
export type AttendanceStatus =
  | "present"
  | "partial"
  | "absent"
  | "excused"
  | "unknown";
export type InterestStatus =
  | "yes"
  | "no"
  | "maybe"
  | "substitute"
  | "unset";

export interface Member {
  id: string;
  fullName: string;
  shortName: string;
  role: PairingRole;
  experience: ExperienceLevel;
  active: boolean;
  joinedAt: string;
  note?: string;
}

export interface AttendanceRecord {
  memberId: string;
  status: AttendanceStatus;
  attendedMinutes?: number;
  interest: InterestStatus;
  selected: boolean;
  note?: string;
}

export interface DancePair {
  id: string;
  leaderId: string;
  followerId: string;
  round: number;
  locked?: boolean;
  reason?: string;
  actual?: boolean;
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
  note?: string;
  responseDeadline?: string;
  attendance: AttendanceRecord[];
  pairs: DancePair[];
  pairsPublished: boolean;
}

export interface PairPreference {
  id: string;
  memberAId: string;
  memberBId: string;
  kind: "forbidden" | "discouraged" | "preferred";
  strength?: number;
  privateReason?: string;
}

export interface DemoDatabase {
  members: Member[];
  events: EnsembleEvent[];
  preferences: PairPreference[];
  scoreRows?: ScoreRow[];
  updatedAt: string;
}

export type AppDatabase = DemoDatabase;

export interface SessionUser {
  displayName: string;
  email?: string;
  role: AppRole;
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

export const roleLabels: Record<PairingRole, string> = {
  leader: "Tanečník",
  follower: "Tanečnice",
};

export const experienceLabels: Record<ExperienceLevel, string> = {
  beginner: "Začátečník",
  advanced: "Pokročilý",
  experienced: "Zkušený",
};

export const eventTypeLabels: Record<EventType, string> = {
  rehearsal: "Zkouška",
  performance: "Vystoupení",
};

export const eventStatusLabels: Record<EventStatus, string> = {
  draft: "Návrh",
  open: "Otevřená",
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
  yes: "Mám zájem",
  no: "Nemohu",
  maybe: "Ještě nevím",
  substitute: "Náhradník",
  unset: "Bez odpovědi",
};

const members: Member[] = [
  {
    id: "m-01",
    fullName: "Adam Kříž",
    shortName: "Adam K.",
    role: "leader",
    experience: "experienced",
    active: true,
    joinedAt: "2013-09-01",
  },
  {
    id: "m-02",
    fullName: "Bohdan Matějka",
    shortName: "Bohdan M.",
    role: "leader",
    experience: "advanced",
    active: true,
    joinedAt: "2018-02-01",
  },
  {
    id: "m-03",
    fullName: "Cyril Holub",
    shortName: "Cyril H.",
    role: "leader",
    experience: "beginner",
    active: true,
    joinedAt: "2026-01-15",
  },
  {
    id: "m-04",
    fullName: "Daniel Vondrák",
    shortName: "Daniel V.",
    role: "leader",
    experience: "experienced",
    active: true,
    joinedAt: "2011-09-01",
  },
  {
    id: "m-05",
    fullName: "Filip Rada",
    shortName: "Filip R.",
    role: "leader",
    experience: "advanced",
    active: true,
    joinedAt: "2020-09-01",
  },
  {
    id: "m-06",
    fullName: "Hynek Šíma",
    shortName: "Hynek Š.",
    role: "leader",
    experience: "beginner",
    active: true,
    joinedAt: "2025-10-01",
  },
  {
    id: "m-07",
    fullName: "Jan Blažek",
    shortName: "Jan B.",
    role: "leader",
    experience: "experienced",
    active: true,
    joinedAt: "2009-01-01",
  },
  {
    id: "m-08",
    fullName: "Kryštof Štěpán",
    shortName: "Kryštof Š.",
    role: "leader",
    experience: "advanced",
    active: true,
    joinedAt: "2022-04-01",
  },
  {
    id: "m-09",
    fullName: "Lukáš Koutný",
    shortName: "Lukáš K.",
    role: "leader",
    experience: "advanced",
    active: false,
    joinedAt: "2019-02-01",
    note: "Pauza do konce léta",
  },
  {
    id: "m-10",
    fullName: "Marek Dufek",
    shortName: "Marek D.",
    role: "leader",
    experience: "beginner",
    active: true,
    joinedAt: "2026-04-01",
  },
  {
    id: "m-11",
    fullName: "Alena Králová",
    shortName: "Alena K.",
    role: "follower",
    experience: "experienced",
    active: true,
    joinedAt: "2010-09-01",
  },
  {
    id: "m-12",
    fullName: "Barbora Němcová",
    shortName: "Bára N.",
    role: "follower",
    experience: "advanced",
    active: true,
    joinedAt: "2019-09-01",
  },
  {
    id: "m-13",
    fullName: "Eliška Hrušková",
    shortName: "Eliška H.",
    role: "follower",
    experience: "beginner",
    active: true,
    joinedAt: "2026-02-01",
  },
  {
    id: "m-14",
    fullName: "Hana Jindrová",
    shortName: "Hana J.",
    role: "follower",
    experience: "experienced",
    active: true,
    joinedAt: "2012-01-01",
  },
  {
    id: "m-15",
    fullName: "Iveta Kunešová",
    shortName: "Iveta K.",
    role: "follower",
    experience: "advanced",
    active: true,
    joinedAt: "2017-05-01",
  },
  {
    id: "m-16",
    fullName: "Klára Tichá",
    shortName: "Klára T.",
    role: "follower",
    experience: "beginner",
    active: true,
    joinedAt: "2025-11-01",
  },
  {
    id: "m-17",
    fullName: "Lucie Beranová",
    shortName: "Lucie B.",
    role: "follower",
    experience: "experienced",
    active: true,
    joinedAt: "2008-09-01",
  },
  {
    id: "m-18",
    fullName: "Marie Tomanová",
    shortName: "Marie T.",
    role: "follower",
    experience: "advanced",
    active: true,
    joinedAt: "2021-09-01",
  },
  {
    id: "m-19",
    fullName: "Nela Veselá",
    shortName: "Nela V.",
    role: "follower",
    experience: "beginner",
    active: true,
    joinedAt: "2026-03-01",
  },
  {
    id: "m-20",
    fullName: "Petra Šafářová",
    shortName: "Petra Š.",
    role: "follower",
    experience: "advanced",
    active: false,
    joinedAt: "2020-01-01",
  },
];

const activeMemberIds = members.filter((member) => member.active).map((member) => member.id);

function attendanceFor(
  statuses: Partial<Record<string, AttendanceStatus>>,
  interests: Partial<Record<string, InterestStatus>> = {},
): AttendanceRecord[] {
  return activeMemberIds.map((memberId) => {
    const status = statuses[memberId] ?? "unknown";
    return {
      memberId,
      status,
      attendedMinutes: status === "partial" ? 75 : undefined,
      interest: interests[memberId] ?? "unset",
      selected: status === "present" || status === "partial",
    };
  });
}

const pastStatusA: Partial<Record<string, AttendanceStatus>> = {
  "m-01": "present",
  "m-02": "present",
  "m-03": "present",
  "m-04": "partial",
  "m-05": "present",
  "m-06": "excused",
  "m-07": "present",
  "m-08": "present",
  "m-10": "absent",
  "m-11": "present",
  "m-12": "present",
  "m-13": "partial",
  "m-14": "present",
  "m-15": "present",
  "m-16": "present",
  "m-17": "present",
  "m-18": "excused",
  "m-19": "present",
};

const pastStatusB: Partial<Record<string, AttendanceStatus>> = {
  "m-01": "present",
  "m-02": "partial",
  "m-03": "present",
  "m-04": "present",
  "m-05": "excused",
  "m-06": "present",
  "m-07": "present",
  "m-08": "absent",
  "m-10": "present",
  "m-11": "present",
  "m-12": "present",
  "m-13": "excused",
  "m-14": "present",
  "m-15": "partial",
  "m-16": "present",
  "m-17": "present",
  "m-18": "present",
  "m-19": "absent",
};

const pastStatusC: Partial<Record<string, AttendanceStatus>> = {
  "m-01": "present",
  "m-02": "present",
  "m-03": "absent",
  "m-04": "present",
  "m-05": "present",
  "m-06": "partial",
  "m-07": "present",
  "m-08": "present",
  "m-10": "excused",
  "m-11": "present",
  "m-12": "present",
  "m-13": "present",
  "m-14": "present",
  "m-15": "excused",
  "m-16": "partial",
  "m-17": "present",
  "m-18": "present",
  "m-19": "present",
};

const events: EnsembleEvent[] = [
  {
    id: "e-01",
    title: "Čtvrteční zkouška",
    type: "rehearsal",
    date: "2026-07-09",
    startTime: "19:00",
    endTime: "21:00",
    location: "Sokolovna Postřekov",
    status: "closed",
    weight: 1,
    capacityPairs: 8,
    program: "Kolem Postřekova",
    attendance: attendanceFor(pastStatusA),
    pairsPublished: true,
    pairs: [
      { id: "p-01", leaderId: "m-01", followerId: "m-13", round: 1 },
      { id: "p-02", leaderId: "m-02", followerId: "m-14", round: 1 },
      { id: "p-03", leaderId: "m-03", followerId: "m-11", round: 1 },
      { id: "p-04", leaderId: "m-04", followerId: "m-16", round: 1 },
      { id: "p-05", leaderId: "m-05", followerId: "m-17", round: 1 },
      { id: "p-06", leaderId: "m-07", followerId: "m-12", round: 1 },
      { id: "p-07", leaderId: "m-08", followerId: "m-15", round: 1 },
    ],
  },
  {
    id: "e-02",
    title: "Nácvik na slavnosti",
    type: "rehearsal",
    date: "2026-07-16",
    startTime: "18:30",
    endTime: "21:00",
    location: "Sokolovna Postřekov",
    status: "closed",
    weight: 1.25,
    capacityPairs: 8,
    program: "Chodské slavnosti",
    attendance: attendanceFor(pastStatusB),
    pairsPublished: true,
    pairs: [
      { id: "p-08", leaderId: "m-01", followerId: "m-16", round: 1 },
      { id: "p-09", leaderId: "m-02", followerId: "m-13", round: 1 },
      { id: "p-10", leaderId: "m-03", followerId: "m-14", round: 1 },
      { id: "p-11", leaderId: "m-04", followerId: "m-19", round: 1 },
      { id: "p-12", leaderId: "m-06", followerId: "m-11", round: 1 },
      { id: "p-13", leaderId: "m-07", followerId: "m-15", round: 1 },
      { id: "p-14", leaderId: "m-10", followerId: "m-17", round: 1 },
    ],
  },
  {
    id: "e-03",
    title: "Generální zkouška",
    type: "rehearsal",
    date: "2026-07-23",
    startTime: "18:00",
    endTime: "21:00",
    location: "Kulturní dům",
    status: "closed",
    weight: 1.5,
    capacityPairs: 8,
    program: "Chodské slavnosti – celé pásmo",
    attendance: attendanceFor(pastStatusC),
    pairsPublished: false,
    pairs: [],
  },
  {
    id: "e-04",
    title: "Čtvrteční zkouška",
    type: "rehearsal",
    date: "2026-07-30",
    startTime: "19:00",
    endTime: "21:00",
    location: "Sokolovna Postřekov",
    status: "open",
    weight: 1,
    capacityPairs: 8,
    program: "Zahraj mi houdečku",
    note: "Prosíme přijít včas, projdeme nové rozestavení.",
    attendance: attendanceFor(
      {},
      {
        "m-01": "yes",
        "m-02": "yes",
        "m-03": "yes",
        "m-04": "no",
        "m-05": "yes",
        "m-06": "maybe",
        "m-07": "yes",
        "m-08": "yes",
        "m-10": "yes",
        "m-11": "yes",
        "m-12": "yes",
        "m-13": "yes",
        "m-14": "yes",
        "m-15": "maybe",
        "m-16": "yes",
        "m-17": "yes",
        "m-18": "no",
        "m-19": "yes",
      },
    ),
    pairsPublished: false,
    pairs: [],
  },
  {
    id: "e-05",
    title: "Chodské slavnosti",
    type: "performance",
    date: "2026-08-08",
    startTime: "14:30",
    endTime: "16:00",
    location: "Domažlice – hlavní pódium",
    status: "open",
    weight: 2,
    capacityPairs: 7,
    responseDeadline: "2026-08-02",
    program: "Postřekovská svatba",
    note: "Sraz v krojích ve 13:30 za pódiem.",
    attendance: attendanceFor(
      {},
      {
        "m-01": "yes",
        "m-02": "yes",
        "m-03": "substitute",
        "m-04": "yes",
        "m-05": "yes",
        "m-06": "no",
        "m-07": "yes",
        "m-08": "maybe",
        "m-10": "no",
        "m-11": "yes",
        "m-12": "yes",
        "m-13": "substitute",
        "m-14": "yes",
        "m-15": "yes",
        "m-16": "maybe",
        "m-17": "yes",
        "m-18": "yes",
        "m-19": "no",
      },
    ),
    pairsPublished: false,
    pairs: [],
  },
  {
    id: "e-06",
    title: "Pouť v Postřekově",
    type: "performance",
    date: "2026-08-16",
    startTime: "15:00",
    endTime: "16:00",
    location: "Náves Postřekov",
    status: "draft",
    weight: 1.5,
    capacityPairs: 8,
    responseDeadline: "2026-08-09",
    program: "Pouťové pásmo",
    attendance: attendanceFor({}),
    pairsPublished: false,
    pairs: [],
  },
  {
    id: "e-07",
    title: "Zahájení podzimní sezony",
    type: "rehearsal",
    date: "2026-09-03",
    startTime: "19:00",
    endTime: "21:00",
    location: "Sokolovna Postřekov",
    status: "draft",
    weight: 1,
    capacityPairs: 9,
    attendance: attendanceFor({}),
    pairsPublished: false,
    pairs: [],
  },
];

const preferences: PairPreference[] = [
  {
    id: "pref-01",
    memberAId: "m-02",
    memberBId: "m-12",
    kind: "preferred",
  },
  {
    id: "pref-02",
    memberAId: "m-05",
    memberBId: "m-15",
    kind: "discouraged",
    privateReason: "Interní domluva s vedoucím",
  },
  {
    id: "pref-03",
    memberAId: "m-08",
    memberBId: "m-18",
    kind: "forbidden",
    privateReason: "Zdravotní omezení pro společný tanec",
  },
];

const seedDatabase: DemoDatabase = {
  members,
  events,
  preferences,
  updatedAt: "2026-07-27T09:45:00.000Z",
};

const STORAGE_KEY = "nsp-akce-demo-v3";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function readDatabase(): DemoDatabase {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as DemoDatabase) : clone(seedDatabase);
  } catch {
    return clone(seedDatabase);
  }
}

function writeDatabase(database: DemoDatabase): DemoDatabase {
  const next = { ...database, updatedAt: new Date().toISOString() };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("nsp-demo-change"));
  return clone(next);
}

const wait = (duration = 170) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, duration));

export function getEventDurationMinutes(event: EnsembleEvent): number {
  const [startHour = 0, startMinute = 0] = event.startTime.split(":").map(Number);
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
    const proportion =
      (record.attendedMinutes ?? 0) / getEventDurationMinutes(event);
    return event.weight * Math.min(1, Math.max(0, proportion));
  }
  return 0;
}

export function calculateScores(database: DemoDatabase): ScoreRow[] {
  if (database.scoreRows) {
    return clone(database.scoreRows).sort(
      (first, second) => second.total - first.total,
    );
  }
  const scoredEvents = database.events.filter(
    (event) => event.status === "closed",
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

export const demoApi = {
  async getDatabase(): Promise<DemoDatabase> {
    await wait();
    return clone(readDatabase());
  },

  async getMembers(): Promise<Member[]> {
    await wait();
    return clone(readDatabase().members);
  },

  async getEvents(): Promise<EnsembleEvent[]> {
    await wait();
    return clone(readDatabase().events);
  },

  async getEvent(id: string): Promise<EnsembleEvent | null> {
    await wait(110);
    return (
      clone(readDatabase().events.find((event) => event.id === id)) ?? null
    );
  },

  async updateAttendance(
    eventId: string,
    memberId: string,
    patch: Partial<AttendanceRecord>,
  ): Promise<EnsembleEvent> {
    await wait(90);
    const database = readDatabase();
    const event = database.events.find((item) => item.id === eventId);
    if (!event) throw new Error("Událost nebyla nalezena.");
    const record = event.attendance.find(
      (attendance) => attendance.memberId === memberId,
    );
    if (!record) {
      event.attendance.push({
        memberId,
        status: "unknown",
        interest: "unset",
        selected: false,
        ...patch,
      });
    } else {
      Object.assign(record, patch);
    }
    writeDatabase(database);
    return clone(event);
  },

  async updateAllAttendance(
    eventId: string,
    status: AttendanceStatus,
  ): Promise<EnsembleEvent> {
    await wait(110);
    const database = readDatabase();
    const event = database.events.find((item) => item.id === eventId);
    if (!event) throw new Error("Událost nebyla nalezena.");
    event.attendance = event.attendance.map((record) => ({
      ...record,
      status,
      attendedMinutes:
        status === "partial" ? getEventDurationMinutes(event) / 2 : undefined,
      selected:
        status === "present" || status === "partial" ? true : record.selected,
    }));
    writeDatabase(database);
    return clone(event);
  },

  async addEvent(
    input: Omit<EnsembleEvent, "id" | "attendance" | "pairs">,
  ): Promise<EnsembleEvent> {
    await wait(150);
    const database = readDatabase();
    const event: EnsembleEvent = {
      ...input,
      id: `e-${Date.now()}`,
      attendance: database.members
        .filter((member) => member.active)
        .map((member) => ({
          memberId: member.id,
          status: "unknown",
          interest: "unset",
          selected: false,
        })),
      pairs: [],
    };
    database.events.push(event);
    writeDatabase(database);
    return clone(event);
  },

  async savePairs(
    eventId: string,
    pairs: DancePair[],
    published = false,
  ): Promise<EnsembleEvent> {
    await wait(150);
    const database = readDatabase();
    const event = database.events.find((item) => item.id === eventId);
    if (!event) throw new Error("Událost nebyla nalezena.");
    event.pairs = clone(pairs);
    event.pairsPublished = published;
    writeDatabase(database);
    return clone(event);
  },

  async updateEventStatus(
    eventId: string,
    status: EventStatus,
  ): Promise<EnsembleEvent> {
    await wait(100);
    const database = readDatabase();
    const event = database.events.find((item) => item.id === eventId);
    if (!event) throw new Error("Událost nebyla nalezena.");
    event.status = status;
    writeDatabase(database);
    return clone(event);
  },

  async confirmActualPairs(eventId: string): Promise<EnsembleEvent> {
    await wait(120);
    const database = readDatabase();
    const event = database.events.find((item) => item.id === eventId);
    if (!event) throw new Error("Událost nebyla nalezena.");
    event.pairs = event.pairs.map((pair) => ({ ...pair, actual: true }));
    writeDatabase(database);
    return clone(event);
  },

  async addPreference(
    input: Omit<PairPreference, "id">,
  ): Promise<PairPreference> {
    await wait(100);
    const database = readDatabase();
    const existing = database.preferences.find(
      (item) =>
        [item.memberAId, item.memberBId].sort().join(":") ===
        [input.memberAId, input.memberBId].sort().join(":"),
    );
    const preference: PairPreference = {
      ...input,
      id:
        existing?.id ??
        `preference-${input.memberAId}-${input.memberBId}`,
    };
    if (existing) Object.assign(existing, preference);
    else database.preferences.push(preference);
    writeDatabase(database);
    return clone(preference);
  },

  async deletePreference(
    memberAId: string,
    memberBId: string,
  ): Promise<void> {
    await wait(90);
    const database = readDatabase();
    const key = [memberAId, memberBId].sort().join(":");
    database.preferences = database.preferences.filter(
      (item) => [item.memberAId, item.memberBId].sort().join(":") !== key,
    );
    writeDatabase(database);
  },

  async updateMember(
    memberId: string,
    patch: Partial<Member>,
  ): Promise<Member> {
    await wait(120);
    const database = readDatabase();
    const member = database.members.find((item) => item.id === memberId);
    if (!member) throw new Error("Člen nebyl nalezen.");
    Object.assign(member, patch);
    writeDatabase(database);
    return clone(member);
  },

  async addMember(input: Omit<Member, "id">): Promise<Member> {
    await wait(150);
    const database = readDatabase();
    const member: Member = { ...input, id: `m-${Date.now()}` };
    database.members.push(member);
    for (const event of database.events) {
      event.attendance.push({
        memberId: member.id,
        status: "unknown",
        interest: "unset",
        selected: false,
      });
    }
    writeDatabase(database);
    return clone(member);
  },

  async reset(): Promise<DemoDatabase> {
    await wait(180);
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event("nsp-demo-change"));
    return clone(seedDatabase);
  },
};

export type AppApi = typeof demoApi;

/**
 * Jediný datový adaptér používaný UI. Produkční implementace jej může nahradit
 * Supabase repozitářem bez změn jednotlivých stránek.
 */
export const appApi: AppApi = demoApi;
