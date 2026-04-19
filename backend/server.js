import express from "express";
import pg from "pg";

const { Pool } = pg;
const app = express();
app.use(express.json({ limit: "50mb" }));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
});

async function ensureTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS farm_document (
              id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
                    state JSONB NOT NULL DEFAULT '{}'::jsonb,
                          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                              );
                                `);
    await pool.query(
          `INSERT INTO farm_document (id, state) VALUES (1, '{}'::jsonb) ON CONFLICT (id) DO NOTHING;`
        );
}

function requireToken(req, res, next) {
    const token = process.env.FARM_API_TOKEN;
    if (!token) return next();
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${token}`) return res.status(401).json({ error: "Unauthorized" });
    return next();
}

app.get("/", (req, res) => res.json({ name: "Sparmanik Farm API", status: "ok" }));
app.get("/health", (req, res) => res.json({ status: "healthy" }));

app.get("/api/state", requireToken, async (req, res) => {
    try {
          await ensureTable();
          const r = await pool.query("SELECT state FROM farm_document WHERE id = 1");
          return res.json(r.rows[0]?.state || {});
    } catch (e) {
          console.error(e);
          return res.status(500).json({ error: "Failed to read state" });
    }
});

app.put("/api/state", requireToken, async (req, res) => {
    try {
          await ensureTable();
          const body = req.body;
          if (!body || typeof body !== "object" || Array.isArray(body))
                  return res.status(400).json({ error: "Body must be a JSON object" });
          await pool.query(
                  `INSERT INTO farm_document (id, state, updated_at) VALUES (1, $1::jsonb, NOW())
                         ON CONFLICT (id) DO UPDATE SET state = $1::jsonb, updated_at = NOW()`,
                  [JSON.stringify(body)]
                );
          return res.json({ ok: true });
    } catch (e) {
          console.error(e);
          return res.status(500).json({ error: "Failed to save state" });
    }
});

const port = Number(process.env.PORT) || 3001;
ensureTable()
  .then(() => app.listen(port, "0.0.0.0", () => console.log(`API listening on ${port}`)))
  .catch((err) => { console.error("Failed to start:", err); process.exit(1); });
