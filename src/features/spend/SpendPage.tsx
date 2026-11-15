import { useMemo } from "react";
import { ProgressBar } from "../../components/ProgressBar";
import { StatTile } from "../../components/StatTile";
import { useRepoState } from "../../data/useRepo";
import { computeDashboard } from "../../lib/dashboard";

/** Pounds, whole, comma thousands: 485800 → "£4,858". */
function formatMoney(cents: number): string {
  const pounds = Math.round(cents / 100);
  return `£${pounds.toLocaleString("en-GB")}`;
}

/** One spend row from computeDashboard's spendByRoom. */
type RoomSpend = ReturnType<typeof computeDashboard>["spendByRoom"][number];

/** "Other" roll-up row: the rooms that didn't make the top 6, pooled. */
interface SplitRooms {
  top: RoomSpend[];
  other: RoomSpend | null;
}

/**
 * Top 6 rooms by spend (spendByRoom follows room order, so sort here),
 * the rest collapsed into one "Other (n)" row summing their cents.
 */
function splitTopRooms(spendByRoom: RoomSpend[]): SplitRooms {
  const sorted = [...spendByRoom].sort((a, b) => b.cents - a.cents);
  const top = sorted.slice(0, 6);
  const rest = sorted.slice(6);
  if (rest.length === 0) return { top, other: null };
  return {
    top,
    other: {
      roomId: "other",
      name: `Other (${rest.length})`,
      cents: rest.reduce((sum, room) => sum + room.cents, 0),
    },
  };
}

const sectionList = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 8,
} as const;

const rowColumn = {
  flexDirection: "column",
  alignItems: "stretch",
  gap: 6,
} as const;

const rowTop = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: 8,
} as const;

const mutedMeta = {
  fontSize: 12,
  color: "var(--muted)",
} as const;

/**
 * Spend: the recorded-costs headline (plus the budgeted-not-spent line
 * when anything is still unspent), per-room bars relative to the biggest
 * spender, and every completed priced purchase newest first. Rows are
 * informational — nothing here is tappable, so nothing fakes a button.
 */
export function SpendPage() {
  const { rooms, tasks } = useRepoState();

  const dashboard = useMemo(
    () => computeDashboard(rooms, tasks),
    [rooms, tasks],
  );

  const { top: topRooms, other: otherRoom } = useMemo(
    () => splitTopRooms(dashboard.spendByRoom),
    [dashboard.spendByRoom],
  );
  const maxCents = topRooms[0]?.cents ?? 0;

  const roomNameById = useMemo(() => {
    const names = new Map<string, string>();
    for (const room of rooms) names.set(room.id, room.name);
    return names;
  }, [rooms]);

  return (
    <main style={{ padding: "16px 16px 24px" }}>
      <h1 style={{ margin: 0, fontSize: 24 }}>Spend</h1>

      <div style={{ marginTop: 12 }}>
        <StatTile
          label="Recorded costs"
          value={formatMoney(dashboard.totalSpendCents)}
          accent
          sub={
            dashboard.budgetedCents > 0
              ? `${formatMoney(dashboard.budgetedCents)} budgeted, not spent`
              : undefined
          }
        />
      </div>

      {topRooms.length > 0 && (
        <>
          <h2 style={{ margin: "20px 0 8px", fontSize: 18 }}>By room</h2>
          <ul aria-label="By room" style={sectionList}>
            {[...topRooms, ...(otherRoom ? [otherRoom] : [])].map((room) => (
              <li key={room.roomId} className="ht-row" style={rowColumn}>
                <span style={rowTop}>
                  <span style={{ fontSize: 16, color: "var(--ink)" }}>
                    {room.name}
                  </span>
                  <span style={mutedMeta}>{formatMoney(room.cents)}</span>
                </span>
                <ProgressBar
                  pct={maxCents === 0 ? 0 : (room.cents / maxCents) * 100}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 style={{ margin: "20px 0 8px", fontSize: 18 }}>
        Recent purchases
      </h2>
      {dashboard.recentPurchases.length === 0 ? (
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>
          No purchases yet
        </p>
      ) : (
        <ul aria-label="Recent purchases" style={sectionList}>
          {dashboard.recentPurchases.map((task) => (
            <li key={task.id} className="ht-row" style={rowColumn}>
              <span style={rowTop}>
                <span style={{ fontSize: 16, color: "var(--ink)" }}>
                  {task.title}
                </span>
                <span style={mutedMeta}>
                  {formatMoney(task.priceCents ?? 0)}
                </span>
              </span>
              <span style={mutedMeta}>
                <span>{roomNameById.get(task.roomId) ?? task.roomId}</span>
                {" · "}
                <span>{task.dateCompleted ?? "—"}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
