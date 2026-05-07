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
};

export type SyncedSheetEvent = {
  sheetId: string;
  title: string;
  description: string | null;
  location: string | null;
  startIso: string;
  endIso: string;
};

export type SyncedSheetMember = {
  name: string;
  number: number | null;
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

function parseTime(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function parseDate(value: string) {
  const match = value.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function toIso(date: ReturnType<typeof parseDate>, time: ReturnType<typeof parseTime>) {
  if (!date || !time) return null;
  return new Date(Date.UTC(date.year, date.month - 1, date.day, time.hour - 9, time.minute)).toISOString();
}

function mapType(type: string, fallbackTitle: string) {
  const normalized = type.trim().toLowerCase();
  if (normalized === "match") return "練習試合";
  if (normalized === "league") return "県リーグ";
  if (normalized === "training") return fallbackTitle.includes("中止") ? "トレーニング 中止" : "トレーニング";
  return fallbackTitle || type;
}

function rowToEvent(row: SheetRow): SyncedSheetEvent | null {
  if (!row.id || !row.date || !row.start || !row.end || !row.type) return null;

  const date = parseDate(row.date);
  const start = parseTime(row.start);
  const end = parseTime(row.end);
  const startIso = toIso(date, start);
  const endIso = toIso(date, end);
  if (!startIso || !endIso || new Date(endIso) <= new Date(startIso)) return null;

  const category = mapType(row.type, row.title);
  const title = (category === "練習試合" || category === "県リーグ") && row.opponent ? `${category} vs ${row.opponent}` : category;

  return {
    sheetId: row.id,
    title,
    description: row.notes || null,
    location: row.location || null,
    startIso,
    endIso,
  };
}

function rowsToObjects(values: string[][]) {
  const [header, ...rows] = values;
  if (!header) return [];

  return rows.map((row) => {
    const object: Record<string, string> = {};
    header.forEach((key, index) => {
      object[key.trim().toLowerCase()] = row[index]?.trim() ?? "";
    });
    return object as SheetRow;
  });
}

export async function fetchSheetEvents() {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const range = process.env.GOOGLE_SHEET_RANGE || "A:I";
  if (!sheetId) throw new Error("GOOGLE_SHEET_ID is required.");

  const token = await getAccessToken();
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`);
  url.searchParams.set("majorDimension", "ROWS");
  url.searchParams.set("valueRenderOption", "FORMATTED_VALUE");

  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Google Sheet: ${response.status}`);
  }

  const data = (await response.json()) as { values?: string[][] };
  return rowsToObjects(data.values ?? []).map(rowToEvent).filter((event): event is SyncedSheetEvent => Boolean(event));
}

function columnToIndex(value?: string) {
  if (!value) return null;
  const trimmed = value.trim().toUpperCase();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) - 1;
  if (/^[A-Z]+$/.test(trimmed)) {
    return trimmed.split("").reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1;
  }
  return null;
}

function hasJapanese(value: string) {
  return /[ぁ-んァ-ヶ一-龠々]/.test(value);
}

function formatMemberName(number: number | null, displayName: string) {
  const normalizedName = displayName.replace(/\s+/g, " ").trim();
  if (number === null || normalizedName.startsWith(`${number} `)) return normalizedName;
  return `${number} ${normalizedName}`;
}

function memberNameFromRow(row: string[]) {
  const cleaned = row.map((cell) => cell?.trim() ?? "").filter(Boolean);
  if (cleaned.length === 0) return null;

  const numberColumn = columnToIndex(process.env.GOOGLE_MEMBERS_NUMBER_COLUMN);
  const nameColumn = columnToIndex(process.env.GOOGLE_MEMBERS_NAME_COLUMN);

  const configuredNumber = numberColumn === null ? null : row[numberColumn]?.trim();
  const numericCells = cleaned.filter((cell) => /^\d+$/.test(cell));
  const numberSource = configuredNumber || (numericCells.length > 1 ? numericCells[1] : numericCells[0]);
  const number = numberSource && /^\d+$/.test(numberSource) ? Number(numberSource) : null;

  const configuredName = nameColumn === null ? null : row[nameColumn]?.trim();
  const textCells = cleaned.filter((cell) => !/^\d+$/.test(cell));
  const japaneseName = [...textCells].reverse().find(hasJapanese);
  const name = configuredName || japaneseName || textCells[textCells.length - 1];
  if (!name) return null;

  return {
    name: formatMemberName(number, name),
    number,
  };
}

export async function fetchSheetMembers() {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const range = process.env.GOOGLE_MEMBERS_RANGE || process.env.PLAYERS_RANGE || "players!A2:E";
  if (!sheetId) throw new Error("GOOGLE_SHEET_ID is required.");

  const token = await getAccessToken();
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`);
  url.searchParams.set("majorDimension", "ROWS");
  url.searchParams.set("valueRenderOption", "FORMATTED_VALUE");

  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Google Sheet members: ${response.status}`);
  }

  const data = (await response.json()) as { values?: string[][] };
  const seen = new Set<string>();
  return (data.values ?? [])
    .map(memberNameFromRow)
    .filter((member): member is SyncedSheetMember => Boolean(member))
    .filter((member) => {
      const key = member.name.replace(/\s+/g, " ").trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
