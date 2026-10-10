import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { GameState, Quest } from '@moss/shared'

const MIGRATIONS: string[] = [
  // 1: initial schema
  `
  CREATE TABLE kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE focus_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at INTEGER NOT NULL,
    completed_at INTEGER NOT NULL,
    preset_id TEXT NOT NULL,
    xp INTEGER NOT NULL
  );
  CREATE TABLE quests (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    completion_type TEXT NOT NULL,
    source TEXT NOT NULL,
    status TEXT NOT NULL,
    xp INTEGER,
    manual INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  `,
]

export class MossDb {
  private db: DatabaseSync

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true })
    this.db = new DatabaseSync(join(dataDir, 'moss.db'))
    this.db.exec('PRAGMA journal_mode = WAL;')
    this.migrate()
  }

  private migrate(): void {
    this.db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)')
    const row = this.db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number | null }
    const current = row.v ?? 0
    MIGRATIONS.forEach((sql, i) => {
      const version = i + 1
      if (version <= current) return
      this.db.exec('BEGIN')
      try {
        this.db.exec(sql)
        this.db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(version, Date.now())
        this.db.exec('COMMIT')
      } catch (err) {
        this.db.exec('ROLLBACK')
        throw err
      }
    })
  }

  loadState(): GameState | null {
    const row = this.db.prepare("SELECT value FROM kv WHERE key = 'game_state'").get() as { value: string } | undefined
    return row ? (JSON.parse(row.value) as GameState) : null
  }

  saveState(state: GameState): void {
    this.db
      .prepare(
        "INSERT INTO kv (key, value, updated_at) VALUES ('game_state', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
      )
      .run(JSON.stringify(state), Date.now())
  }

  recordFocusSession(startedAt: number, completedAt: number, presetId: string, xp: number): void {
    this.db
      .prepare('INSERT INTO focus_sessions (started_at, completed_at, preset_id, xp) VALUES (?, ?, ?, ?)')
      .run(startedAt, completedAt, presetId, xp)
  }

  upsertQuest(quest: Quest, now: number, xp: number | null = null, manual: boolean | null = null): void {
    this.db
      .prepare(
        `INSERT INTO quests (id, template_id, title, description, completion_type, source, status, xp, manual, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET title = excluded.title, description = excluded.description, source = excluded.source,
           status = excluded.status, xp = COALESCE(excluded.xp, quests.xp), manual = COALESCE(excluded.manual, quests.manual),
           updated_at = excluded.updated_at`,
      )
      .run(
        quest.id,
        quest.templateId,
        quest.title,
        quest.description,
        quest.completionType,
        quest.source,
        quest.status,
        xp,
        manual === null ? null : manual ? 1 : 0,
        quest.createdAt,
        now,
      )
  }
}
