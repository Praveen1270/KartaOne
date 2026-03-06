/**
 * SQLite database schema definitions.
 * Tables: users, conversations, memories, orders.
 */

export const CREATE_TABLES = `
-- User profiles (name, phone, address, preferences)
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL DEFAULT '',
  addr_line1  TEXT NOT NULL DEFAULT '',
  addr_line2  TEXT NOT NULL DEFAULT '',
  city        TEXT NOT NULL DEFAULT '',
  pincode     TEXT NOT NULL DEFAULT '',
  addr_phone  TEXT NOT NULL DEFAULT '',
  language    TEXT NOT NULL DEFAULT 'en',
  preferences TEXT NOT NULL DEFAULT '{}',
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Conversation history per user (last 50 messages kept)
CREATE TABLE IF NOT EXISTS conversations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL,
  role        TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

-- Key-value memories (facts the agent learns about the user)
CREATE TABLE IF NOT EXISTS memories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL,
  key         TEXT NOT NULL,
  value       TEXT NOT NULL,
  updated_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(user_id, key),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

-- Order history
CREATE TABLE IF NOT EXISTS orders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL,
  platform    TEXT NOT NULL DEFAULT '',
  order_id    TEXT NOT NULL DEFAULT '',
  items       TEXT NOT NULL DEFAULT '[]',
  total       REAL NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'placed',
  raw_data    TEXT NOT NULL DEFAULT '{}',
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

-- Active reminders
CREATE TABLE IF NOT EXISTS reminders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL,
  message     TEXT NOT NULL,
  fire_at     INTEGER NOT NULL,
  cron        TEXT,
  fired       INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_user      ON memories(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user        ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reminders_fire     ON reminders(fire_at, fired);
`;
