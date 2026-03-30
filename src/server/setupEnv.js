/**
 * Chay truoc tat ca de dam bao .env duoc load dung cach.
 * Dat trong src/server/ de cung __dirname voi serverMain.
 */
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../..");

const { config } = await import("dotenv");
config({ path: path.join(PROJECT_ROOT, ".env") });
