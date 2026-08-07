const schema = `CREATE TABLE IF NOT EXISTS sprint_sessions (
  code TEXT PRIMARY KEY,
  distance INTEGER NOT NULL,
  athlete TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting',
  finish_connected INTEGER NOT NULL DEFAULT 0,
  start_at INTEGER,
  finish_at INTEGER,
  created_at INTEGER NOT NULL
)`;

async function ready() {
  const { env } = await import("cloudflare:workers");
  const database = env.DB;
  await database.prepare(schema).run();
  await database.prepare("DELETE FROM sprint_sessions WHERE created_at < ?").bind(Date.now() - 86400000).run();
  return database;
}

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

export async function GET(request: Request) {
  const database = await ready();
  const sessionCode = new URL(request.url).searchParams.get("code")?.toUpperCase();
  if (!sessionCode) return Response.json({ error: "Kode sesi diperlukan." }, { status: 400 });
  const session = await database.prepare("SELECT code, distance, athlete, status, finish_connected AS finishConnected, start_at AS startAt, finish_at AS finishAt FROM sprint_sessions WHERE code = ?").bind(sessionCode).first();
  if (!session) return Response.json({ error: "Sesi tidak ditemukan." }, { status: 404 });
  return Response.json({ session }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const database = await ready();
  const body = await request.json() as { action?: string; code?: string; distance?: number; athlete?: string };
  if (body.action === "create") {
    const sessionCode = makeCode();
    await database.prepare("INSERT INTO sprint_sessions (code, distance, athlete, status, created_at) VALUES (?, ?, ?, 'waiting', ?)")
      .bind(sessionCode, Math.max(2, Math.min(400, Number(body.distance) || 10)), String(body.athlete || "Atlet"), Date.now()).run();
    return Response.json({ code: sessionCode });
  }
  const sessionCode = body.code?.trim().toUpperCase();
  if (!sessionCode) return Response.json({ error: "Kode sesi diperlukan." }, { status: 400 });
  if (body.action === "join") await database.prepare("UPDATE sprint_sessions SET finish_connected = 1 WHERE code = ?").bind(sessionCode).run();
  else if (body.action === "arm") await database.prepare("UPDATE sprint_sessions SET status = 'armed', start_at = NULL, finish_at = NULL WHERE code = ?").bind(sessionCode).run();
  else if (body.action === "start") await database.prepare("UPDATE sprint_sessions SET status = 'running', start_at = ?, finish_at = NULL WHERE code = ? AND status = 'armed'").bind(Date.now(), sessionCode).run();
  else if (body.action === "finish") await database.prepare("UPDATE sprint_sessions SET status = 'finished', finish_at = ? WHERE code = ? AND status = 'running'").bind(Date.now(), sessionCode).run();
  else if (body.action === "reset") await database.prepare("UPDATE sprint_sessions SET status = 'waiting', start_at = NULL, finish_at = NULL WHERE code = ?").bind(sessionCode).run();
  else return Response.json({ error: "Aksi tidak dikenal." }, { status: 400 });
  const session = await database.prepare("SELECT code, distance, athlete, status, finish_connected AS finishConnected, start_at AS startAt, finish_at AS finishAt FROM sprint_sessions WHERE code = ?").bind(sessionCode).first();
  if (!session) return Response.json({ error: "Sesi tidak ditemukan." }, { status: 404 });
  return Response.json({ session });
}
