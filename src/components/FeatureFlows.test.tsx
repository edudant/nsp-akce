import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  within,
  cleanup,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Help } from "./Help";
import { ResponseEditor, AttendancePanel } from "./AttendancePanel";
import { SongSeriesPanel } from "./SongSeriesPanel";
import { useState } from "react";
import { Dialog } from "./Ui";
import { EventDetailPage } from "../pages/EventDetailPage";
import { EventPairingEditor } from "./EventPairingEditor";
import { EventProgramEditor } from "./EventProgramEditor";
import { EventsPage } from "../pages/EventsPage";
import { DashboardPage } from "../pages/DashboardPage";
import { EventForm } from "./EventForm";
import type { AppDatabase, EnsembleEvent, Member } from "../lib/domain";
const api = vi.hoisted(() => ({
  updateAttendance: vi.fn(),
  addAttendanceBatch: vi.fn(),
  savePairs: vi.fn(),
  generatePairs: vi.fn(),
  updateMyResponse: vi.fn(),
  saveSongSeries: vi.fn(),
  deleteSongSeries: vi.fn(),
  setPartnerWishes: vi.fn(),
  getEventAudit: vi.fn().mockResolvedValue([]),
}));
vi.mock("../lib/dataApi", () => ({ appApi: api }));
vi.mock("../lib/pairingClient", () => ({
  generatePairsAsync: api.generatePairs,
}));
const data = vi.hoisted(() => ({ current: null as AppDatabase | null }));
vi.mock("./DataContext", () => ({
  databaseQueryKey: ["database"],
  useDatabase: () => ({ data: data.current }),
  useViewMode: () => ({ memberPreview: false, scope: "test" }),
}));
const members: Member[] = [
  {
    id: "a",
    fullName: "Adam",
    shortName: "A",
    role: "leader",
    ageGroup: "old",
    ageGroups: ["old"],
    active: true,
    experience: "experienced",
    joinedAt: "",
  },
  {
    id: "b",
    fullName: "Žofie",
    shortName: "Z",
    role: "follower",
    ageGroup: "old",
    ageGroups: ["old"],
    active: true,
    experience: "experienced",
    joinedAt: "",
  },
];
const fixture = (patch: Partial<EnsembleEvent> = {}): EnsembleEvent => ({
  id: "e",
  title: "Test",
  type: "performance",
  date: "2026-09-28",
  startTime: "19:00",
  endTime: "21:00",
  location: "Stará škola",
  weight: 2,
  status: "open",
  capacityPairs: 1,
  canRespond: true,
  seasonId: "s",
  seasonKind: "dance",
  attendance: members.map((m) => ({
    memberId: m.id,
    status: "unknown",
    interest: "unset",
    selected: false,
  })),
  pairs: [],
  pairsPublished: false,
  singing: true,
  ...patch,
});
function setup(event = fixture()) {
  const db: AppDatabase = {
    members,
    events: [event],
    preferences: [],
    accessMode: "admin",
    updatedAt: "",
    seasons: [
      {
        id: "s",
        name: "Taneční",
        kind: "dance",
        dateFrom: "2026-01-01",
        dateTo: "2027-08-10",
        active: true,
      },
    ],
    songs: [
      { id: "1", name: "Píseň jedna", active: true },
      { id: "2", name: "Píseň dvě", active: true },
    ],
    songCategories: [],
  };
  data.current = db;
  return db;
}
const wrap = (child: React.ReactNode) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            mutations: { retry: false },
            queries: { retry: false },
          },
        })
      }
    >
      {child}
    </QueryClientProvider>,
  );
