import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";

const databasePath = fileURLToPath(new URL("./dev.db", import.meta.url));
const db = new Database(databasePath);

const now = new Date().toISOString();
const users = [
  { id: "u_001_prisma_seed", name: "佐藤 美咲", email: "misaki.sato@kenpin.ai", role: "Admin", team: "Vision Team" },
  { id: "u_002_prisma_seed", name: "田中 翔", email: "sho.tanaka@kenpin.ai", role: "ML Engineer", team: "Vision Team" },
  { id: "u_003_prisma_seed", name: "高橋 葵", email: "aoi.takahashi@kenpin.ai", role: "Data Ops", team: "Data Platform" },
  { id: "u_004_prisma_seed", name: "山本 蓮", email: "ren.yamamoto@kenpin.ai", role: "QA Lead", team: "Factory QA" },
];

const statement = db.prepare(`
  INSERT INTO User (id, name, email, role, team, createdAt, updatedAt)
  VALUES (@id, @name, @email, @role, @team, @createdAt, @updatedAt)
  ON CONFLICT(email) DO UPDATE SET
    name = excluded.name,
    role = excluded.role,
    team = excluded.team,
    updatedAt = excluded.updatedAt
`);

for (const user of users) {
  statement.run({
    ...user,
    createdAt: now,
    updatedAt: now,
  });
}

db.close();
