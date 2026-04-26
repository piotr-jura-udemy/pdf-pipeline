import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseMoney,
  parseDateLong,
  extractInvoiceNumber,
  extractDate,
  extractVendorAndCustomer,
  extractTotals,
  extractItems,
  extractInvoice,
  readPdfText,
} from "./parse.ts";
import { drawInvoice, parseCSV } from "./generate.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SAMPLE_TEXT = `INVOICE
INV-001
Date: January 3, 2025
From:
Northwind Trading
Bill To:
Sarah Chen
Item Qty Unit Price Amount
Office Chair 2 $150.00 $300.00
Desk Lamp 3 $45.00 $135.00
Subtotal: $435.00
Tax: $34.80
Total: $469.80

-- 1 of 1 --
`;

const SAMPLE_WITH_DISCOUNT = `INVOICE
INV-006
Date: January 15, 2025
From:
Hooli Services
Bill To:
Erlich Bachman
Item Qty Unit Price Amount
Cloud Storage 1 $299.00 $299.00
Subtotal: $299.00
Tax: $23.92
Discount: -$29.90
Total: $293.02

-- 1 of 1 --
`;

describe("parseMoney", () => {
  it("parses plain dollar amounts", () => {
    expect(parseMoney("$10.00")).toBe(10);
    expect(parseMoney("$469.80")).toBe(469.8);
  });

  it("strips thousands separators", () => {
    expect(parseMoney("$1,234.50")).toBe(1234.5);
  });

  it("preserves leading minus sign", () => {
    expect(parseMoney("-$29.90")).toBe(-29.9);
  });

  it("throws on garbage input", () => {
    expect(() => parseMoney("abc")).toThrow();
  });
});

describe("parseDateLong", () => {
  it("converts long-form English dates to ISO", () => {
    expect(parseDateLong("January 3, 2025")).toBe("2025-01-03");
    expect(parseDateLong("December 31, 2025")).toBe("2025-12-31");
  });

  it("zero-pads single-digit days", () => {
    expect(parseDateLong("February 1, 2025")).toBe("2025-02-01");
  });

  it("throws on malformed input", () => {
    expect(() => parseDateLong("2025-01-03")).toThrow();
  });
});

describe("extractInvoiceNumber", () => {
  it("finds INV-NNN on its own line", () => {
    expect(extractInvoiceNumber(SAMPLE_TEXT)).toBe("INV-001");
  });

  it("throws when missing", () => {
    expect(() => extractInvoiceNumber("no invoice here")).toThrow();
  });
});

describe("extractDate", () => {
  it("extracts and normalizes the date", () => {
    expect(extractDate(SAMPLE_TEXT)).toBe("2025-01-03");
  });
});

describe("extractVendorAndCustomer", () => {
  it("handles drawn-order interleave (From/Vendor/BillTo/Customer)", () => {
    expect(extractVendorAndCustomer(SAMPLE_TEXT)).toEqual({
      vendor: "Northwind Trading",
      customer: "Sarah Chen",
    });
  });
});

describe("extractTotals", () => {
  it("handles tax-only invoices", () => {
    expect(extractTotals(SAMPLE_TEXT)).toEqual({
      subtotal: 435,
      tax: 34.8,
      discount: 0,
      total: 469.8,
    });
  });

  it("handles invoices with both tax and discount", () => {
    expect(extractTotals(SAMPLE_WITH_DISCOUNT)).toEqual({
      subtotal: 299,
      tax: 23.92,
      discount: 29.9,
      total: 293.02,
    });
  });

  it("does not confuse Total with Subtotal", () => {
    const tricky = `Subtotal: $1000.00
Total: $1100.00`;
    expect(extractTotals(tricky)).toMatchObject({ subtotal: 1000, total: 1100 });
  });
});

describe("extractItems", () => {
  it("parses multi-row item table", () => {
    expect(extractItems(SAMPLE_TEXT)).toEqual([
      { name: "Office Chair", qty: 2, unitPrice: 150, lineTotal: 300 },
      { name: "Desk Lamp", qty: 3, unitPrice: 45, lineTotal: 135 },
    ]);
  });

  it("parses single-item invoices", () => {
    expect(extractItems(SAMPLE_WITH_DISCOUNT)).toEqual([
      { name: "Cloud Storage", qty: 1, unitPrice: 299, lineTotal: 299 },
    ]);
  });
});

describe("extractInvoice", () => {
  it("composes all fields into a ParsedInvoice", () => {
    const inv = extractInvoice(SAMPLE_TEXT);
    expect(inv).toMatchObject({
      invoiceNumber: "INV-001",
      date: "2025-01-03",
      vendor: "Northwind Trading",
      customer: "Sarah Chen",
      subtotal: 435,
      tax: 34.8,
      discount: 0,
      total: 469.8,
    });
    expect(inv.items).toHaveLength(2);
  });
});

describe("regression: real PDF round-trip", () => {
  // Self-bootstrap the fixture so the test passes on a clean clone.
  // output/ is gitignored, and `npm start` may not have run yet.
  const pdfPath = path.join(__dirname, "output", "INV-001.pdf");

  beforeAll(async () => {
    if (fs.existsSync(pdfPath)) return;
    const csv = fs.readFileSync(path.join(__dirname, "invoices.csv"), "utf-8");
    const inv = parseCSV(csv).find((r) => r.invoice_number === "INV-001");
    if (!inv) throw new Error("INV-001 row missing from invoices.csv");
    fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
    await drawInvoice(inv, pdfPath);
  });

  it("parses output/INV-001.pdf back to the row from invoices.csv", async () => {
    const text = await readPdfText(pdfPath);
    const inv = extractInvoice(text);
    expect(inv).toMatchObject({
      invoiceNumber: "INV-001",
      date: "2025-01-03",
      vendor: "Northwind Trading",
      customer: "Sarah Chen",
      subtotal: 435,
      tax: 34.8,
      discount: 0,
      total: 469.8,
    });
    expect(inv.items).toEqual([
      { name: "Office Chair", qty: 2, unitPrice: 150, lineTotal: 300 },
      { name: "Desk Lamp", qty: 3, unitPrice: 45, lineTotal: 135 },
    ]);
  });
});
