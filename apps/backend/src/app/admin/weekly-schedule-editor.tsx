"use client";

import { useState } from "react";
import { Button } from "@supastore/ui/button";
import { Input } from "@supastore/ui/input";

const days = [
  ["mon", "Monday"],
  ["tue", "Tuesday"],
  ["wed", "Wednesday"],
  ["thu", "Thursday"],
  ["fri", "Friday"],
  ["sat", "Saturday"],
  ["sun", "Sunday"],
] as const;
type Schedule = Record<string, [string, string][]>;

export function WeeklyScheduleEditor({ value = {} }: { value?: Schedule }) {
  const [schedule, setSchedule] = useState<Schedule>(value);
  function change(day: string, index: number, position: 0 | 1, time: string) {
    setSchedule((current) => ({
      ...current,
      [day]: (current[day] ?? []).map((window, row) =>
        row === index
          ? position === 0
            ? [time, window[1]]
            : [window[0], time]
          : window,
      ),
    }));
  }
  return (
    <fieldset className="weekly-schedule-editor">
      <legend>Weekly availability</legend>
      <p>
        Times use the store timezone. Add multiple windows per day, or leave a
        day closed.
      </p>
      <input
        type="hidden"
        name="weeklySchedule"
        value={JSON.stringify(schedule)}
      />
      {days.map(([day, label]) => (
        <div className="schedule-day" key={day}>
          <strong>{label}</strong>
          <div>
            {!schedule[day]?.length && <span className="muted">Closed</span>}
            {(schedule[day] ?? []).map(([start, end], index) => (
              <div className="schedule-window" key={index}>
                <Input
                  type="time"
                  required
                  value={start}
                  aria-label={`${label} window ${index + 1} start`}
                  onChange={(event) =>
                    change(day, index, 0, event.target.value)
                  }
                />
                <span aria-hidden="true">–</span>
                <Input
                  type="time"
                  required
                  value={end}
                  aria-label={`${label} window ${index + 1} end`}
                  onChange={(event) =>
                    change(day, index, 1, event.target.value)
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Remove ${label} window ${index + 1}`}
                  onClick={() =>
                    setSchedule((current) => ({
                      ...current,
                      [day]: current[day]!.filter((_, row) => row !== index),
                    }))
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setSchedule((current) => ({
                ...current,
                [day]: [...(current[day] ?? []), ["09:00", "17:00"]],
              }))
            }
          >
            Add window<span className="sr-only"> for {label}</span>
          </Button>
        </div>
      ))}
    </fieldset>
  );
}
