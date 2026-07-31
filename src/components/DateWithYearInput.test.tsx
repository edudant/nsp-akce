import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { DateWithYearInput } from "./DateWithYearInput";

function DateHarness({ initialValue }: { initialValue: string }) {
  const [value, setValue] = useState(initialValue);

  return (
    <>
      <DateWithYearInput id="joined-at" onChange={setValue} value={value} />
      <output>{value}</output>
    </>
  );
}

describe("DateWithYearInput", () => {
  afterEach(cleanup);

  it("lets a member year be entered directly", () => {
    render(<DateHarness initialValue="2026-07-31" />);

    const yearInput = screen.getByLabelText("Rok") as HTMLInputElement;
    const select = vi.spyOn(yearInput, "select");
    fireEvent.focus(yearInput);
    expect(select).toHaveBeenCalledOnce();

    fireEvent.change(yearInput, {
      target: { value: "2004" },
    });

    expect(screen.getByText("2004-07-31")).toBeInTheDocument();
  });

  it("keeps the year field in sync with a date selected in the calendar", () => {
    render(<DateHarness initialValue="2026-07-31" />);

    fireEvent.change(document.querySelector('input[type="date"]')!, {
      target: { value: "1999-03-15" },
    });

    expect(screen.getByLabelText("Rok")).toHaveValue(1999);
    expect(screen.getByText("1999-03-15")).toBeInTheDocument();
  });

  it("adjusts leap day when the entered year is not a leap year", () => {
    render(<DateHarness initialValue="2024-02-29" />);

    fireEvent.change(screen.getByLabelText("Rok"), {
      target: { value: "2003" },
    });

    expect(screen.getByText("2003-02-28")).toBeInTheDocument();
  });
});
