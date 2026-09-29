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
import { EventForm } from "./EventForm";
import type { AppDatabase, EnsembleEvent, Member } from "../lib/domain";
const api = vi.hoisted(() => ({
  updateAttendance: vi.fn(),
  saveSongSeries: vi.fn(),
  deleteSongSeries: vi.fn(),
  setPartnerWishes: vi.fn(),
  getEventAudit: vi.fn().mockResolvedValue([]),
}));
vi.mock("../lib/dataApi", () => ({ appApi: api }));
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
  api.saveSongSeries.mockResolvedValue(undefined);
});
afterEach(cleanup);
describe("feature UI flows", () => {
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
    await user.selectOptions(screen.getByLabelText("Odpověď"), "maybe");
    expect(screen.getByLabelText("Poznámka k odpovědi")).toBeRequired();
    await user.click(screen.getByRole("button", { name: "Uložit odpověď" }));
    expect(save).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Poznámka k odpovědi"), "Čekám");
    await user.click(screen.getByRole("button", { name: "Uložit odpověď" }));
    expect(save).toHaveBeenCalledWith("maybe", "Čekám");
  });
  it("locks member response after confirmation and offers only yes/no for rehearsal", () => {
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
    expect(screen.getByLabelText("Odpověď")).toBeDisabled();
    expect(
      screen.queryByRole("option", { name: "Zatím nevím" }),
    ).not.toBeInTheDocument();
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
    await user.click(within(dialog).getByRole("button", { name: "Přidat" }));
    expect(api.updateAttendance).toHaveBeenCalledWith("e", "b", {
      selected: true,
      status: "present",
    });
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
    expect(
      screen.queryByRole("button", { name: "+ Píseň jedna" }),
    ).not.toBeInTheDocument();
    const series = screen
      .getByRole("heading", { name: "Dvě · Návrh" })
      .closest("section")!;
    await user.click(
      within(series).getByRole("button", { name: "+ Píseň dvě" }),
    );
    await user.click(
      within(series).getByRole("button", { name: "Potvrdit sérii" }),
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
