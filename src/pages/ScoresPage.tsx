import {
  ArrowDown,
  ArrowUp,
  Download,
  Info,
  Medal,
  Search,
  TrendingUp,
  UserCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import { calculateScores, roleLabels, type PairingRole } from "../lib/domain";
import { useDatabase } from "../components/DataContext";
import { ErrorState, LoadingState } from "../components/DataStates";
import { formatPoints } from "../components/formatters";
import { PageHeader } from "../components/PageHeader";
import {
  Avatar,
  Badge,
  Button,
  Card,
  ExperienceBadge,
  Select,
} from "../components/Ui";

type SortKey = "total" | "name" | "rate";

export function ScoresPage() {
  const database = useDatabase();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<"all" | PairingRole>("all");
  const [sort, setSort] = useState<SortKey>("total");

  const scores = useMemo(() => {
    if (!database.data) return [];
    const term = search.trim().toLocaleLowerCase("cs");
    return calculateScores(database.data)
      .filter((row) => role === "all" || row.member.role === role)
      .filter((row) =>
        row.member.fullName.toLocaleLowerCase("cs").includes(term),
      )
      .sort((first, second) => {
        if (sort === "name") {
          return first.member.fullName.localeCompare(second.member.fullName, "cs");
        }
        if (sort === "rate") return second.attendanceRate - first.attendanceRate;
        return second.total - first.total;
      });
  }, [database.data, role, search, sort]);

  if (database.isLoading) return <LoadingState label="Počítám bodový přehled…" />;
  if (database.isError || !database.data) {
    return <ErrorState onRetry={() => void database.refetch()} />;
  }

  const allScores = calculateScores(database.data);
  const average =
    allScores.reduce((sum, row) => sum + row.total, 0) /
    Math.max(1, allScores.length);
  const averageRate =
    allScores.reduce((sum, row) => sum + row.attendanceRate, 0) /
    Math.max(1, allScores.length);
  const topScore = allScores[0];

  const exportCsv = () => {
    const rows = [
      [
        "Pořadí",
        "Jméno",
        "Role",
        "Body celkem",
        "Zkoušky",
        "Vystoupení",
        "Účast %",
      ],
      ...scores.map((row, index) => [
        String(index + 1),
        row.member.fullName,
        roleLabels[row.member.role],
        row.total.toFixed(2),
        row.rehearsal.toFixed(2),
        row.performance.toFixed(2),
        row.attendanceRate.toFixed(1),
      ]),
    ];
    const csv = rows
      .map((row) =>
        row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(";"),
      )
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "body-letni-sezona-2026.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page">
      <PageHeader
        actions={
          <Button onClick={exportCsv} variant="secondary">
            <Download aria-hidden="true" />
            Exportovat CSV
          </Button>
        }
        description="Transparentní podklad pro výběr na vystoupení. Body nejsou automatický nárok na účast."
        eyebrow="Letní sezona 2026"
        title="Bodový přehled"
      />

      <section className="score-stats">
        <Card className="score-stat score-stat--featured">
          <span className="score-stat__icon">
            <Medal aria-hidden="true" />
          </span>
          <div>
            <small>Nejvyšší počet bodů</small>
            <strong>{formatPoints(topScore?.total ?? 0)}</strong>
            <span>{topScore?.member.fullName ?? "—"}</span>
          </div>
          <Badge tone="green">
            <ArrowUp aria-hidden="true" />
            průběžně
          </Badge>
        </Card>
        <Card className="score-stat">
          <span className="score-stat__icon score-stat__icon--amber">
            <TrendingUp aria-hidden="true" />
          </span>
          <div>
            <small>Průměr souboru</small>
            <strong>{formatPoints(average)}</strong>
            <span>bodů na člena</span>
          </div>
        </Card>
        <Card className="score-stat">
          <span className="score-stat__icon score-stat__icon--blue">
            <UserCheck aria-hidden="true" />
          </span>
          <div>
            <small>Průměrná účast</small>
            <strong>{Math.round(averageRate)} %</strong>
            <span>z možných bodů</span>
          </div>
        </Card>
      </section>

      <Card className="score-table-card">
        <header className="score-table-card__header">
          <div>
            <span className="eyebrow">Pořadí členů</span>
            <h2>Body za docházku</h2>
            <p>Aktualizováno dnes v 11:45</p>
          </div>
          <div className="score-filters">
            <label className="search-field">
              <Search aria-hidden="true" />
              <span className="sr-only">Hledat člena</span>
              <input
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Hledat jméno…"
                type="search"
                value={search}
              />
            </label>
            <Select
              aria-label="Filtrovat roli"
              onChange={(event) =>
                setRole(event.target.value as "all" | PairingRole)
              }
              value={role}
            >
              <option value="all">Všechny role</option>
              <option value="leader">Tanečníci</option>
              <option value="follower">Tanečnice</option>
            </Select>
            <Select
              aria-label="Řadit tabulku"
              onChange={(event) => setSort(event.target.value as SortKey)}
              value={sort}
            >
              <option value="total">Nejvíce bodů</option>
              <option value="rate">Nejvyšší účast</option>
              <option value="name">Podle jména</option>
            </Select>
          </div>
        </header>

        <div className="responsive-table">
          <table className="score-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Člen</th>
                <th scope="col">Zkoušky</th>
                <th scope="col">Vystoupení</th>
                <th scope="col">Účast</th>
                <th scope="col">Body celkem</th>
              </tr>
            </thead>
            <tbody>
              {scores.map((row, index) => (
                <tr key={row.member.id}>
                  <td>
                    <span
                      className={`rank ${
                        index < 3 && sort === "total" ? `rank--${index + 1}` : ""
                      }`}
                    >
                      {index + 1}
                    </span>
                  </td>
                  <td>
                    <div className="member-cell">
                      <Avatar member={row.member} />
                      <span>
                        <strong>{row.member.fullName}</strong>
                        <small>
                          {roleLabels[row.member.role]}
                          {row.member.experienceKnown !== false ? (
                            <>
                              {" · "}
                              <ExperienceBadge level={row.member.experience} />
                            </>
                          ) : null}
                        </small>
                      </span>
                    </div>
                  </td>
                  <td data-label="Zkoušky">
                    <strong>{formatPoints(row.rehearsal)}</strong>
                    <small>
                      {row.fullAttendance}× celá · {row.partialAttendance}× část
                    </small>
                  </td>
                  <td data-label="Vystoupení">
                    <strong>{formatPoints(row.performance)}</strong>
                    <small>body za akce</small>
                  </td>
                  <td data-label="Účast">
                    <div className="rate-cell">
                      <strong>{Math.round(row.attendanceRate)} %</strong>
                      <span className="progress">
                        <span
                          style={{
                            width: `${Math.min(100, row.attendanceRate)}%`,
                          }}
                        />
                      </span>
                    </div>
                  </td>
                  <td data-label="Celkem">
                    <span className="total-score">{formatPoints(row.total)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {scores.length === 0 ? (
          <div className="table-empty">Filtru neodpovídá žádný člen.</div>
        ) : null}
      </Card>

      <div className="info-callout">
        <Info aria-hidden="true" />
        <div>
          <strong>Jak se body počítají?</strong>
          <p>
            Celá účast získá plnou váhu události. U částečné účasti se body
            přepočítají podle odchozených minut. Omluvená absence má 0 bodů, ale
            v přehledu ji odlišujeme.
          </p>
        </div>
        <span>
          <ArrowDown aria-hidden="true" />
          Výpočet je dohledatelný u každé události
        </span>
      </div>
    </div>
  );
}
