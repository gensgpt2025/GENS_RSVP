"use client";

import { useMemo, useState } from "react";
import { CalendarPlus } from "lucide-react";

const eventTypes = [
  { value: "match", label: "練習試合", defaultTitle: "練習試合" },
  { value: "league", label: "公式戦", defaultTitle: "県リーグ" },
  { value: "training", label: "練習", defaultTitle: "トレーニング" },
  { value: "other", label: "その他", defaultTitle: "" },
];
const hours = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const baseMinutes = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, "0"));

type EventFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  buttonLabel: string;
  defaults?: {
    id?: string;
    category?: string;
    eventType?: string;
    titleText?: string;
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

function normalizeEventType(value?: string) {
  if (value && eventTypes.some((item) => item.value === value)) return value;
  if (value === "練習試合") return "match";
  if (value === "県リーグ" || value === "公式戦") return "league";
  if (value === "トレーニング" || value === "練習") return "training";
  return "training";
}

function defaultTitleForType(value: string) {
  return eventTypes.find((item) => item.value === value)?.defaultTitle ?? "";
}

export function EventForm({ action, buttonLabel, defaults }: EventFormProps) {
  const initialEventType = normalizeEventType(defaults?.eventType ?? defaults?.category);
  const initialDateTime = parseDateTimeRange(defaults?.datetimeRange);
  const [eventType, setEventType] = useState(initialEventType);
  const [titleText, setTitleText] = useState(defaults?.titleText ?? defaultTitleForType(initialEventType));
  const [date, setDate] = useState(initialDateTime.date);
  const [startHour, setStartHour] = useState(initialDateTime.startHour);
  const [startMinute, setStartMinute] = useState(initialDateTime.startMinute);
  const [endHour, setEndHour] = useState(initialDateTime.endHour);
  const [endMinute, setEndMinute] = useState(initialDateTime.endMinute);
  const needsOpponent = useMemo(() => eventType === "match" || eventType === "league", [eventType]);
  const minutes = useMemo(() => minutesWithCurrent(startMinute, endMinute), [startMinute, endMinute]);
  const datetimeRange = date ? `${date.replaceAll("-", "/")} ${startHour}:${startMinute}-${endHour}:${endMinute}` : "";

  function changeEventType(value: string) {
    setEventType(value);
    setTitleText((current) => current || defaultTitleForType(value));
  }

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
        <span>種別</span>
        <select name="event_type" value={eventType} onChange={(event) => changeEventType(event.target.value)} required>
          {eventTypes.map((item) => (
            <option value={item.value} key={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>内容</span>
        <input name="title_text" value={titleText} onChange={(event) => setTitleText(event.target.value)} placeholder="例：県リーグ 第3節" required />
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
