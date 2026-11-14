import { useState } from "react";
import type { FormEvent } from "react";
import { Sheet } from "../../components/Sheet";
import type { NewTask } from "../../data/repo";
import { repo, useRepoState } from "../../data/useRepo";
import type { CanDoNow, Effort, Priority } from "../../data/types";
import { SegmentedControl } from "./TaskSheet";

/** Effort label → weight (exact plan map: XS:1, S:2, M:3, L:5, XL:8). */
const EFFORT_WEIGHT: Record<Effort, number> = {
  XS: 1,
  S: 2,
  M: 3,
  L: 5,
  XL: 8,
};

const PRIORITY_OPTIONS: ReadonlyArray<{ value: Priority; label: string }> = [
  { value: "urgent", label: "Urgent" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "very_low", label: "Very low" },
];

const EFFORT_OPTIONS: ReadonlyArray<{ value: Effort; label: string }> = [
  { value: "XS", label: "XS" },
  { value: "S", label: "S" },
  { value: "M", label: "M" },
  { value: "L", label: "L" },
  { value: "XL", label: "XL" },
];

const CAN_DO_NOW_OPTIONS: ReadonlyArray<{ value: CanDoNow; label: string }> = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "na", label: "N/A" },
];

/**
 * Quick capture sheet for a new task: title, room, priority, effort and
 * can-do-now. Defaults per the plan (status "planned", priority "medium",
 * effort "M", canDoNow "yes"; room = `defaultRoomId` or the first room).
 * Creating goes through `repo.addTask` — id and timestamps are the repo's
 * job — then the sheet closes and the drafts reset for the next capture.
 */
export function NewTaskSheet({
  open,
  onClose,
  defaultRoomId,
}: {
  open: boolean
  onClose: () => void
  defaultRoomId?: string
}) {
  const { rooms } = useRepoState();
  const defaultRoom = (): string => defaultRoomId ?? rooms[0]?.id ?? "";
  const [title, setTitle] = useState("");
  const [roomId, setRoomId] = useState<string>(defaultRoom);
  const [priority, setPriority] = useState<Priority>("medium");
  const [effort, setEffort] = useState<Effort>("M");
  const [canDoNow, setCanDoNow] = useState<CanDoNow>("yes");

  const reset = (): void => {
    setTitle("");
    setRoomId(defaultRoom());
    setPriority("medium");
    setEffort("M");
    setCanDoNow("yes");
  };

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    const trimmed = title.trim();
    // Nothing to create yet — keep the sheet open for more typing.
    if (trimmed === "" || roomId === "") return;
    const input: NewTask = {
      roomId,
      title: trimmed,
      status: "planned",
      priority,
      effort,
      effortWeight: EFFORT_WEIGHT[effort],
      canDoNow,
      priceCents: null,
      datePlanned: null,
      dateCompleted: null,
      notes: "",
    };
    repo.addTask(input);
    reset();
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="New task">
      <form className="ht-form" onSubmit={handleSubmit}>
        <div className="ht-form__field">
          <label className="ht-form__label" htmlFor="new-title">
            Title
          </label>
          <input
            id="new-title"
            className="ht-form__input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className="ht-form__field">
          <label className="ht-form__label" htmlFor="new-room">
            Room
          </label>
          <select
            id="new-room"
            className="ht-form__input"
            value={roomId}
            onChange={(event) => setRoomId(event.target.value)}
          >
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </div>

        <SegmentedControl
          label="Priority"
          value={priority}
          options={PRIORITY_OPTIONS}
          onChange={setPriority}
        />

        <SegmentedControl
          label="Effort"
          value={effort}
          options={EFFORT_OPTIONS}
          onChange={setEffort}
        />

        <SegmentedControl
          label="Can do now"
          value={canDoNow}
          options={CAN_DO_NOW_OPTIONS}
          onChange={setCanDoNow}
        />

        <button type="submit" className="ht-sheet__done">
          Add task
        </button>
      </form>
    </Sheet>
  );
}
