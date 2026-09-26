/** Server-only data access for BugFinder (service role, never exposed to browsers). */
import type { Fix } from "./agent.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export type SessionRow = {
  id: string;
  user_id: string | null;
  title: string | null;
  language: string | null;
  original_code: string;
  sample_input: string | null;
  sample_output: string | null;
  scope_mode: string | null;
  line_from: number | null;
  line_to: number | null;
  target_file: string | null;
  fixed_code: string | null;
  summary: string | null;
  issue_count: number;
  status: string;
  created_at: string;
};

export async function saveUser(user: { id: string; email: string; name: string; avatar: string }) {
  const db = await admin();
  const { data, error } = await db
    .from("bf_users")
    .upsert({ ...user }, { onConflict: "id" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function createDebugSession(row: Omit<SessionRow, "id" | "created_at">) {
  const db = await admin();
  const { data, error } = await db
    .from("debug_sessions")
    .insert({ id: newId("sess"), ...row })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as SessionRow;
}

export async function saveErrorFixes(
  fixes: Fix[],
  sessionId: string,
  userId: string,
  targetFile: string,
) {
  if (!fixes.length) return [];
  const db = await admin();
  const rows = fixes.map((f) => ({
    id: newId("err"),
    session_id: sessionId,
    user_id: userId,
    target_file: targetFile,
    line_number: f.lineNumber,
    error_type: f.errorType,
    severity: f.severity,
    description: f.description,
    original_line: f.originalLine,
    fixed_line: f.fixedLine,
    why: f.why,
  }));
  const { data, error } = await db.from("error_logs").insert(rows).select();
  if (error) throw new Error(error.message);
  return data;
}

export async function getDebugSessions(userId: string, limit = 50) {
  const db = await admin();
  let q = db.from("debug_sessions").select("*").order("created_at", { ascending: false }).limit(limit);
  if (userId) q = q.eq("user_id", userId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getDebugSessionById(id: string) {
  const db = await admin();
  const { data, error } = await db.from("debug_sessions").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const { data: logs } = await db
    .from("error_logs")
    .select("*")
    .eq("session_id", id)
    .order("line_number", { ascending: true });
  return {
    ...data,
    fixes: (logs ?? []).map((l) => ({
      lineNumber: l.line_number,
      errorType: l.error_type,
      severity: l.severity,
      description: l.description,
      originalLine: l.original_line,
      fixedLine: l.fixed_line,
      why: l.why,
    })),
  };
}

export async function deleteDebugSession(id: string) {
  const db = await admin();
  const { error } = await db.from("debug_sessions").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getErrorLogs(userId: string, query = "", type = "all") {
  const db = await admin();
  let q = db.from("error_logs").select("*").order("created_at", { ascending: false }).limit(300);
  if (userId) q = q.eq("user_id", userId);
  if (type && type !== "all") q = q.eq("error_type", type);
  if (query.trim()) {
    const term = `%${query.trim()}%`;
    q = q.or(
      `error_type.ilike.${term},description.ilike.${term},target_file.ilike.${term},why.ilike.${term},original_line.ilike.${term}`,
    );
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getStats(userId: string) {
  const db = await admin();
  const sessions = db.from("debug_sessions").select("id", { count: "exact", head: true });
  const errors = db.from("error_logs").select("id", { count: "exact", head: true });
  const [s, e] = await Promise.all([
    userId ? sessions.eq("user_id", userId) : sessions,
    userId ? errors.eq("user_id", userId) : errors,
  ]);
  return { totalSessions: s.count ?? 0, totalBugsFixed: e.count ?? 0 };
}
