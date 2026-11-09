import type { Metadata, Viewport } from "next";
import ServiceWorker from "@/components/ServiceWorker";
// Schriften als npm-Pakete: werden mit der App ausgeliefert, kein Abruf bei Google
import "@fontsource/nunito/400.css";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "@fontsource/poppins/800.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fred · Wocheneinkauf",
  description: "Eure Einkaufsliste mit Angeboten und Normalpreisen aus Göttingen",
  applicationName: "Fred",
  appleWebApp: { capable: true, title: "Fred", statusBarStyle: "default" },
  icons: { apple: "/apple-touch-icon.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#ec4899",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
