import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PDFParse } from "pdf-parse";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "output");
const DB_PATH = path.join(__dirname, "invoices.db");

export type ParsedItem = {
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
};

export type ParsedInvoice = {
  invoiceNumber: string;
  date: string;
  vendor: string;
  customer: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  items: ParsedItem[];
};

export function parseMoney(s: string): number {
  const cleaned = s.replace(/[\s$,]/g, "");
  const n = parseFloat(cleaned);
  if (Number.isNaN(n)) throw new Error(`Cannot parse money: ${JSON.stringify(s)}`);
  return n;
}

const MONTHS: Record<string, string> = {
  January: "01", February: "02", March: "03", April: "04",
  May: "05", June: "06", July: "07", August: "08",
  September: "09", October: "10", November: "11", December: "12",
};

export function parseDateLong(s: string): string {
  const m = s.match(/^([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})$/);
  if (!m) throw new Error(`Cannot parse date: ${JSON.stringify(s)}`);
  const month = MONTHS[m[1]];
  if (!month) throw new Error(`Unknown month: ${m[1]}`);
  return `${m[3]}-${month}-${m[2].padStart(2, "0")}`;
}

export function extractInvoiceNumber(text: string): string {
  const m = text.match(/^INV-\d+$/m);
  if (!m) throw new Error("Could not find invoice number");
  return m[0];
}

export function extractDate(text: string): string {
  const m = text.match(/Date:\s+([A-Z][a-z]+ \d{1,2}, \d{4})/);
  if (!m) throw new Error("Could not find date line");
  return parseDateLong(m[1]);
}

export function extractVendorAndCustomer(text: string): { vendor: string; customer: string } {
  const lines = text.split("\n").map((l) => l.trim());
  const fromIdx = lines.findIndex((l) => l === "From:");
  const billIdx = lines.findIndex((l) => l === "Bill To:");
  if (fromIdx === -1 || billIdx === -1) {
    throw new Error("Could not locate From: / Bill To: markers");
  }
  return { vendor: lines[fromIdx + 1], customer: lines[billIdx + 1] };
}

// All four labels are anchored to start-of-line so "Total:" never matches inside
// "Subtotal:" and item-name prose can't collide with "Tax:"/"Discount:".
// Discount is stored as a positive deduction; the regex absorbs the leading "-".
export function extractTotals(text: string): { subtotal: number; tax: number; discount: number; total: number } {
  const sub = text.match(/(?:^|\n)Subtotal:\s*\$([\d,]+\.\d{2})/);
  const tax = text.match(/(?:^|\n)Tax:\s*\$([\d,]+\.\d{2})/);
  const dis = text.match(/(?:^|\n)Discount:\s*-?\$([\d,]+\.\d{2})/);
  const tot = text.match(/(?:^|\n)Total:\s*\$([\d,]+\.\d{2})/);
  if (!sub) throw new Error("Could not find Subtotal");
  if (!tot) throw new Error("Could not find Total");
  return {
    subtotal: parseMoney(sub[1]),
    tax: tax ? parseMoney(tax[1]) : 0,
    discount: dis ? parseMoney(dis[1]) : 0,
    total: parseMoney(tot[1]),
  };
}

const ITEM_ROW = /^(.+?)\s+(\d+)\s+\$([\d,]+\.\d{2})\s+\$([\d,]+\.\d{2})$/;

export function extractItems(text: string): ParsedItem[] {
  const lines = text.split("\n").map((l) => l.trim());
  const headerIdx = lines.findIndex((l) => l === "Item Qty Unit Price Amount");
  const subIdx = lines.findIndex((l) => l.startsWith("Subtotal:"));
  if (headerIdx === -1 || subIdx === -1 || subIdx <= headerIdx) {
    throw new Error("Could not locate items table boundaries");
  }
  const items: ParsedItem[] = [];
  for (let i = headerIdx + 1; i < subIdx; i++) {
    const line = lines[i];
    if (!line) continue;
    const m = line.match(ITEM_ROW);
    if (!m) throw new Error(`Could not parse item row: ${JSON.stringify(line)}`);
    items.push({
      name: m[1].trim(),
      qty: parseInt(m[2], 10),
      unitPrice: parseMoney(m[3]),
      lineTotal: parseMoney(m[4]),
    });
  }
  if (items.length === 0) throw new Error("No item rows found");
  return items;
}

