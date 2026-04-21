import { describe, it, expect } from "vitest";
import { parseCSV, parseItems, formatCurrency, formatDate } from "./generate.ts";

describe("parseCSV", () => {
  it("parses header + data rows into objects keyed by header", () => {
    const csv = [
      "invoice_number,date,vendor,customer,items,subtotal,tax,discount,total",
      "INV-001,2025-01-03,Northwind,Sarah,Chair x 1 @ 10.00,10.00,0,0,10.00",
    ].join("\n");
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      invoice_number: "INV-001",
      date: "2025-01-03",
      vendor: "Northwind",
      customer: "Sarah",
      items: "Chair x 1 @ 10.00",
      subtotal: "10.00",
      tax: "0",
      discount: "0",
      total: "10.00",
    });
  });

  it("skips blank lines", () => {
    const csv = "a,b\n\n1,2\n\n3,4\n";
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ a: "1", b: "2" });
    expect(rows[1]).toMatchObject({ a: "3", b: "4" });
  });

  it("returns empty array when only header is present", () => {
    expect(parseCSV("a,b,c\n")).toEqual([]);
  });
});

describe("parseItems", () => {
  it("parses a single well-formed entry", () => {
    expect(parseItems("Office Chair x 2 @ 150.00")).toEqual([
      { name: "Office Chair", qty: 2, unitPrice: 150 },
    ]);
  });

  it("parses multiple pipe-separated entries", () => {
    expect(parseItems("Office Chair x 2 @ 150.00 | Desk Lamp x 3 @ 45.50")).toEqual([
      { name: "Office Chair", qty: 2, unitPrice: 150 },
      { name: "Desk Lamp", qty: 3, unitPrice: 45.5 },
    ]);
  });

  it("falls back to qty=1, unitPrice=0 when an entry does not match", () => {
    expect(parseItems("Mystery Item")).toEqual([
      { name: "Mystery Item", qty: 1, unitPrice: 0 },
    ]);
  });
});

describe("formatCurrency", () => {
  it("formats numbers with two decimals and a dollar sign", () => {
    expect(formatCurrency(10)).toBe("$10.00");
    expect(formatCurrency(0)).toBe("$0.00");
    expect(formatCurrency(1234.5)).toBe("$1234.50");
  });

  it("accepts numeric strings", () => {
    expect(formatCurrency("42.1")).toBe("$42.10");
  });
});

describe("formatDate", () => {
  it("formats an ISO date as en-US long form", () => {
    expect(formatDate("2025-01-03")).toBe("January 3, 2025");
    expect(formatDate("2025-12-31")).toBe("December 31, 2025");
  });
});
