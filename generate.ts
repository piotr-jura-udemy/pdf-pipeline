import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import PDFDocument from "pdfkit";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.join(__dirname, "invoices.csv");
const OUTPUT_DIR = path.join(__dirname, "output");

export type Invoice = {
  invoice_number: string;
  date: string;
  vendor: string;
  customer: string;
  items: string;
  subtotal: string;
  tax: string;
  discount: string;
  total: string;
};

export type Item = {
  name: string;
  qty: number;
  unitPrice: number;
};

export function parseCSV(csvText: string): Invoice[] {
  const [headerLine, ...dataLines] = csvText.trim().split("\n");
  const headers = headerLine.split(",");
  return dataLines
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const values = line.split(",");
      const row: Record<string, string> = {};
      headers.forEach((h, i) => (row[h] = values[i]));
      return row as unknown as Invoice;
    });
}

export function parseItems(itemsStr: string): Item[] {
  return itemsStr.split(" | ").map((entry) => {
    const match = entry.match(/^(.+)\s+x\s*(\d+)\s*@\s*([\d.]+)$/);
    if (!match) return { name: entry, qty: 1, unitPrice: 0 };
    return {
      name: match[1].trim(),
      qty: parseInt(match[2], 10),
      unitPrice: parseFloat(match[3]),
    };
  });
}

export function formatCurrency(num: number | string): string {
  return `$${parseFloat(String(num)).toFixed(2)}`;
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function drawInvoice(invoice: Invoice, outputPath: string): Promise<void> {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  const items = parseItems(invoice.items);
  const pageWidth = doc.page.width - 100;

  doc.fontSize(24).font("Helvetica-Bold").text("INVOICE", { align: "right" });
  doc.moveDown(0.3);
  doc.fontSize(10).font("Helvetica").text(invoice.invoice_number, { align: "right" });
  doc.text(`Date: ${formatDate(invoice.date)}`, { align: "right" });

  doc.moveDown(1.5);

  const infoY = doc.y;
  doc.fontSize(10).font("Helvetica-Bold").text("From:", 50, infoY);
  doc.font("Helvetica").text(invoice.vendor, 50, doc.y);
  doc.fontSize(10).font("Helvetica-Bold").text("Bill To:", 300, infoY);
  doc.font("Helvetica").text(invoice.customer, 300, doc.y);

  doc.y = Math.max(doc.y, infoY + 50);
  doc.moveDown(1.5);

  const tableTop = doc.y;
  const col = { item: 50, qty: 300, price: 380, amount: 460 };

  doc.rect(50, tableTop - 5, pageWidth, 20).fill("#4a5568");
  doc
    .fontSize(9)
    .font("Helvetica-Bold")
    .fillColor("#ffffff")
    .text("Item", col.item, tableTop, { width: 240 })
    .text("Qty", col.qty, tableTop, { width: 60, align: "right" })
    .text("Unit Price", col.price, tableTop, { width: 70, align: "right" })
    .text("Amount", col.amount, tableTop, { width: 85, align: "right" });

  doc.fillColor("#000000");
  let y = tableTop + 22;

  items.forEach((item, i) => {
    if (i % 2 === 0) {
      doc.rect(50, y - 5, pageWidth, 20).fill("#f7fafc");
      doc.fillColor("#000000");
    }
    const lineTotal = item.qty * item.unitPrice;
    doc
      .fontSize(9)
      .font("Helvetica")
      .text(item.name, col.item, y, { width: 240 })
      .text(String(item.qty), col.qty, y, { width: 60, align: "right" })
      .text(formatCurrency(item.unitPrice), col.price, y, { width: 70, align: "right" })
      .text(formatCurrency(lineTotal), col.amount, y, { width: 85, align: "right" });
    y += 22;
  });

  y += 15;
  const labelX = 380;
  const valueX = 460;
  const valueW = 85;

  doc
    .fontSize(10)
    .font("Helvetica")
    .text("Subtotal:", labelX, y, { width: 70, align: "right" })
    .text(formatCurrency(invoice.subtotal), valueX, y, { width: valueW, align: "right" });
  y += 18;

  if (parseFloat(invoice.tax) > 0) {
    doc
      .text("Tax:", labelX, y, { width: 70, align: "right" })
      .text(formatCurrency(invoice.tax), valueX, y, { width: valueW, align: "right" });
    y += 18;
  }

  if (parseFloat(invoice.discount) > 0) {
    doc
      .text("Discount:", labelX, y, { width: 70, align: "right" })
      .text(`-${formatCurrency(invoice.discount)}`, valueX, y, { width: valueW, align: "right" });
    y += 18;
  }

  doc.moveTo(labelX, y).lineTo(labelX + valueW + valueX - labelX, y).stroke();
  y += 8;

  doc
    .fontSize(12)
    .font("Helvetica-Bold")
    .text("Total:", labelX, y, { width: 70, align: "right" })
    .text(formatCurrency(invoice.total), valueX, y, { width: valueW, align: "right" });

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });
}

async function main(): Promise<void> {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const invoices = parseCSV(fs.readFileSync(CSV_PATH, "utf-8"));
  console.log(`Parsed ${invoices.length} invoices from CSV`);

  for (const inv of invoices) {
    const filename = `${inv.invoice_number}.pdf`;
    const outputPath = path.join(OUTPUT_DIR, filename);
    await drawInvoice(inv, outputPath);
    console.log(`  Created ${filename}`);
  }

  console.log(`\nDone! ${invoices.length} PDFs saved to ./output/`);
}

// Only run main when executed directly; stays dormant when imported (e.g. by tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
}
