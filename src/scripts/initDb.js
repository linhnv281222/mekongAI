import "dotenv/config";
import pg from "pg";

const { Client } = pg;

async function init() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("[InitDB] Thiếu DATABASE_URL — kiểm tra .env");
    process.exit(1);
  }

  // Tách connection string để kết nối database mặc định (postgres) trước
  const match = dbUrl.match(
    /^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/
  );
  if (!match) {
    console.error("[InitDB] DATABASE_URL sai format");
    process.exit(1);
  }
  const [, user, pass, host, port, dbname] = match;

  // 1. Thử kết nối trực tiếp vào database target (bỏ qua bước tạo DB)

  const admin = new Client({ connectionString: dbUrl });
  try {
    await admin.connect();
  } catch {
    // Nếu kết nối thất bại, thử kết nối vào database mặc định "postgres"

    const fallbackUrl = `postgresql://${user}:${pass}@${host}:${port}/postgres`;
    const fallback = new Client({ connectionString: fallbackUrl });
    await fallback.connect();
    const { rows } = await fallback.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbname]
    );
    if (rows.length === 0) {
      await fallback.query(`CREATE DATABASE "${dbname}"`);
    } else {
    }
    await fallback.end();
    // Thử kết nối lại vào database target sau khi tạo xong
    await admin.connect();
  }

  // 2. Chạy init cho từng module

  const { initDB } = await import("../data/drawRepository.js");
  await initDB();

  const { initJobDB } = await import("../data/jobStore.js");
  await initJobDB();

  process.exit(0);
}

init().catch((err) => {
  console.error("[InitDB] Lỗi:", err.message);
  process.exit(1);
});
