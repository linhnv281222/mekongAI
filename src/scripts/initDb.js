import "dotenv/config";
import pg from "pg";

const { Client } = pg;

async function init() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("[InitDB] Thieu DATABASE_URL — kiem tra .env");
    process.exit(1);
  }

  // Tach connection string de ket noi database mac dinh (postgres) truoc
  const match = dbUrl.match(
    /^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/
  );
  if (!match) {
    console.error("[InitDB] DATABASE_URL sai format");
    process.exit(1);
  }
  const [, user, pass, host, port, dbname] = match;

  // 1. Thu ket noi truc tiep vao database target (bo qua buoc tao DB)
  console.log(`[InitDB] Ket noi PostgreSQL tai ${host}:${port}...`);
  const admin = new Client({ connectionString: dbUrl });
  try {
    await admin.connect();
  } catch {
    // Neu ket noi that bai, thu ket noi vao database mac dinh "postgres"
    console.log("[InitDB] Khong ket noi duoc DB chinh — thu postgres...");
    const fallbackUrl = `postgresql://${user}:${pass}@${host}:${port}/postgres`;
    const fallback = new Client({ connectionString: fallbackUrl });
    await fallback.connect();
    const { rows } = await fallback.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbname]
    );
    if (rows.length === 0) {
      console.log(`[InitDB] Tao database "${dbname}"...`);
      await fallback.query(`CREATE DATABASE "${dbname}"`);
      console.log(`[InitDB] Da tao database "${dbname}"`);
    } else {
      console.log(`[InitDB] Database "${dbname}" da ton tai`);
    }
    await fallback.end();
    // Thu ket noi lai vao database target sau khi tao xong
    await admin.connect();
  }

  // 2. Chay init cho tung module
  console.log("[InitDB] Khoi tao bang du lieu...");

  const { initDB } = await import("../data/drawRepository.js");
  await initDB();

  const { initJobDB } = await import("../data/jobStore.js");
  await initJobDB();

  console.log("[InitDB] Hoan tat!");
  process.exit(0);
}

init().catch((err) => {
  console.error("[InitDB] Loi:", err.message);
  process.exit(1);
});
