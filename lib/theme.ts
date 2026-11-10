// Hell, dunkel oder automatisch nach Handy-Einstellung. Wird im Gerät gemerkt.
export type ThemeChoice = "auto" | "light" | "dark";
const KEY = "fred-theme";

export function getTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "auto";
  } catch {
    return "auto";
  }
}

export function applyTheme(choice: ThemeChoice = getTheme()) {
  const dark = choice === "dark" || (choice === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#1a0c16" : "#ec4899");
}

export function setTheme(choice: ThemeChoice) {
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    /* ignorieren */
  }
  applyTheme(choice);
}

/** Läuft vor dem ersten Zeichnen, damit nachts nichts weiß aufblitzt. */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem("${KEY}");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){}`;
