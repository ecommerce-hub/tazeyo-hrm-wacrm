import { describe, expect, it } from "vitest";
import { cvFilename } from "./cv";

// The HRM only accepts PDF/Word/image CVs and renames the file itself,
// so what matters here is that an accepted extension survives (from the
// chat filename or, failing that, the MIME type) and everything else is
// rejected with null before any bytes move.
describe("cvFilename", () => {
  it("keeps a chat filename with an accepted extension", () => {
    expect(cvFilename("ozgecmis.pdf", "application/pdf")).toBe("ozgecmis.pdf");
    expect(cvFilename("CV Son.DOCX", null)).toBe("CV Son.DOCX");
  });

  it("falls back to the MIME type when the name has no usable extension", () => {
    expect(cvFilename("özgeçmişim", "application/pdf")).toBe("özgeçmişim.pdf");
    expect(cvFilename(null, "image/jpeg")).toBe("cv.jpg");
    expect(
      cvFilename(
        "cv",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe("cv.docx");
  });

  it("rejects types the HRM does not accept", () => {
    expect(cvFilename("tablo.xlsx", null)).toBeNull();
    expect(cvFilename("ses.ogg", "audio/ogg")).toBeNull();
    expect(cvFilename(null, null)).toBeNull();
  });

  it("strips path segments from untrusted names", () => {
    expect(cvFilename("../../etc/cv.pdf", "application/pdf")).toBe("cv.pdf");
  });
});
