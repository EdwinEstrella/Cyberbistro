import sqlite3
import pathlib

project = "cyberbistro"
db = pathlib.Path.home() / ".engram" / "engram.db"

con = sqlite3.connect(db)
con.row_factory = sqlite3.Row
cur = con.cursor()

rows = cur.execute("""
SELECT *
FROM sync_mutations
WHERE project = ?
  AND entity = 'relation'
  AND op = 'upsert'
  AND target_key = 'cloud'
  AND acked_at IS NULL
ORDER BY seq
""", (project,)).fetchall()

print("Mutaciones relation/upsert pendientes encontradas:", len(rows))

for row in rows:
    print("SEQ:", row["seq"], "ENTITY_KEY:", row["entity_key"])

cur.execute("""
CREATE TABLE IF NOT EXISTS sync_mutations_manual_backup (
    backed_up_at TEXT DEFAULT CURRENT_TIMESTAMP,
    seq INTEGER,
    target_key TEXT,
    entity TEXT,
    entity_key TEXT,
    op TEXT,
    payload TEXT,
    source TEXT,
    occurred_at TEXT,
    acked_at TEXT,
    project TEXT
)
""")

cur.execute("""
INSERT INTO sync_mutations_manual_backup
(seq, target_key, entity, entity_key, op, payload, source, occurred_at, acked_at, project)
SELECT seq, target_key, entity, entity_key, op, payload, source, occurred_at, acked_at, project
FROM sync_mutations
WHERE project = ?
  AND entity = 'relation'
  AND op = 'upsert'
  AND target_key = 'cloud'
  AND acked_at IS NULL
""", (project,))

cur.execute("""
DELETE FROM sync_mutations
WHERE project = ?
  AND entity = 'relation'
  AND op = 'upsert'
  AND target_key = 'cloud'
  AND acked_at IS NULL
""", (project,))

con.commit()

remaining = cur.execute("""
SELECT COUNT(*)
FROM sync_mutations
WHERE project = ?
  AND entity = 'relation'
  AND op = 'upsert'
  AND target_key = 'cloud'
  AND acked_at IS NULL
""", (project,)).fetchone()[0]

print("Pendientes restantes relation/upsert:", remaining)
print("Listo. Ahora corre sync.")

con.close()
