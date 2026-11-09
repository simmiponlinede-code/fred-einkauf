import { describe, expect, it } from "vitest";
import { cleanSupabaseUrl } from "./util";

describe("cleanSupabaseUrl", () => {
  it.each([
    ["https://abcxyz.supabase.co", "https://abcxyz.supabase.co"],
    ["  https://abcxyz.supabase.co/  ", "https://abcxyz.supabase.co"],
    ["abcxyz.supabase.co", "https://abcxyz.supabase.co"],
    ['"https://abcxyz.supabase.co"', "https://abcxyz.supabase.co"],
    ["https://abcxyz.supabase.co/rest/v1/", "https://abcxyz.supabase.co"],
    ["https://supabase.com/dashboard/project/abcxyz/settings/api-keys", "https://abcxyz.supabase.co"],
  ])("%s", (raw, clean) => expect(cleanSupabaseUrl(raw)).toBe(clean));

  it("erklärt verwechselte Datenbank-Adresse", () => {
    expect(() => cleanSupabaseUrl("postgresql://postgres.abc:pw@aws-1.pooler.supabase.com:5432/postgres")).toThrow(/Datenbank-Adresse/);
  });

  it("meldet leeres Secret", () => {
    expect(() => cleanSupabaseUrl("  ")).toThrow(/fehlt/);
  });
});
