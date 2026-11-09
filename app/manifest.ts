import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fred · Wocheneinkauf",
    short_name: "Fred",
    description: "Eure Einkaufsliste mit Angeboten und Normalpreisen",
    lang: "de",
    start_url: "/",
    display: "standalone",
    background_color: "#fff1f7",
    theme_color: "#ec4899",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
