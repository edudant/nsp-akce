import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CarolRecordings } from "./CarolRecordings";

const mocks = vi.hoisted(() => ({ list: vi.fn(), url: vi.fn() }));
vi.mock("./DataContext", () => ({ useViewMode: () => ({ scope: "member", memberPreview: false }) }));
vi.mock("../lib/carolRecordings", () => ({ getCarolRecordings: mocks.list, getRecordingUrl: mocks.url }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function show(songId?: string) {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CarolRecordings songId={songId} /></QueryClientProvider>);
}
describe("Carol recordings", () => {
  it("shows only the matching recording and obtains a signed link when requested", async () => {
    mocks.list.mockResolvedValue([{trackNo:1,title:"První",path:"01.mp3",songId:"a"},{trackNo:2,title:"Druhá",path:"02.mp3",songId:"b"}]);
    mocks.url.mockResolvedValue("https://example.test/01.mp3");
    vi.spyOn(HTMLMediaElement.prototype,"play").mockResolvedValue();
    show("a");
    fireEvent.click(await screen.findByRole("button", { name: "Přehrát" }));
    expect(await screen.findByLabelText("Nahrávka: První")).toHaveAttribute("src", "https://example.test/01.mp3");
    expect(screen.queryByText("Druhá")).not.toBeInTheDocument();
    expect(mocks.url).toHaveBeenCalledWith("01.mp3");
    vi.restoreAllMocks();
  });
  it("shows an actionable error when obtaining a recording fails", async () => {
    mocks.list.mockResolvedValue([{trackNo:1,title:"První",path:"01.mp3",songId:null}]);
    mocks.url.mockRejectedValue(new Error("offline"));
    show();
    fireEvent.click(await screen.findByRole("button", {name:"Přehrát"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("nepodařilo přehrát");
    expect(screen.getByRole("button",{name:"Zkusit znovu"})).toBeVisible();
  });
});
