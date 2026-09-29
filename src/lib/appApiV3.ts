import type {
  AppApi,
  AppDatabase,
  EnsembleEvent,
  Member,
  ScoreRow,
  EventAuditEntry,
} from "./domain";
import { requireSupabase } from "./supabase";
import { supabaseApi } from "./supabaseData";

async function mutate(action: string, payload: unknown) {
  const { data, error } = await requireSupabase().rpc("mutate_app_v3", {
    action,
    payload,
  });
  if (error) throw error;
  return data;
}
function normalizeMember(member: Member): Member {
  return {
    ...member,
    experience: member.experience ?? "advanced",
    experienceKnown: member.experienceKnown === true,
  };
}
export async function getDatabaseV3(
  memberPreview = false,
): Promise<AppDatabase> {
  const { data, error } = await requireSupabase().rpc(
    memberPreview ? "member_preview_v3" : "get_app_database_v3",
  );
  if (error) throw error;
  const db = data as AppDatabase;
  db.members = db.members.map(normalizeMember);
  db.scoreRows = db.scoreRows?.map((row) => ({
    ...row,
    member: normalizeMember(row.member),
  }));
  db.myHistory = db.events
    .filter((event) => event.status === "closed")
    .map((event) => {
      const record = event.attendance.find(
        (item) => item.memberId === db.myMemberId,
      );
      return {
        eventId: event.id,
        title: event.title,
        type: event.type,
        date: event.date,
        response: record?.interest ?? "unset",
        attendance: record?.status ?? "unknown",
        points: record?.earnedPoints ?? 0,
        pairs:
          event.type === "performance"
            ? (event.actualPairs ?? event.pairs)
                .filter(
                  (pair) =>
                    pair.actual &&
                    (pair.leaderId === db.myMemberId ||
                      pair.followerId === db.myMemberId),
                )
                .map((pair) => {
                  const partnerId =
                    pair.leaderId === db.myMemberId
                      ? pair.followerId
                      : pair.leaderId;
                  return {
                    partnerId,
                    partnerName:
                      db.members.find((member) => member.id === partnerId)
                        ?.fullName ?? "",
                    programNames: [],
                  };
                })
            : [],
      };
    });
  return db;
}
async function eventById(id: string): Promise<EnsembleEvent> {
  const event = (await getDatabaseV3()).events.find((item) => item.id === id);
  if (!event) throw new Error("Událost nebyla nalezena.");
  return event;
}
export const appApiV3: AppApi = {
  ...supabaseApi,
  getDatabase: getDatabaseV3,
  async getEventAudit(eventId, memberId, memberPreview = false) {
    const { data, error } = await requireSupabase().rpc("get_event_audit_v4", {
      target_event_id: eventId,
      target_member_id: memberId ?? null,
      member_preview: memberPreview,
    });
    if (error) throw error;
    return data as EventAuditEntry[];
  },
  getMembers: async () => (await getDatabaseV3()).members,
  getEvents: async () => (await getDatabaseV3()).events,
  getEvent: async (id) =>
    (await getDatabaseV3()).events.find((event) => event.id === id) ?? null,
  async getMemberHistory(memberId) {
    const db = await getDatabaseV3();
    const id = memberId ?? db.myMemberId;
    if (db.accessMode !== "admin" && id !== db.myMemberId)
      throw new Error("Historie není dostupná.");
    return db.events
      .filter((event) => event.status === "closed")
      .map((event) => {
        const record = event.attendance.find((item) => item.memberId === id);
        return {
          eventId: event.id,
          title: event.title,
          type: event.type,
          date: event.date,
          response: record?.interest ?? "unset",
          attendance: record?.status ?? "unknown",
          points: record?.earnedPoints ?? 0,
          pairs:
            event.type === "performance"
              ? (event.actualPairs ?? event.pairs)
                  .filter(
                    (pair) =>
                      pair.actual &&
                      (pair.leaderId === id || pair.followerId === id),
                  )
                  .map((pair) => {
                    const partnerId =
                      pair.leaderId === id ? pair.followerId : pair.leaderId;
                    return {
                      partnerId,
                      partnerName:
                        db.members.find((member) => member.id === partnerId)
                          ?.fullName ?? "",
                      programNames: [],
                    };
                  })
              : [],
        };
      });
  },
  async addMember(input) {
    return normalizeMember(await mutate("member", input));
  },
  async updateMember(id, patch) {
    return normalizeMember(
      await mutate("member", { ...patch, id, note: patch.note ?? null }),
    );
  },
  async addEvent(input) {
    const result = await mutate("event", input);
    return eventById(result.id);
  },
  async updateEvent(id, patch) {
    await mutate("event", { ...patch, id });
  },
  async updateEventProgram(id, items) {
    const { error } = await requireSupabase().rpc("update_event_program", {
      target_event_id: id,
      program_items: items.map((item) => ({
        id: item.id ?? null,
        catalogId: item.catalogId ?? null,
        customName: item.customName?.trim() || null,
      })),
    });
    if (error) throw error;
    return eventById(id);
  },
  async updateEventStatus(id, status) {
    await mutate("event", { id, status });
    return eventById(id);
  },
  async updateAttendance(id, memberId, patch) {
    await mutate("attendance", { ...patch, id, memberId });
    return eventById(id);
  },
  async updateAllAttendance(id, status) {
    const event = await eventById(id);
    for (const record of event.attendance)
      await mutate("attendance", {
        id,
        memberId: record.memberId,
        status,
        attendancePercent: status === "partial" ? 50 : undefined,
      });
    return eventById(id);
  },
  async updateMyResponse(id, interest, note) {
    await mutate("response", { id, interest, note: note ?? null });
    return eventById(id);
  },
  async setMyPartnerWishes(id, partnerIds) {
    await mutate("wishes", { id, partnerIds });
  },
  async savePairs(id, pairs, published = false) {
    const { error } = await requireSupabase().rpc("save_pairs_v3", {
      event_id: id,
      pairs,
      published,
    });
    if (error) throw error;
    return eventById(id);
  },
  async confirmActualPairs(id) {
    const event = await eventById(id);
    if (event.type !== "performance" || event.seasonKind !== "dance")
      throw new Error("Skutečné páry jsou pouze pro taneční vystoupení.");
    const client = requireSupabase();
    const run = await client
      .from("pairing_runs")
      .select("id")
      .eq("event_id", id)
      .eq("status", "published")
      .single();
    if (run.error) throw run.error;
    const { error } = await client.rpc("confirm_actual_pairs", {
      target_run_id: run.data.id,
    });
    if (error) throw error;
    return eventById(id);
  },
  async setPartnerWishes(id, memberId, partnerIds) {
    await mutate("adminWishes", { id, memberId, partnerIds });
  },
  async saveSeason(input) {
    await mutate("season", input);
  },
  async getScores(filters, memberPreview = false) {
    const { data, error } = await requireSupabase().rpc(
      memberPreview ? "member_preview_v3" : "scores_v3",
      {
        filters,
      },
    );
    if (error) throw error;
    return (data as ScoreRow[]).map((row) => ({
      ...row,
      member: normalizeMember(row.member),
    }));
  },
  async saveSong(input) {
    await mutate("song", { ...input, categoryId: input.categoryId ?? null });
  },
  async saveSongCategory(input) {
    await mutate("category", input);
  },
  async saveSongSeries(id, series) {
    await mutate("series", { ...series, id, seriesId: series.id });
  },
  async deleteSongSeries(id, seriesId) {
    await mutate("deleteSeries", { id, seriesId });
  },
  async generateMemberLoginCode(memberId) {
    const { data, error } = await requireSupabase().functions.invoke(
      "generate-member-login-code",
      { body: { memberId } },
    );
    if (error) {
      const context = (error as { context?: Response }).context;
      const details = await context?.json().catch(() => null);
      throw new Error(details?.error ?? error.message);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  },
};
