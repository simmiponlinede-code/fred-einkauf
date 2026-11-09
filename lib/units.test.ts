import { describe, expect, it } from "vitest";
import { parseAmount, parseBasePrice, toCents, unitPriceCents } from "./units";

describe("toCents", () => {
  it.each([
    ["1,19", 119],
    ["1.19**", 119],
    ["-0,20", -20],
    ["12,00 A", 1200],
    ["3", 300],
  ])("%s → %i", (s, c) => expect(toCents(s)).toBe(c));
});

describe("parseAmount", () => {
  it.each([
    ["500-g-Packung", 500, "kg"],
    ["je 0,5-l-Dose", 500, "l"],
    ["1-L-Packung", 1000, "l"],
    ["150-g-Becher", 150, "kg"],
    ["4 x 150 g", 600, "kg"],
    ["6x1,5 l", 9000, "l"],
    ["je 8 St. = 240-g-Packg.", 240, "kg"],
    ["10 St.", 10, "stk"],
    ["kg-Preis", 1000, "kg"],
    ["1-kg-Netz", 1000, "kg"],
    ["je kg", 1000, "kg"],
  ])("%s", (text, amount, unit) => {
    expect(parseAmount(text)).toEqual({ amount, unit });
  });

  it("gibt bei Mengenbereichen null zurück", () => {
    expect(parseAmount("je 310 - 445-g-Packg.")).toBeNull();
  });
});

describe("Grundpreise", () => {
  it("rechnet Cent je kg und je Stück", () => {
    expect(unitPriceCents(119, { amount: 500, unit: "kg" })).toBe(238);
    expect(unitPriceCents(49, { amount: 1500, unit: "l" })).toBe(33);
    expect(unitPriceCents(299, { amount: 10, unit: "stk" })).toBe(30);
  });

  it.each([
    ["kg = 1.19", "kg", 119],
    ["(1 l = 1.58)", "l", 158],
    ["Liter = 0.88", "l", 88],
    ["(1 kg = 4.03 - 5.78)", "kg", 403],
  ])("liest %s", (text, unit, cents) => {
    expect(parseBasePrice(text)).toMatchObject({ unit, cents });
  });
});
