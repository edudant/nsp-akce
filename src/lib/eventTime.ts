export function pragueLocalToIso(date: string, time: string): string {
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
    direction * (Number(match?.[2] ?? 0) * 60 + Number(match?.[3] ?? 0));
  return new Date(
    approximation.getTime() - offsetMinutes * 60_000,
  ).toISOString();
}