beforeEach(() => {
  vi.clearAllMocks();
  api.updateAttendance.mockResolvedValue(fixture());
  api.addAttendanceBatch.mockResolvedValue(undefined);
  api.saveSongSeries.mockResolvedValue(undefined);
});
afterEach(cleanup);
describe("feature UI flows", () => {
  it("opens the generator only from the event pairs tab", async () => {
    setup(fixture({ attendanceScope: "all" }));
    wrap(<EventDetailPage eventId="e" canAdmin canEdit canPair />);
    expect(
      screen.queryByRole("link", { name: "Generátor párů" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Vygenerovat návrh" }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Páry" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Přidat sadu párů" }),
    );
    expect(
      within(screen.getByRole("dialog")).getByRole("heading", {
        name: "Generátor párů",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Vygenerovat návrh" }),
    ).toBeVisible();
    expect(
      (screen.getByLabelText("Název sady") as HTMLInputElement).value,
    ).toMatch(/^\d{1,2}\. \d{1,2}\. \d{4} \d{2}:\d{2}$/);
  });
  it("edits a selected performance set in a dialog and Escape closes only pair detail", async () => {
    const pair = {
      id: "p",
      leaderId: "a",
      followerId: "b",
      ageGroup: "old" as const,
      round: 1,
      belowLine: false,
    };
    const latest = {
      id: "latest",
      name: "Večerní",
      createdAt: "2026-10-01T16:00:00Z",
      published: true,
      pairs: [pair],
    };
    setup(
      fixture({
        attendanceScope: "all",
        attendance: members.map((m) => ({
          memberId: m.id,
          status: "present",
          interest: "yes",
          selected: true,
        })),
        pairSets: [
          {
            ...latest,
            id: "old",
            name: "Ranní",
            createdAt: "2026-10-01T08:00:00Z",
          },
          latest,
        ],
      }),
    );
    wrap(<EventDetailPage eventId="e" canAdmin canEdit canPair />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Páry" }));
    expect(screen.getByLabelText("Uložená sada párů")).toHaveValue("latest");
    await user.selectOptions(screen.getByLabelText("Uložená sada párů"), "old");
    await user.click(screen.getByRole("button", { name: "Upravit sadu" }));
    expect(screen.getByLabelText("Název sady")).toHaveValue("Ranní");
    await user.click(
      screen.getByRole("button", { name: "Detail páru: Adam + Žofie" }),
    );
    expect(screen.getAllByRole("dialog")).toHaveLength(2);
    await user.keyboard("{Escape}");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByLabelText("Název sady")).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Potvrdit skutečné/ }),
    ).not.toBeInTheDocument();
  });
  it("allows every admin status in the edit form even for a future event", async () => {
    const e = fixture({
      type: "rehearsal",
      date: "2099-10-01",
      canClose: false,
    });
    setup(e);
    const save = vi.fn();
    wrap(<EventForm event={e} loading={false} onSave={save} />);
    const user = userEvent.setup();
    for (const status of [
      "draft",
      "open",
      "confirmed",
      "closed",
      "cancelled",
    ]) {
      await user.selectOptions(screen.getByLabelText("Stav akce"), status);
      await user.click(screen.getByRole("button", { name: "Uložit akci" }));
      expect(save).toHaveBeenLastCalledWith(
        expect.objectContaining({ status }),
      );
    }
  });
  it("preserves deadline seconds on an ordinary edit and uses a changed deadline", async () => {
    const e = fixture({ responseDeadline: "2026-10-01T14:34:51.123Z" });
    setup(e);
    const save = vi.fn();
    wrap(<EventForm event={e} loading={false} onSave={save} />);
    await userEvent.click(screen.getByRole("button", { name: "Uložit akci" }));
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ responseDeadline: e.responseDeadline }),
    );
    fireEvent.change(screen.getByLabelText("Termín pro vyjádření"), {
      target: { value: "2026-10-01T18:00" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Uložit akci" }));
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ responseDeadline: "2026-10-01T16:00:00.000Z" }),
    );
  });
  it("renames an existing saved set by ID even after attendance changes", async () => {
    const e = fixture({
      pairs: [
        {
          id: "pair",
          leaderId: "a",
          followerId: "b",
          round: 1,
          ageGroup: "old",
        },
      ],
      attendance: [],
    });
    const db = setup(e);
    api.savePairs.mockResolvedValue(e);
    wrap(
      <EventPairingEditor
        db={db}
        event={e}
        admin
        setId="saved-set"
        initialName="Původní"
      />,
    );
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("Název sady"));
    await user.type(screen.getByLabelText("Název sady"), "Nový název");
    await user.click(screen.getByRole("button", { name: "Uložit" }));
    expect(api.savePairs).toHaveBeenCalledExactlyOnceWith(
      "e",
      e.pairs,
      true,
      [],
      "Nový název",
      "saved-set",
    );
  });
  it.each(["musician", "photographer"] as const)("lets a %s report attendance without partner wishes", async (role) => {
    const db = setup(fixture({ attendanceScope: "self" }));
    db.members = [{ ...members[0], role }, members[1]];
    db.accessMode = "member";
    db.myMemberId = "a";
    wrap(
      <EventDetailPage
        eventId="e"
        canAdmin={false}
        canEdit={false}
        canPair={false}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "Přijdu" }));
    await user.click(screen.getByRole("button", { name: "Uložit odpověď" }));
    expect(api.updateMyResponse).toHaveBeenCalledWith("e", "yes", "");
    expect(screen.queryByText("Vybrat přání partnerů")).not.toBeInTheDocument();
  });
  it("shows each series separately and saves keyboard ordering without unconfirming it", async () => {
    const e = fixture({
      songSeries: [
        { id: "s1", name: "První série", songIds: ["1", "2"], confirmed: true },
        { id: "s2", name: "Druhá série", songIds: [], confirmed: false },
      ],
    });
    const db = setup(e);
    wrap(<SongSeriesPanel db={db} event={e} admin />);
    expect(screen.getByRole("heading", { name: "První série" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Druhá série" })).toBeVisible();
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Upravit sérii První série" }),
    );
    expect(
      within(screen.getByRole("dialog")).queryByRole("checkbox", {
        name: "Píseň jedna",
      }),
    ).not.toBeInTheDocument();
    const handle = screen.getByRole("button", {
      name: "Přetáhnout Píseň jedna",
    });
    handle.focus();
    await user.keyboard("{ArrowDown}");
    expect(
      screen.queryByRole("button", { name: "Posunout píseň nahoru" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Uložit sérii" }));
    expect(api.saveSongSeries).toHaveBeenCalledExactlyOnceWith("e", {
      id: "s1",
      name: "První série",
      songIds: ["2", "1"],
      confirmed: true,
    });
  });
  it("shows an explicit empty generation result and the corrective action", async () => {
    setup(fixture({ status: "closed" }));
    api.generatePairs.mockResolvedValue({
      pairs: [],
      standingIds: [],
      warnings: [
        "Není zapsaná skutečná přítomnost. V Účastnících nastavte přítomen nebo částečnou účast.",
      ],
    });
    wrap(
      <EventPairingEditor
        db={data.current!}
        event={data.current!.events[0]}
        admin
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Vygenerovat návrh" }),
    );
    expect(await screen.findByText(/Návrh vytvořen: 0 hlavních/)).toBeVisible();
    expect(screen.getByText(/Není zapsaná skutečná přítomnost/)).toBeVisible();
  });
  it("reports worker errors instead of silently doing nothing", async () => {
    setup();
    api.generatePairs.mockRejectedValue(
      new Error("Generátor se nepodařilo spustit."),
    );
    wrap(
      <EventPairingEditor
        db={data.current!}
        event={data.current!.events[0]}
        admin
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Vygenerovat návrh" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Generátor se nepodařilo spustit.",
    );
  });
  it("preserves manual changes when another member is explicitly assigned to stand", async () => {
    const e = fixture({
      attendance: members.map((m) => ({
        memberId: m.id,
        status: "present",
        interest: "yes",
        selected: true,
      })),
    });
    const db = setup(e);
    db.members = [
      ...members,
      { ...members[0], id: "c", fullName: "Další muž" },
    ];
    e.attendance.push({
      memberId: "c",
      status: "present",
      interest: "yes",
      selected: true,
    });
    api.generatePairs.mockResolvedValue({
      pairs: [
        {
          id: "pair",
          leaderId: "a",
          followerId: "b",
          round: 1,
          ageGroup: "old",
          belowLine: false,
        },
      ],
      standingIds: ["c"],
      warnings: [],
    });
    wrap(
      <EventPairingEditor
        db={data.current!}
        event={data.current!.events[0]}
        admin
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Vygenerovat návrh" }));
    await user.click(
      await screen.findByRole("button", { name: "Detail páru: Adam + Žofie" }),
    );
    await user.click(screen.getByRole("checkbox", { name: "Pod čarou" }));
    await user.click(screen.getByRole("button", { name: "Hotovo" }));
    await user.click(screen.getByRole("checkbox", { name: "Další muž" }));
    expect(
      await screen.findByText(/Ostatní ruční úpravy zůstaly/),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Detail páru: Adam + Žofie" }),
    );
    expect(screen.getByRole("checkbox", { name: "Pod čarou" })).toBeChecked();
    expect(screen.getByLabelText("Muž v páru 1")).toHaveValue("a");
  });
  it("provides expandable native help", async () => {
    const user = userEvent.setup();
    render(
      <Help>
        <p>Pravidlo bodování</p>
      </Help>,
    );
    expect(screen.getByText("Jak to funguje").tagName).toBe("SUMMARY");
    await user.click(screen.getByText("Jak to funguje"));
    expect(
      screen.getByText("Jak to funguje").closest("details"),
    ).toHaveAttribute("open");
  });
  it("requires a note for maybe and sends it with the response", async () => {
    const user = userEvent.setup();
    const save = vi.fn();
    const e = fixture();
    render(
      <ResponseEditor
        event={e}
        record={e.attendance[0]}
        onSave={save}
        pending={false}
      />,
    );
    await user.click(screen.getByRole("radio", { name: "Zatím nevím" }));
    expect(screen.getByLabelText("Poznámka k odpovědi")).toBeRequired();
    await user.click(screen.getByRole("button", { name: "Uložit odpověď" }));
    expect(save).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Uložit odpověď" }),
    ).toBeDisabled();
    await user.type(screen.getByLabelText("Poznámka k odpovědi"), "Čekám");
    await user.click(screen.getByRole("button", { name: "Uložit odpověď" }));
    expect(save).toHaveBeenCalledWith("maybe", "Čekám");
  });
  it("locks member response after confirmation and offers reasoned maybe for rehearsal", () => {
    const e = fixture({
      type: "rehearsal",
      status: "closed",
      canRespond: false,
    });
    render(
      <ResponseEditor
        event={e}
        record={e.attendance[0]}
        onSave={vi.fn()}
        pending={false}
      />,
    );
    expect(screen.getByRole("radio", { name: "Přijdu" })).toBeDisabled();
    expect(
      screen.queryByRole("radio", { name: "Zatím nevím" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Poznámka k odpovědi"),
    ).not.toBeInTheDocument();
  });
  it("shows only selected members, finds others and adds to the shared event selection", async () => {
    const user = userEvent.setup();
    const e = fixture({ type: "rehearsal" });
    e.attendance[0].selected = true;
    const db = setup(e);
    wrap(<AttendancePanel db={db} event={e} admin />);
    expect(screen.getByText("Adam")).toBeInTheDocument();
    expect(screen.queryByText("Žofie")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Přidat člena" }));
    const dialog = screen.getByRole("dialog");
    await user.type(
      within(dialog).getByLabelText("Hledat člena k přidání"),
      "zofie",
    );
    await user.click(
      within(dialog).getByRole("checkbox", { name: "Vybrat Žofie" }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Přidat vybrané (1)" }),
    );
    expect(api.addAttendanceBatch).toHaveBeenCalledWith("e", ["b"], {
      interest: "unset",
      status: "present",
      note: "",
    });
    expect(api.updateAttendance).not.toHaveBeenCalled();
  });
  it("excludes songs already used on the event and confirms one series", async () => {
    const user = userEvent.setup();
    const e = fixture({
      songSeries: [
        { id: "s1", name: "Jedna", songIds: ["1"], confirmed: false },
        { id: "s2", name: "Dvě", songIds: [], confirmed: false },
      ],
    });
    const db = setup(e);
    wrap(<SongSeriesPanel db={db} event={e} admin />);
    await user.click(screen.getByRole("button", { name: "Upravit sérii Dvě" }));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).queryByRole("checkbox", { name: "Píseň jedna" }),
    ).not.toBeInTheDocument();
    await user.click(
      within(dialog).getByRole("checkbox", { name: "Píseň dvě" }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Potvrdit sérii" }),
    );
    expect(api.saveSongSeries).toHaveBeenCalledWith("e", {
      id: "s2",
      name: "Dvě",
      songIds: ["2"],
      confirmed: true,
    });
  });
  it("creates a Friday rehearsal from 19–21 with no pair count or deadline fields", () => {
    setup();
    wrap(<EventForm loading={false} onSave={vi.fn()} />);
    expect(screen.getByLabelText("Místo akce")).toHaveValue("Stará škola");
    expect(screen.getByLabelText("Začátek akce")).toHaveValue("19:00");
    expect(screen.getByLabelText("Konec akce")).toHaveValue("21:00");
    expect(
      new Date(
        (screen.getByLabelText("Datum akce") as HTMLInputElement).value +
          "T12:00:00",
      ).getDay(),
    ).toBe(5);
    expect(
      screen.queryByLabelText("Termín pro vyjádření"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Odhad párů Starý")).not.toBeInTheDocument();
  });
  it("hides pairing fields for carols but keeps mandatory performance deadline", () => {
    const e = fixture({ seasonId: "c", seasonKind: "carols" });
    const db = setup(e);
    db.seasons?.push({
      id: "c",
      name: "Koledy",
      kind: "carols",
      dateFrom: "2026-09-01",
      dateTo: "2026-12-31",
      active: true,
    });
    wrap(<EventForm event={e} loading={false} onSave={vi.fn()} />);
    expect(screen.getByLabelText("Termín pro vyjádření")).toBeRequired();
    expect(screen.queryByLabelText("Odhad párů Starý")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Sezóna akce"), {
      target: { value: "s" },
    });
    expect(screen.getByLabelText("Odhad párů Starý")).toBeInTheDocument();
  });
});

describe("admin bulk attendance and direct response editing", () => {
  it("adds multiple members in one request with shared response, note and percentage", async () => {
    const user = userEvent.setup(),
      event = fixture(),
      db = setup(event);
    wrap(<AttendancePanel db={db} event={event} admin />);
    await user.click(screen.getByRole("button", { name: "Přidat člena" }));
    await user.selectOptions(
      screen.getByLabelText("Výchozí nahlášená účast"),
      "maybe",
    );
    await user.selectOptions(
      screen.getByLabelText("Výchozí skutečná účast"),
      "partial",
    );
    await user.clear(screen.getByLabelText("Výchozí procento účasti"));
    await user.type(screen.getByLabelText("Výchozí procento účasti"), "75");
    await user.click(screen.getByRole("checkbox", { name: "Vybrat Adam" }));
    await user.click(screen.getByRole("checkbox", { name: "Vybrat Žofie" }));
    expect(
      screen.getByRole("button", { name: "Přidat vybrané (2)" }),
    ).toBeDisabled();
    await user.type(
      screen.getByLabelText("Společná poznámka k odpovědi"),
      "Pracovní směna",
    );
    await user.click(
      screen.getByRole("button", { name: "Přidat vybrané (2)" }),
    );
    expect(api.addAttendanceBatch).toHaveBeenCalledExactlyOnceWith(
      "e",
      ["a", "b"],
      {
        interest: "maybe",
        status: "partial",
        attendancePercent: 75,
        note: "Pracovní směna",
      },
    );
    expect(api.updateAttendance).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("keeps the selection and defaults available for retry when a bulk request fails", async () => {
    const user = userEvent.setup(),
      event = fixture(),
      db = setup(event);
    api.addAttendanceBatch.mockRejectedValueOnce(new Error("Zápis selhal"));
    wrap(<AttendancePanel db={db} event={event} admin />);
    await user.click(screen.getByRole("button", { name: "Přidat člena" }));
    await user.selectOptions(
      screen.getByLabelText("Výchozí nahlášená účast"),
      "yes",
    );
    await user.selectOptions(
      screen.getByLabelText("Výchozí skutečná účast"),
      "unknown",
    );
    await user.click(screen.getByRole("checkbox", { name: "Vybrat Adam" }));
    await user.click(
      screen.getByRole("button", { name: "Přidat vybrané (1)" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Zápis selhal");
    expect(screen.getByRole("checkbox", { name: "Vybrat Adam" })).toBeChecked();
    expect(screen.getByLabelText("Výchozí nahlášená účast")).toHaveValue("yes");
    await user.click(
      screen.getByRole("button", { name: "Přidat vybrané (1)" }),
    );
    expect(api.addAttendanceBatch).toHaveBeenLastCalledWith("e", ["a"], {
      interest: "yes",
      status: "unknown",
      note: "",
    });
  });
  it("saves an admin vote immediately and requires a note before saving maybe", async () => {
    const user = userEvent.setup(),
      save = vi.fn(),
      event = fixture();
    render(
      <ResponseEditor
        event={event}
        record={event.attendance[0]}
        admin
        pending={false}
        onSave={save}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Uložit odpověď" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Přijdu" }));
    expect(save).toHaveBeenCalledExactlyOnceWith("yes", "");
    save.mockClear();
    await user.click(screen.getByRole("radio", { name: "Zatím nevím" }));
    expect(save).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Uložit poznámku" }),
    ).toBeDisabled();
    await user.type(screen.getByLabelText("Poznámka k odpovědi"), "Čekám");
    await user.click(screen.getByRole("button", { name: "Uložit poznámku" }));
    expect(save).toHaveBeenCalledExactlyOnceWith("maybe", "Čekám");
  });
  it("saves percentage only with its own button", async () => {
    const user = userEvent.setup(),
      event = fixture();
    event.attendance[0] = {
      ...event.attendance[0],
      selected: true,
      status: "partial",
      attendancePercent: 50,
    };
    const db = setup(event);
    wrap(<AttendancePanel db={db} event={event} admin />);
    await user.click(screen.getByRole("button", { name: "Detail: Adam" }));
    await user.clear(screen.getByLabelText("Procento účasti Adam"));
    await user.type(screen.getByLabelText("Procento účasti Adam"), "65");
    await user.tab();
    expect(api.updateAttendance).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Uložit procenta" }));
    expect(api.updateAttendance).toHaveBeenCalledExactlyOnceWith("e", "a", {
      status: "partial",
      attendancePercent: 65,
    });
  });
});

describe("compact pair management", () => {
  function setupPairs() {
    const event = fixture({
      pairs: [
        {
          id: "one",
          leaderId: "a",
          followerId: "b",
          round: 1,
          ageGroup: "old",
        },
        {
          id: "two",
          leaderId: "c",
          followerId: "d",
          round: 1,
          ageGroup: "old",
        },
      ],
    });
    const db = setup(event);
    db.members = [
      ...members,
      { ...members[0], id: "c", fullName: "Cyril" },
      { ...members[1], id: "d", fullName: "Dana" },
      { ...members[1], id: "f", fullName: "Františka" },
      {
        ...members[1],
        id: "g",
        fullName: "Gabriela",
        ageGroup: "young",
        ageGroups: ["young"],
      },
      { ...members[1], id: "h", fullName: "Hana" },
      { ...members[1], id: "i", fullName: "Irena" },
    ];
    event.attendance = db.members.map((member) => ({
      memberId: member.id,
      selected: true,
      interest: "yes",
      status: "present",
      standing: member.id === "i",
    }));
    db.preferences = [
      {
        id: "ban",
        memberAId: "a",
        memberBId: "h",
        kind: "forbidden",
      },
    ];
    return db;
  }
  it("opens edits from a table, offers free partners first, and releases an occupied partner's pair", async () => {
    const user = userEvent.setup();
    setupPairs();
    wrap(
      <EventPairingEditor
        db={data.current!}
        event={data.current!.events[0]}
        admin
      />,
    );
    expect(
      screen.getByRole("table", { name: "Sestava párů" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Žena v páru 1")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Detail páru: Adam + Žofie" }),
    );
    const select = screen.getByLabelText("Žena v páru 1");
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual([
      "Františka · bez páru",
      "Žofie · současný pár",
      "Dana · v páru s Cyril",
    ]);
    await user.selectOptions(select, "d");
    await user.click(screen.getByRole("button", { name: "Hotovo" }));
    expect(
      screen.queryByRole("button", { name: "Detail páru: Cyril + Dana" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Vytvořit pár pro Cyril" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Vytvořit pár pro Žofie" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Uložit" }));
    expect(api.savePairs).toHaveBeenCalledWith(
      "e",
      [expect.objectContaining({ leaderId: "a", followerId: "d" })],
      true,
      [],
      expect.stringMatching(/\d{1,2}\. \d{1,2}\. \d{4} \d{2}:\d{2}/),
      undefined,
    );
  });
  it("creates a pair from an unpaired woman and allows removing it from the detail", async () => {
    const user = userEvent.setup();
    const db = setupPairs();
    db.events[0].pairs = [db.events[0].pairs[0]];
    wrap(
      <EventPairingEditor
        db={data.current!}
        event={data.current!.events[0]}
        admin
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Vytvořit pár pro Dana" }),
    );
    const select = screen.getByLabelText("Partner pro Dana");
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual([
      "Vyberte partnera",
      "Cyril · bez páru",
      "Adam · v páru s Žofie",
    ]);
    await user.selectOptions(select, "c");
    await user.click(screen.getByRole("button", { name: "Vytvořit pár" }));
    expect(screen.getByRole("checkbox", { name: "Pod čarou" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Zrušit pár" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Vytvořit pár pro Dana" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Vytvořit pár pro Irena" }),
    ).toBeDisabled();
  });
  it("lets an admin save removal of the last pair with the remaining members without a pair", async () => {
    const user = userEvent.setup();
    const db = setupPairs();
    db.events[0].pairs = [db.events[0].pairs[0]];
    wrap(
      <EventPairingEditor
        db={data.current!}
        event={data.current!.events[0]}
        admin
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Detail páru: Adam + Žofie" }),
    );
    await user.click(screen.getByRole("button", { name: "Zrušit pár" }));
    await user.click(screen.getByRole("button", { name: "Uložit" }));
    expect(api.savePairs).toHaveBeenCalledWith(
      "e",
      [],
      true,
      [],
      expect.stringMatching(/\d{1,2}\. \d{1,2}\. \d{4} \d{2}:\d{2}/),
      undefined,
    );
  });
});

function DialogTyping() {
  const [text, setText] = useState("");
  return (
    <Dialog open title="Formulář" onClose={() => setText("")}>
      <input
        aria-label="Text"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </Dialog>
  );
}
describe("mobile action regressions", () => {
  it("keeps focus and all typed characters through dialog rerenders", async () => {
    const user = userEvent.setup();
    render(<DialogTyping />);
    const input = screen.getByLabelText("Text");
    await user.type(input, "Celý název akce");
    expect(input).toHaveFocus();
    expect(input).toHaveValue("Celý název akce");
  });
  it("requires a nonblank maybe note on rehearsals", async () => {
    const user = userEvent.setup(),
      save = vi.fn(),
      event = fixture({ type: "rehearsal" });
    render(
      <ResponseEditor
        event={event}
        record={event.attendance[0]}
        pending={false}
        onSave={save}
      />,
    );
    await user.click(screen.getByRole("radio", { name: "Zatím nevím" }));
    const note = screen.getByLabelText("Poznámka k odpovědi");
    expect(note).toBeRequired();
    await user.type(note, "   ");
    await user.click(screen.getByRole("button", { name: "Uložit odpověď" }));
    expect(save).not.toHaveBeenCalled();
    await user.clear(note);
    await user.type(note, "Pracovní směna");
    await user.click(screen.getByRole("button", { name: "Uložit odpověď" }));
    expect(save).toHaveBeenCalledWith("maybe", "Pracovní směna");
    expect(
      screen.queryByRole("radio", { name: "Náhradník" }),
    ).not.toBeInTheDocument();
  });
  it("lists both active season kinds and includes older ones only when selected", async () => {
    const user = userEvent.setup(),
      db = setup();
    db.seasons!.push(
      { ...db.seasons![0], id: "c", name: "Koledy", kind: "carols" },
      { ...db.seasons![0], id: "o", name: "Starší", active: false },
    );
    db.events = [
      fixture({ title: "Taneční akce" }),
      fixture({ id: "c", seasonId: "c", title: "Koledová akce" }),
      fixture({ id: "o", seasonId: "o", title: "Starší akce" }),
    ];
    wrap(<EventsPage canEdit={false} />);
    expect(screen.getByText("Taneční akce")).toBeInTheDocument();
    expect(screen.getByText("Koledová akce")).toBeInTheDocument();
    expect(screen.queryByText("Starší akce")).not.toBeInTheDocument();
    await user.click(screen.getByText(/Sezóny: aktuální/));
    await user.click(screen.getByRole("checkbox", { name: "Starší" }));
    expect(screen.getByText("Starší akce")).toBeInTheDocument();
  });
  it("keeps personal attendance above relevant tabs and hides empty tabs", () => {
    const db = setup(fixture({ attendanceScope: "self", singing: false }));
    db.myMemberId = "a";
    wrap(
      <EventDetailPage
        eventId="e"
        canAdmin={false}
        canEdit={false}
        canPair={false}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Moje účast" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Zpět na seznam/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });
  it("shows latest rehearsal set and switches to an older published set", async () => {
    const user = userEvent.setup(),
      db = setup(
        fixture({
          type: "rehearsal",
          attendanceScope: "all",
          pairSets: [
            {
              id: "old",
              name: "Starší sada",
              published: true,
              createdAt: "2026-09-28T18:00:00Z",
              pairs: [
                {
                  id: "oldpair",
                  leaderId: "a",
                  followerId: "b",
                  ageGroup: "old",
                  round: 1,
                },
              ],
            },
            {
              id: "new",
              name: "Novější sada",
              published: true,
              createdAt: "2026-09-28T19:00:00Z",
              pairs: [
                {
                  id: "newpair",
                  leaderId: "a",
                  followerId: "b",
                  ageGroup: "young",
                  round: 1,
                },
              ],
            },
          ],
        }),
      );
    db.myMemberId = "a";
    wrap(
      <EventDetailPage
        eventId="e"
        canAdmin={false}
        canEdit={false}
        canPair={false}
      />,
    );
    await user.click(screen.getByRole("tab", { name: "Páry" }));
    expect(screen.getByLabelText("Uložená sada párů")).toHaveValue("new");
    expect(
      screen.getByRole("table", { name: "Sestava párů" }),
    ).toHaveTextContent("AdamŽofieMladý");
    await user.selectOptions(screen.getByLabelText("Uložená sada párů"), "old");
    expect(
      screen.getByRole("table", { name: "Sestava párů" }),
    ).toHaveTextContent("AdamŽofieStarý");
  });
  it("puts upcoming actions before score cards and uses the same response rules", async () => {
    const user = userEvent.setup(),
      db = setup(fixture({ date: "2099-01-01", type: "rehearsal" }));
    db.accessMode = "member";
    db.myMemberId = "a";
    wrap(<DashboardPage canEdit={false} />);
    const upcoming = screen.getByRole("heading", { name: "Nadcházející akce" });
    const points = screen.getByText("Moje body");
    expect(
      upcoming.compareDocumentPosition(points) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: "Zatím nevím" }));
    expect(screen.getByLabelText("Poznámka k odpovědi")).toBeRequired();
    expect(screen.queryByText("Náhradník")).not.toBeInTheDocument();
  });
});

describe("personal attendance and quick actual attendance", () => {
  it("shows the saved member vote and lets them change it even without a member-list entry", async () => {
    const user = userEvent.setup(),
      event = fixture({ canClose: false, date: "2099-01-01" });
    event.attendance[0].interest = "yes";
    const db = setup(event);
    db.myMemberId = "a";
    db.members = [];
    wrap(
      <EventDetailPage
        eventId="e"
        canAdmin={false}
        canEdit={false}
        canPair={false}
      />,
    );
    expect(screen.getByRole("radio", { name: "Přijdu" })).toBeChecked();
    expect(screen.queryByText(/Skutečná účast:/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Nepřijdu" }));
    await user.click(screen.getByRole("button", { name: "Uložit odpověď" }));
    expect(api.updateMyResponse).toHaveBeenCalledWith("e", "no", "");
  });
  it("shows an initial voting form when own attendance record is not present", () => {
    const db = setup(fixture({ attendance: [], canClose: false }));
    db.myMemberId = "a";
    wrap(
      <EventDetailPage
        eventId="e"
        canAdmin={false}
        canEdit={false}
        canPair={false}
      />,
    );
    expect(screen.getByRole("radio", { name: "Přijdu" })).toBeEnabled();
  });
  it("offers personal sign-in for shared access and does not invent a vote", async () => {
    const user = userEvent.setup(),
      login = vi.fn(),
      db = setup();
    db.accessMode = "shared";
    wrap(
      <EventDetailPage
        eventId="e"
        canAdmin={false}
        canEdit={false}
        canPair={false}
        onPersonalLogin={login}
      />,
    );
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Přihlásit se osobně" }),
    );
    expect(login).toHaveBeenCalledOnce();
  });
  it("keeps own response graphical in the list when the full roster is visible", () => {
    const event = fixture({
      canClose: false,
      status: "confirmed",
      attendanceScope: "all",
    });
    event.attendance[0].interest = "yes";
    const db = setup(event);
    db.myMemberId = "a";
    wrap(<EventsPage canEdit={false} />);
    expect(screen.getByText("Přijdu").closest(".response-badge")).toHaveClass(
      "response-badge--yes",
    );
    expect(screen.queryByText("Nezapsáno")).not.toBeInTheDocument();
    expect(
      screen.getByText(/Sezóny: aktuální/).closest(".toolbar-card"),
    ).toBeInTheDocument();
  });
  it("uses a small points tag with tap/keyboard help", async () => {
    const user = userEvent.setup();
    setup();
    wrap(
      <EventDetailPage
        eventId="e"
        canAdmin={false}
        canEdit={false}
        canPair={false}
      />,
    );
    expect(screen.getByText("2 body")).toHaveClass("badge");
    expect(
      screen.queryByRole("heading", { name: "Body za účast" }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Jak se počítají body" }),
    );
    expect(screen.getByRole("tooltip")).toHaveTextContent("50 %");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
  it("opens actual attendance first after start and updates it directly with radio switches", async () => {
    const user = userEvent.setup(),
      event = fixture({ canClose: true, status: "closed" });
    event.attendance[0].selected = true;
    const db = setup(event);
    wrap(<AttendancePanel db={db} event={event} admin />);
    expect(
      screen.queryByRole("button", { name: /Nastavit účast/ }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Detail: Adam" }));
    expect(
      screen.getByRole("dialog").querySelector(".participant-detail"),
    ).toHaveClass("participant-detail--actual");
    await user.click(screen.getByRole("radio", { name: "Přítomen" }));
    expect(api.updateAttendance).toHaveBeenCalledWith("e", "a", {
      status: "present",
      selected: true,
      attendancePercent: undefined,
    });
  });
});

describe("event list and saved roster flows", () => {
  it("bulk-adds catalog programs and a custom name in one save and keeps choices on failure", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValue(undefined);
    wrap(
      <EventProgramEditor
        items={[]}
        catalog={[
          { id: "p1", name: "První", active: true, sortOrder: 1 },
          { id: "p2", name: "Druhé", active: true, sortOrder: 2 },
        ]}
        eventBlocks={[]}
        pairsPublished={false}
        loading={false}
        onSave={save}
      />,
    );
    expect(
      screen.queryByLabelText("Přidat vlastní pásmo"),
    ).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Přidat pásma" }));
    await user.click(screen.getByRole("checkbox", { name: "První" }));
    await user.click(screen.getByRole("checkbox", { name: "Druhé" }));
    await user.type(screen.getByLabelText("Přidat vlastní pásmo"), "Závěr");
    await user.click(
      screen.getByRole("button", { name: "Přidat vybraná (3)" }),
    );
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "První" })).toBeChecked();
    await user.click(
      screen.getByRole("button", { name: "Přidat vybraná (3)" }),
    );
    expect(save).toHaveBeenLastCalledWith([
      { id: undefined, catalogId: "p1" },
      { id: undefined, catalogId: "p2" },
      { id: undefined, customName: "Závěr" },
    ]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("adds multiple songs with one request", async () => {
    const db = setup();
    wrap(<SongSeriesPanel db={db} event={db.events[0]} admin />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Přidat sérii" }));
    await user.click(screen.getByRole("checkbox", { name: "Píseň jedna" }));
    await user.click(screen.getByRole("checkbox", { name: "Píseň dvě" }));
    await user.click(
      screen.getByRole("button", { name: "Přidat vybrané (2)" }),
    );
    expect(api.saveSongSeries).toHaveBeenCalledExactlyOnceWith("e", {
      name: "Písně",
      songIds: ["1", "2"],
      confirmed: false,
    });
  });
  it("shows saved below-line pairs and standing members even after attendance changes", async () => {
    const db = setup(
      fixture({
        type: "rehearsal",
        attendance: [],
        pairSets: [
          {
            id: "set",
            name: "Večerní",
            createdAt: "2026-10-01T18:00:00Z",
            published: true,
            pairs: [
              {
                id: "p",
                leaderId: "a",
                followerId: "b",
                round: 1,
                ageGroup: "old",
                belowLine: true,
              },
            ],
            roster: [
              {
                memberId: "a",
                standing: false,
                fullName: "Adam",
                role: "leader",
                ageGroups: ["old"],
              },
              {
                memberId: "b",
                standing: false,
                fullName: "Žofie",
                role: "follower",
                ageGroups: ["old"],
              },
              {
                memberId: "gone",
                standing: true,
                fullName: "Stojící člen",
                role: "leader",
                ageGroups: ["young"],
              },
            ],
          },
        ],
      }),
    );
    db.accessMode = "member";
    wrap(
      <EventDetailPage
        eventId="e"
        canAdmin={false}
        canEdit={false}
        canPair={false}
      />,
    );
    await userEvent.click(screen.getByRole("tab", { name: "Páry" }));
    expect(
      screen.queryByRole("heading", { name: "Uložené sady párů" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("1. 10. 2026")).toBeVisible();
    expect(screen.getByRole("table")).toHaveTextContent("AdamŽofieStarý");
    expect(screen.getByText("Stojící člen")).toBeVisible();
    expect(screen.getByText(/má stát/)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Přidat sadu párů" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Detail páru/ }),
    ).not.toBeInTheDocument();
  });
  it("separates the programs and songs tabs", async () => {
    setup(
      fixture({
        programItems: [{ id: "p", name: "Pásmo", custom: true, sortOrder: 1 }],
        songSeries: [
          { id: "s", name: "Série", songIds: ["1"], confirmed: true },
        ],
      }),
    );
    wrap(
      <EventDetailPage
        eventId="e"
        canAdmin={false}
        canEdit={false}
        canPair={false}
      />,
    );
    expect(
      screen.queryByRole("tab", { name: "Pásma a písně" }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Pásma" }));
    expect(screen.getByText("Pásmo")).toBeVisible();
    expect(screen.queryByText("Píseň jedna")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Písně" }));
    expect(screen.getByText("Píseň jedna")).toBeVisible();
    expect(screen.queryByText("Pásmo")).not.toBeInTheDocument();
  });
});
