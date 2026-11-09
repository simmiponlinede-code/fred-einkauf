// Lidl, Netto und Edeka: noch nicht gebaut (siehe Marktcheck im Architektur-Dokument).
// - Lidl: Angebote nach Aktionstagen auf lidl.de; Such- und Parameter-URLs sind laut robots.txt gesperrt.
// - Netto: Filialangebote erst nach Filialwahl (Göttingen: Güterbahnhofstr. 4, Königsallee 243);
//   Prospekt-PDFs sind laut robots.txt gesperrt.
// - Edeka: Angebote je Markt nach Marktwahl (Edeka Minden-Hannover, 6 Märkte in Göttingen).
// Bis dahin liefert die Claude-Aufgabe am Montag diese Märkte, oder ihr erfasst Angebote von Hand.
import type { Adapter } from "../types";

const pending = (store: Adapter["store"]): Adapter => ({
  store,
  ready: false,
  async fetchOffers() {
    return [];
  },
});

export const lidl = pending("lidl");
export const netto = pending("netto");
export const edeka = pending("edeka");
