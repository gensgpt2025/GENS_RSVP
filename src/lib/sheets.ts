import { createSign } from "node:crypto";

type SheetRow = {
  id: string;
  date: string;
  start: string;
  end: string;
  title: string;
  type: string;
  location: string;
  notes: string;
  opponent: string;
  result_home: string;
  result_away: string;
  outcome: string;
};

type StatsRow = Record<string, string>;

export type SyncedSheetEvent = {
  sheetId: string;
  title: string;
  eventType: string;
  opponent: string | null;
  description: string | null;
  location: string | null;
  resultHome: number | null;
  resultAway: number | null;
  outcome: string | null;
  startIso: string;
  endIso: string;
};

export type SyncedSheetStat = {
  eventSheetId: string;
  memberId: string;
  goals: number;
  assists: number;
  notes: string | null;
};

function base64Url(input: string | Buffer) {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getAccessToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !privateKey) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY are required.");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(
    JSON.stringify({
      iss: email,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    }),
  );
  const unsigned = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const signature = base64Url(signer.sign(privateKey));

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get Google access token: ${response.status}`);
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Google access token was empty.");
  return data.access_token;
}

function safeText(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function pick(row: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (safeText(value)) return value;
  }

  return "";
}

function parseTime(value: string | null | undefined) {
  const match = safeText(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function parseDate(value: string | null | undefined) {
  const match = safeText(value).match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function toIso(date: ReturnType<typeof parseDate>, time: ReturnType<typeof parseTime>) {
  if (!date || !time) return null;
  return new Date(Date.UTC(date.year, date.month - 1, date.day, time.hour - 9, time.minute)).toISOString();
}

function parseOptionalNumber(value: string | null | undefined) {
  const text = safeText(value);
  if (!text) return null;
  const normalized = text.replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapType(type: string | null | undefined, fallbackTitle: string | null | undefined) {
  const title = safeText(fallbackTitle);
  const normalized = safeText(type).toLowerCase();
  if (title) return title;
  if (normalized === "match") return "練習試合";
  if (normalized === "league") return "県リーグ";
  if (normalized === "training") return "トレーニング";
  if (normalized === "other") return "その他";
  return title || safeText(type);
}

function rowToEvent(row: SheetRow): SyncedSheetEvent | null {
  if (!row.id || !row.date || !row.start || !row.end || !row.type) return null;

  const date = parseDate(row.date);
  const start = parseTime(row.start);
  const end = parseTime(row.end);
  const startIso = toIso(date, start);
  const endIso = toIso(date, end);
  if (!startIso || !endIso || new Date(endIso) <= new Date(startIso)) return null;

  const eventType = row.type.trim().toLowerCase();
  const showOpponent = eventType === "match" || eventType === "league";

  return {
    sheetId: row.id,
    title: mapType(row.type, row.title),
    eventType,
    opponent: showOpponent && row.opponent ? row.opponent : null,
    description: JSON.stringify({
      notes: row.notes || "",
      type: eventType,
      opponent: showOpponent && row.opponent ? row.opponent : "",
    }),
    location: row.location || null,
    resultHome: parseOptionalNumber(row.result_home),
    resultAway: parseOptionalNumber(row.result_away),
    outcome: row.outcome || null,
    startIso,
    endIso,
  };
}

function rowToStat(row: StatsRow): SyncedSheetStat | null {
  const eventId = pick(row, ["event_id", "eventid", "event"]);
  const memberId = pick(row, ["member_id", "memberid", "member", "number", "player_id", "playerid", "player"]);
  if (!eventId || !memberId) return null;

  const goals = parseOptionalNumber(pick(row, ["goals", "goal", "g", "得点", "ゴール"])) ?? 0;
  const assists = parseOptionalNumber(pick(row, ["assists", "assist", "a", "アシスト"])) ?? 0;

  return {
    eventSheetId: eventId,
    memberId,
    goals,
    assists,
    notes: pick(row, ["notes", "note", "memo", "メモ", "備考"]) || null,
  };
}

function rowsToObjects(values: string[][]) {
  const [header, ...rows] = values;
  if (!header) return [];

  return rows.map((row) => {
    const object: Record<string, string> = {};
    header.forEach((key, index) => {
      object[key.trim().toLowerCase().replace(/[\s-]+/g, "_")] = row[index]?.trim() ?? "";
    });
    return object as SheetRow;
  });
}

export async function fetchSheetEvents() {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const range = process.env.GOOGLE_SHEET_RANGE || "Schedule!A:L";
  if (!sheetId) throw new Error("GOOGLE_SHEET_ID is required.");

  const token = await getAccessToken();
  const values = await fetchSheetValues(sheetId, range, token);
  return rowsToObjects(values).map(rowToEvent).filter((event): event is SyncedSheetEvent => Boolean(event));
}

export async function fetchSheetStats() {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const range = process.env.GOOGLE_STATS_RANGE || "Stats!A:Z";
  if (!sheetId) throw new Error("GOOGLE_SHEET_ID is required.");

  const token = await getAccessToken();
  const values = await fetchSheetValues(sheetId, range, token, true);
  return rowsToObjects(values).map((row) => rowToStat(row as unknown as StatsRow)).filter((stat): stat is SyncedSheetStat => Boolean(stat));
}

async function fetchSheetValues(sheetId: string, range: string, token: string, optional = false) {
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`);
  url.searchParams.set("majorDimension", "ROWS");
  url.searchParams.set("valueRenderOption", "FORMATTED_VALUE");

  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!response.ok) {
    if (optional) return [];
    throw new Error(`Failed to fetch Google Sheet: ${response.status}`);
  }

  const data = (await response.json()) as { values?: string[][] };
  return data.values ?? [];
}
