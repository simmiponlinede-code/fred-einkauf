import { describe, expect, it } from "vitest";
import { matches } from "./matching";
import {
  analyze,
  historyLow,
  householdNormal,
  normalByStore,
  planShopping,
  type Observation,
  type Offer,
  type Pick,
} from "./pricing";

const obs = (p: Partial<Observation>): Observation => ({
  store_id: "kaufland",
  label: "x",
  price_cents: 100,
  unit: "kg",
  unit_price_cents: 100,
  observed_on: "2026-11-01",
  source: "bon",
  ...p,
});

const offer = (p: Partial<Offer>): Offer => ({
  id: "o1",
  store_id: "aldi-nord",
  title: "Magerquark",
  price_cents: 99,
  unit: "kg",
  unit_price_cents: 198,
  valid_from: "2026-11-09",
  valid_to: "2026-11-14",
  ...p,
});

describe("Normalpreise", () => {
  it("nimmt je Markt den neuesten Preis, Bon vor Shop", () => {
    const m = normalByStore([
      obs({ unit_price_cents: 250, observed_on: "2026-10-02" }),
      obs({ unit_price_cents: 238, observed_on: "2026-11-09" }),
      obs({ unit_price_cents: 230, observed_on: "2026-11-09", source: "shop" }),
    ]);
    expect(m.get("kaufland")!.unit_price_cents).toBe(238);
  });

  it("Median über die Märkte", () => {
    expect(
      householdNormal([
        obs({ store_id: "kaufland", unit_price_cents: 238 }),
        obs({ store_id: "aldi-nord", unit_price_cents: 238 }),
        obs({ store_id: "lidl", unit_price_cents: 300 }),
      ]),
    ).toBe(238);
    expect(householdNormal([obs({ unit_price_cents: 200 }), obs({ store_id: "lidl", unit_price_cents: 300 })])).toBe(250);
  });
});

describe("analyze", () => {
  const normals = [obs({ store_id: "kaufland", unit_price_cents: 238 }), obs({ store_id: "aldi-nord", unit_price_cents: 238 })];

  it("erkennt ein Schnäppchen ab 5 %", () => {
    const a = analyze("kg", [offer({})], normals, "2026-11-10");
    expect(a.best?.kind).toBe("angebot");
    expect(a.saving).toBeCloseTo(1 - 198 / 238);
    expect(a.isDeal).toBe(true);
  });

  it("ignoriert abgelaufene Angebote und fremde Einheiten", () => {
    const a = analyze("kg", [offer({ valid_to: "2026-11-08", valid_from: "2026-11-02" }), offer({ unit: "l" })], normals, "2026-11-10");
    expect(a.offers).toHaveLength(0);
    expect(a.best?.kind).toBe("normal");
  });

  it("warnt, wenn der Normalpreis woanders günstiger ist", () => {
    const a = analyze("kg", [offer({ unit_price_cents: 260 })], [obs({ unit_price_cents: 238 })], "2026-11-10");
    expect(a.best?.kind).toBe("normal");
    expect(a.cheaperNormalElsewhere?.store_id).toBe("kaufland");
    expect(a.isDeal).toBe(false);
  });

  it("nutzt den Card-Preis und rechnet den Grundpreis mit", () => {
    const a = analyze("l", [offer({ store_id: "kaufland", unit: "l", price_cents: 79, card_price_cents: 69, unit_price_cents: 158 })], [], "2026-11-10");
    expect(a.best).toMatchObject({ price_cents: 69, unit_price_cents: 138, needsCard: true });
    expect(analyze("l", [offer({ unit: "l", card_price_cents: 69 })], [], "2026-11-10", null, false).best?.price_cents).toBe(99);
  });

  it("Tiefstpreis-Abzeichen", () => {
    const low = historyLow([offer({ valid_from: "2026-10-01", unit_price_cents: 210 })], normals, "kg", "2026-11-09");
    expect(low).toBe(210);
    expect(analyze("kg", [offer({})], normals, "2026-11-10", low).isHistoryLow).toBe(true);
  });
});

describe("Einkaufsplan", () => {
  const p = (store_id: Pick["store_id"], price_cents: number): Pick => ({
    kind: "normal",
    store_id,
    label: "",
    price_cents,
    unit_price_cents: price_cents,
    unit: "kg",
  });

  it("bleibt bei einem Markt, wenn der zweite zu wenig spart", () => {
    const r = planShopping(
      [
        { productId: "a", candidates: [p("kaufland", 100), p("aldi-nord", 90)] },
        { productId: "b", candidates: [p("kaufland", 200), p("aldi-nord", 210)] },
      ],
      ["kaufland", "aldi-nord"],
      300,
    );
    expect(r.recommended?.stores).toHaveLength(1);
  });

  it("schlägt zwei Märkte vor, wenn es sich lohnt", () => {
    const r = planShopping(
      [
        { productId: "a", candidates: [p("kaufland", 900), p("aldi-nord", 400)] },
        { productId: "b", candidates: [p("kaufland", 200), p("aldi-nord", 600)] },
      ],
      ["kaufland", "aldi-nord", "lidl"],
      300,
    );
    expect(r.recommended?.stores.sort()).toEqual(["aldi-nord", "kaufland"]);
    expect(r.recommended?.totalCents).toBe(600);
  });
});

describe("Zuordnung", () => {
  const magerquark = { id: "magerquark", keywords_include: ["quark", "mager|speisequark"], keywords_exclude: ["kräuter", "frucht"] };
  it.each([
    ["Milsani Magerquark 500 g", true],
    ["K.Speisequark", true],
    ["K.Kräuterquark", false],
    ["Fruchtquark Mager", false],
  ])("%s", (t, ok) => expect(matches(t, magerquark)).toBe(ok));
});
