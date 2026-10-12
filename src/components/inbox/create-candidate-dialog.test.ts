import { describe, expect, it } from "vitest";
import { splitContactName } from "./create-candidate-dialog";

// The HRM requires a first/last split while wacrm contacts carry one
// free-text name — the convention is "last word = surname". The agent
// can still correct both fields in the dialog; this only seeds them.
describe("splitContactName", () => {
  it("returns empty parts for missing or blank names", () => {
    expect(splitContactName(undefined)).toEqual({ first: "", last: "" });
    expect(splitContactName("")).toEqual({ first: "", last: "" });
    expect(splitContactName("   ")).toEqual({ first: "", last: "" });
  });

  it("puts a single word into the first name", () => {
    expect(splitContactName("Ayşe")).toEqual({ first: "Ayşe", last: "" });
  });

  it("splits the last word off as the surname", () => {
    expect(splitContactName("Ayşe Yılmaz")).toEqual({
      first: "Ayşe",
      last: "Yılmaz",
    });
    expect(splitContactName("Mehmet Ali Demir")).toEqual({
      first: "Mehmet Ali",
      last: "Demir",
    });
  });

  it("ignores repeated and surrounding whitespace", () => {
    expect(splitContactName("  Ayşe   Yılmaz ")).toEqual({
      first: "Ayşe",
      last: "Yılmaz",
    });
  });
});
