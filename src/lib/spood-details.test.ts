import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { JUMPING_SPIDER_SPECIES, nextLifeStage, resolveMoltStages, lifeStageChoice, updateSpeciesNames } from "./spood-details";
import { nextInstar } from "./care";

describe("linked species names", () => {
  it("includes the requested common and scientific name suggestions", () => {
    const requested = [
      ["Regal Jumping Spider", "Phidippus regius"],
      ["Bold Jumping Spider", "Phidippus audax"],
      ["Heavy Jumping Spider", "Hyllus diardi"],
      ["Canopy Jumping Spider", "Phidippus otiosus"],
      ["Tan Jumping Spider", "Platycryptus undatus"],
      ["Adanson's House Jumper", "Hasarius adansoni"],
      ["Paradise Jumping Spiders", "Habronattus spp."],
      ["Peacock Jumping Spiders", "Maratus spp."],
      ["Zebra Jumping Spider", "Salticus scenicus"],
      ["Elegant Golden Jumping Spider", "Chrysilla lauta"],
    ];
    for (const [commonName, species] of requested) {
      assert.ok(JUMPING_SPIDER_SPECIES.some((entry) => entry.commonName === commonName && entry.species === species));
    }
  });
  it("fills the scientific name when choosing a common name", () => {
    assert.deepEqual(updateSpeciesNames({ commonName: "", species: "" }, "commonName", "Regal Jumping Spider"), {
      commonName: "Regal Jumping Spider", species: "Phidippus regius",
    });
  });
  it("fills the common name when choosing an exact scientific name suggestion", () => {
    assert.deepEqual(updateSpeciesNames({ commonName: "", species: "" }, "species", "Phidippus audax"), {
      commonName: "Bold Jumping Spider", species: "Phidippus audax",
    });
  });
  it("keeps a custom suffix while typing after a suggested name", () => {
    assert.deepEqual(updateSpeciesNames({ commonName: "Regal Jumping Spider", species: "Phidippus regius" }, "species", "Phidippus regius (Florida)"), {
      commonName: "", species: "Phidippus regius (Florida)",
    });
  });
  it("clears the old linked counterpart when replacing a known name with custom text", () => {
    assert.deepEqual(updateSpeciesNames({ commonName: "Regal Jumping Spider", species: "Phidippus regius" }, "species", "Unknown species"), {
      commonName: "", species: "Unknown species",
    });
  });
  it("preserves independently entered custom names", () => {
    assert.deepEqual(updateSpeciesNames({ commonName: "Mantis", species: "Unidentified" }, "species", "Custom species"), {
      commonName: "Mantis", species: "Custom species",
    });
  });
});

describe("life stage selection", () => {
  it("recognizes older capitalization without forcing it into custom entry", () => {
    assert.equal(lifeStageChoice("I6"), "i6");
    assert.equal(lifeStageChoice("adult"), "Adult");
    assert.equal(lifeStageChoice("unknown"), "");
  });
  it("keeps values beyond the preset range editable as custom", () => {
    assert.equal(lifeStageChoice("i13"), "custom");
    assert.equal(lifeStageChoice("juvenile"), "custom");
  });
  it("retains the existing molt progression for numbered and named stages", () => {
    assert.equal(nextInstar("i12"), "i13");
    assert.equal(nextInstar("Sling"), "Sling");
    assert.equal(nextInstar("Sub-adult"), "Sub-adult");
    assert.equal(nextInstar("Adult"), "Adult");
  });
});

describe("molt life stage defaults", () => {
  it("suggests the next option, including transitions to named stages", () => {
    assert.equal(nextLifeStage("I6"), "i7");
    assert.equal(nextLifeStage("Sling"), "i1");
    assert.equal(nextLifeStage("i12"), "Sub-adult");
    assert.equal(nextLifeStage("Sub-adult"), "Adult");
  });
  it("does not invent a next stage for unknown, adult, or custom stages", () => {
    for (const stage of ["", "Unknown", "Adult", "juvenile", "i13"]) {
      assert.equal(nextLifeStage(stage), "");
    }
  });
  it("prefills omitted stages from the current stage but preserves explicit corrections", () => {
    assert.deepEqual(resolveMoltStages(null, null, "i6"), { previousInstar: "i6", newInstar: "i7" });
    assert.deepEqual(resolveMoltStages("i3", "i5", "i6"), { previousInstar: "i3", newInstar: "i5" });
    assert.deepEqual(resolveMoltStages("", "", "i6"), { previousInstar: null, newInstar: null });
    assert.deepEqual(resolveMoltStages("i3", "", "i6"), { previousInstar: "i3", newInstar: null });
  });
});