export function extractInvoice(text: string): ParsedInvoice {
  const { vendor, customer } = extractVendorAndCustomer(text);
  const totals = extractTotals(text);
  return {
    invoiceNumber: extractInvoiceNumber(text),
    date: extractDate(text),
    vendor,
    customer,
    ...totals,
    items: extractItems(text),
  };
}

function openDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  return db;
}

function ensureSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
      invoice_number TEXT PRIMARY KEY,
      date           TEXT NOT NULL,
      vendor         TEXT NOT NULL,
      customer       TEXT NOT NULL,
      subtotal       REAL NOT NULL,
      tax            REAL NOT NULL DEFAULT 0,
      discount       REAL NOT NULL DEFAULT 0,
      total          REAL NOT NULL,
      source_pdf     TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS invoice_items (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL REFERENCES invoices(invoice_number) ON DELETE CASCADE,
      name           TEXT NOT NULL,
      qty            INTEGER NOT NULL,
      unit_price     REAL NOT NULL,
      line_total     REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_number);
  `);
}

function insertInvoice(db: Database.Database, inv: ParsedInvoice, sourcePdf: string): void {
  const insInvoice = db.prepare(`
    INSERT INTO invoices
      (invoice_number, date, vendor, customer, subtotal, tax, discount, total, source_pdf)
    VALUES
      (@invoiceNumber, @date, @vendor, @customer, @subtotal, @tax, @discount, @total, @sourcePdf)
  `);
  const insItem = db.prepare(`
    INSERT INTO invoice_items (invoice_number, name, qty, unit_price, line_total)
    VALUES (?, ?, ?, ?, ?)
  `);
  const tx = db.transaction((i: ParsedInvoice, s: string) => {
    insInvoice.run({
      invoiceNumber: i.invoiceNumber,
      date: i.date,
      vendor: i.vendor,
      customer: i.customer,
      subtotal: i.subtotal,
      tax: i.tax,
      discount: i.discount,
      total: i.total,
      sourcePdf: s,
    });
    for (const it of i.items) {
      insItem.run(i.invoiceNumber, it.name, it.qty, it.unitPrice, it.lineTotal);
    }
  });
  tx(inv, sourcePdf);
}

export async function readPdfText(filePath: string): Promise<string> {
  const buf = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  const result = await parser.getText();
  return result.text;
}

async function main(): Promise<void> {
  if (!fs.existsSync(OUTPUT_DIR)) {
    console.error("No output/ directory found. Run `npm start` first to generate PDFs.");
    process.exit(1);
  }
  const files = fs.readdirSync(OUTPUT_DIR).filter((f) => f.endsWith(".pdf")).sort();
  if (files.length === 0) {
    console.error("No PDFs in output/. Run `npm start` to generate them.");
    process.exit(1);
  }

  // PDFs are the source of truth — each run rebuilds the DB from scratch.
  // Deleting from invoices cascades to invoice_items via the FK; one statement = atomic.
  const db = openDb(DB_PATH);
  ensureSchema(db);
  db.exec("DELETE FROM invoices;");

  let parsed = 0;
  for (const file of files) {
    try {
      const text = await readPdfText(path.join(OUTPUT_DIR, file));
      const inv = extractInvoice(text);
      insertInvoice(db, inv, file);
      console.log(`  Parsed ${file}`);
      parsed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  Skipped ${file}: ${msg}`);
    }
  }

  db.close();
  console.log(`\nParsed ${parsed} of ${files.length} PDFs into invoices.db`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
}
