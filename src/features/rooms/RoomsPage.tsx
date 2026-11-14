import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ProgressBar } from "../../components/ProgressBar";
import { Sheet } from "../../components/Sheet";
import { repo, useRepoState } from "../../data/useRepo";
import { computeDashboard } from "../../lib/dashboard";

const sectionList = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 8,
} as const;

/** Room card: taller than a row, stacked like Home's room rows. */
const roomCard = {
  width: "100%",
  minHeight: 44,
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: 6,
  textAlign: "left",
  font: "inherit",
  cursor: "pointer",
} as const;

const cardTop = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: 8,
} as const;

const cardMeta = {
  fontSize: 12,
  color: "var(--muted)",
} as const;

/**
 * Rooms, the index screen: one card per room in sortOrder — name, x/y
 * completed, a progress bar and (when nonzero) a muted "n ready now" line —
 * plus an Add-room sheet at the bottom. Tapping a card opens the room's
 * detail page.
 */
export function RoomsPage() {
  const { rooms, tasks } = useRepoState();
  const navigate = useNavigate();
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");

  const dashboard = useMemo(
    () => computeDashboard(rooms, tasks),
    [rooms, tasks],
  );

  const progressByRoomId = useMemo(
    () => new Map(dashboard.roomProgress.map((room) => [room.roomId, room])),
    [dashboard],
  );

  // Cards follow sortOrder (first appearance in the seed), not the raw
  // state array order.
  const roomsSorted = useMemo(
    () => [...rooms].sort((a, b) => a.sortOrder - b.sortOrder),
    [rooms],
  );

  const readyCountFor = (roomId: string): number =>
    tasks.filter(
      (task) =>
        task.roomId === roomId &&
        task.status !== "completed" &&
        task.canDoNow === "yes",
    ).length;

  const handleAddRoom = (event: FormEvent): void => {
    event.preventDefault();
    const trimmed = name.trim();
    // Nothing to create yet — keep the sheet open for more typing.
    if (trimmed === "") return;
    repo.addRoom(trimmed);
    setName("");
    setAddOpen(false);
  };

  return (
    <main style={{ padding: "16px 16px 24px" }}>
      <h1 style={{ margin: 0, fontSize: 24 }}>Rooms</h1>

      <ul aria-label="Rooms" style={{ ...sectionList, marginTop: 12 }}>
        {roomsSorted.map((room) => {
          const progress = progressByRoomId.get(room.id);
          const completed = progress?.completed ?? 0;
          const total = progress?.total ?? 0;
          const readyCount = readyCountFor(room.id);
          return (
            <li key={room.id}>
              <button
                type="button"
                className="ht-row"
                style={roomCard}
                aria-label={`${room.name} · ${completed}/${total}`}
                onClick={() => navigate(`/rooms/${room.id}`)}
              >
                <span style={cardTop}>
                  <span style={{ fontSize: 16, color: "var(--ink)" }}>
                    {room.name}
                  </span>
                  <span style={cardMeta}>
                    {completed}/{total}
                  </span>
                </span>
                <ProgressBar pct={progress?.pct ?? 0} />
                {readyCount > 0 && (
                  <span style={cardMeta}>{readyCount} ready now</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        className="ht-btn"
        style={{ width: "100%", marginTop: 16 }}
        onClick={() => setAddOpen(true)}
      >
        Add room
      </button>

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Add room">
        <form className="ht-form" onSubmit={handleAddRoom}>
          <div className="ht-form__field">
            <label className="ht-form__label" htmlFor="add-room-name">
              Room name
            </label>
            <input
              id="add-room-name"
              className="ht-form__input"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <button type="submit" className="ht-sheet__done">
            Save
          </button>
        </form>
      </Sheet>
    </main>
  );
}
