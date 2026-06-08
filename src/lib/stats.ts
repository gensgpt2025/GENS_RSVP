import { ensureSchema, sql } from "@/lib/db";
import type { Member, PlayerStat } from "@/lib/types";

export type PlayerStatSummary = {
  member_id: string;
  member_name: string;
  goals: number;
  assists: number;
  points: number;
};

function displayName(memberId: string, members: Member[]) {
  const member = members.find((item) => item.id === memberId || item.name === memberId || item.name.startsWith(`${memberId}_`));
  return member?.name ?? memberId;
}

export async function getPlayerStats() {
  await ensureSchema();
  const { rows } = await sql`
    SELECT event_sheet_id, member_id, goals, assists, notes, updated_at
    FROM player_stats
    ORDER BY event_sheet_id ASC, member_id ASC
  `;
  return rows as PlayerStat[];
}

export function summarizePlayerStats(stats: PlayerStat[], members: Member[]) {
  const grouped = new Map<string, PlayerStatSummary>();

  for (const stat of stats) {
    const current =
      grouped.get(stat.member_id) ??
      ({
        member_id: stat.member_id,
        member_name: displayName(stat.member_id, members),
        goals: 0,
        assists: 0,
        points: 0,
      } satisfies PlayerStatSummary);

    current.goals += Number(stat.goals);
    current.assists += Number(stat.assists);
    current.points = current.goals + current.assists;
    grouped.set(stat.member_id, current);
  }

  for (const member of members) {
    if (grouped.has(member.id) || grouped.has(member.name)) continue;
    const number = member.name.match(/^\d+/)?.[0];
    if (number && grouped.has(number)) continue;

    grouped.set(number ?? member.id, {
      member_id: number ?? member.id,
      member_name: member.name,
      goals: 0,
      assists: 0,
      points: 0,
    });
  }

  return Array.from(grouped.values()).sort((a, b) => b.points - a.points || b.goals - a.goals || b.assists - a.assists || a.member_name.localeCompare(b.member_name, "ja"));
}

export async function getPlayerStatSummary(members: Member[]) {
  return summarizePlayerStats(await getPlayerStats(), members);
}

export function statsForEvent(stats: PlayerStat[], eventSheetId: string | null) {
  if (!eventSheetId) return [];
  return stats.filter((stat) => stat.event_sheet_id === eventSheetId && (stat.goals > 0 || stat.assists > 0));
}
