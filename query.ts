import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "invoices.db");

type Row = { vendor: string; total_spend: number };

const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });

const rows = db
  .prepare<[], Row>(
    `SELECT vendor, ROUND(SUM(total), 2) AS total_spend
       FROM invoices
      GROUP BY vendor
      ORDER BY total_spend DESC
      LIMIT 5`,
  )
  .all();

console.log("Top 5 vendors by total spend:\n");
console.log("Rank  Vendor                          Total Spend");
console.log("----  ------------------------------  -----------");
rows.forEach((r, i) => {
  const rank = String(i + 1).padEnd(4);
  const vendor = r.vendor.padEnd(30);
  const spend = `$${r.total_spend.toFixed(2)}`.padStart(11);
  console.log(`${rank}  ${vendor}  ${spend}`);
});

db.close();
