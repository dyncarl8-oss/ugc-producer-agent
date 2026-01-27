
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL!;
const authToken = process.env.TURSO_AUTH_TOKEN!;

export const db = createClient({
    url,
    authToken,
});

export const initDb = async () => {
    await db.execute(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      vibe TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      master_video_url TEXT,
      status TEXT
    )
  `);

    await db.execute(`
    CREATE TABLE IF NOT EXISTS shots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id TEXT,
      type TEXT,
      script TEXT,
      image_prompt TEXT,
      video_prompt TEXT,
      status TEXT,
      video_url TEXT,
      ref_image TEXT,
      FOREIGN KEY (campaign_id) REFERENCES campaigns (id)
    )
  `);
};
