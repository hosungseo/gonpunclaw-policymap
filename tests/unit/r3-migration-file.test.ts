import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(path.resolve(__dirname, "../../supabase/migrations/0008_r3_collaboration.sql"), "utf8");

describe("0008_r3_collaboration migration", () => {
  it("adds review and directory columns to maps", () => {
    for (const col of ["review_required", "review_token_hash", "approved_version_id", "directory_hidden", "directory_hidden_at", "directory_hidden_reason"]) {
      expect(sql).toContain(col);
    }
  });
  it("creates map_reviews with a status check and RLS", () => {
    expect(sql).toMatch(/create table if not exists public\.map_reviews/);
    expect(sql).toMatch(/status in \('pending', 'approved', 'rejected'\)/);
    expect(sql).toMatch(/alter table public\.map_reviews enable row level security/);
  });
  it("creates the public_directory_maps view filtered to public and not hidden", () => {
    expect(sql).toMatch(/create or replace view public\.public_directory_maps/);
    expect(sql).toMatch(/visibility = 'public'/);
    expect(sql).toMatch(/directory_hidden = false/);
    expect(sql).toContain("marker_count");
  });
  it("hardens the view and token hash columns against PostgREST exposure", () => {
    expect(sql).toContain("security_invoker = true");
    expect(sql).toContain("revoke select (admin_token_hash, review_token_hash)");
    expect(sql).toContain("maps_approved_version_idx");
    expect(sql).toContain("map_reviews_version_idx");
  });
});
