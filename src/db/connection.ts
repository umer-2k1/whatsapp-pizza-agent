import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { env } from "../config/env.js";
import { CREATE_ORDERS_TABLE } from "./schema.js";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = path.resolve(env.DATABASE_PATH);
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.exec(CREATE_ORDERS_TABLE);
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
