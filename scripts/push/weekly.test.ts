import { describe, expect, it } from "vitest";
import { buildMessage } from "./weekly";

describe("Montags-Push", () => {
  it("schweigt ohne Schnäppchen", () => expect(buildMessage([])).toBeNull());

  it("nennt die drei besten zuerst", () => {
    const m = buildMessage([
      { name: "Milch", store: "kaufland", saving: 0.1 },
      { name: "Magerquark", store: "aldi-nord", saving: 0.17 },
      { name: "Bananen", store: "lidl", saving: 0.06 },
      { name: "Eier", store: "netto", saving: 0.3 },
    ])!;
    expect(m.title).toBe("Fred hat 4 Schnäppchen gefunden");
    expect(m.body).toBe("Eier −30 % (Netto), Magerquark −17 % (Aldi), Milch −10 % (Kaufland) und 1 mehr.");
  });

  it("Einzahl", () => expect(buildMessage([{ name: "Milch", store: "kaufland", saving: 0.1 }])!.title).toBe("Fred hat ein Schnäppchen gefunden"));
});
