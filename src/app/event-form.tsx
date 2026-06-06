"use client";

import { useMemo, useState } from "react";
import { CalendarPlus } from "lucide-react";

const categories = ["練習試合", "県リーグ", "トレーニング"];
const hours = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const baseMinutes = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, "0"));

type EventFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  buttonLabel: string;
  defaults?: {
    id?: string;
    category?: string;
    opponent?: string;
    datetimeRange?: string;
    location?: string;
    description?: string;
  };
};

function parseDateTimeRange(value?: string) {
  const match = value?.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);

  if (!match) {
    return {
      date: "",
      startHour: "19",
      startMinute: "00",
      endHour: "21",
      endMinute: "00",
    };
  }

  const [, year, month, day, startHour, startMinute, endHour, endMinute] = match;
  return {
    date: `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
    startHour: startHour.padStart(2, "0"),
    startMinute,
    endHour: endHour.padStart(2, "0"),
    endMinute,
  };
}

function minutesWithCurrent(...values: string[]) {
  return Array.from(new Set([...baseMinutes, ...values.filter(Boolean)])).sort((a, b) => Number(a) - Number(b));
}

export function EventForm({ action, buttonLabel, defaults }: EventFormProps) {
  const initialCategory = defaults?.category && categories.includes(defaults.category) ? defaults.category : categories[0];
  const initialDateTime = parseDateTimeRange(defaults?.datetimeRange);
  const [category, setCategory] = useState(initialCategory);
  const [date, setDate] = useState(initialDateTime.date);
  const [startHour, setStartHour] = useState(initialDateTime.startHour);
  const [startMinute, setStartMinute] = useState(initialDateTime.startMinute);
  const [endHour, setEndHour] = useState(initialDateTime.endHour);
  const [endMinute, setEndMinute] = useState(initialDateTime.endMinute);
  const needsOpponent = useMemo(() => category === "練習試合" || category === "県リーグ", [category]);
  const minutes = useMemo(() => minutesWithCurrent(startMinute, endMinute), [startMinute, endMinute]);
  const datetimeRange = date ? `${date.replaceAll("-", "/")} ${startHour}:${startMinute}-${endHour}:${endMinute}` : "";

  return (
    <form action={action} className="stack-form">
      {defaults?.id ? <input type="hidden" name="event_id" value={defaults.id} /> : null}
      <input type="hidden" name="datetime_range" value={datetimeRange} />

      <label>
        <span>日時</span>
        <div className="datetime-picker-grid">
          <input aria-label="日付" type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
          <div className="time-select-group" aria-label="開始時刻">
            <select value={startHour} onChange={(event) => setStartHour(event.target.value)} required>
              {hours.map((hour) => (
                <option value={hour} key={hour}>
                  {hour}
                </option>
              ))}
            </select>
            <span>:</span>
            <select value={startMinute} onChange={(event) => setStartMinute(event.target.value)} required>
              {minutes.map((minute) => (
                <option value={minute} key={minute}>
                  {minute}
                </option>
              ))}
            </select>
          </div>
          <span className="datetime-separator">-</span>
          <div className="time-select-group" aria-label="終了時刻">
            <select value={endHour} onChange={(event) => setEndHour(event.target.value)} required>
              {hours.map((hour) => (
                <option value={hour} key={hour}>
                  {hour}
                </option>
              ))}
            </select>
            <span>:</span>
            <select value={endMinute} onChange={(event) => setEndMinute(event.target.value)} required>
              {minutes.map((minute) => (
                <option value={minute} key={minute}>
                  {minute}
                </option>
              ))}
            </select>
          </div>
        </div>
      </label>

      <label>
        <span>内容</span>
        <select name="category" value={category} onChange={(event) => setCategory(event.target.value)} required>
          {categories.map((item) => (
            <option value={item} key={item}>
              {item}
            </option>
          ))}
        </select>
      </label>

      {needsOpponent ? (
        <label>
          <span>対戦相手</span>
          <input name="opponent" defaultValue={defaults?.opponent ?? ""} required />
        </label>
      ) : null}

      <label>
        <span>場所</span>
        <input name="location" defaultValue={defaults?.location ?? ""} />
      </label>

      <label>
        <span>詳細</span>
        <textarea name="description" rows={4} defaultValue={defaults?.description ?? ""} />
      </label>

      <button className="primary-button" type="submit">
        <CalendarPlus size={18} />
        {buttonLabel}
      </button>
    </form>
  );
}
