export type SpeciesNames = { commonName: string; species: string };

// A starter list, not an identification guide. Both fields also accept custom text.
// Sources: https://ask.ifas.ufl.edu/publication/IN309
// https://ask.ifas.ufl.edu/publication/IN1366
// https://extension.psu.edu/bold-jumper-spider
// https://extension.psu.edu/zebra-jumper
// https://mdc.mo.gov/discover-nature/field-guide/tan-jumping-spider
// https://wsc.nmbe.ch/spec-data/36706
// https://ask.ifas.ufl.edu/publication/IN1177
// https://australian.museum/learn/animals/spiders/jumping-spiders/
export const JUMPING_SPIDER_SPECIES: readonly SpeciesNames[] = [
  { commonName: "Bold Jumping Spider", species: "Phidippus audax" },
  { commonName: "Canopy Jumping Spider", species: "Phidippus otiosus" },
  { commonName: "Dimorphic Jumping Spider", species: "Maevia inclemens" },
  { commonName: "Elegant Golden Jumping Spider", species: "Chrysilla lauta" },
  { commonName: "Heavy Jumping Spider", species: "Hyllus diardi" },
  { commonName: "Adanson's House Jumper", species: "Hasarius adansoni" },
  { commonName: "Magnolia Green Jumping Spider", species: "Lyssomanes viridis" },
  { commonName: "Paradise Jumping Spiders", species: "Habronattus spp." },
  { commonName: "Peacock Jumping Spiders", species: "Maratus spp." },
  { commonName: "Regal Jumping Spider", species: "Phidippus regius" },
  { commonName: "Tan Jumping Spider", species: "Platycryptus undatus" },
  { commonName: "Zebra Jumping Spider", species: "Salticus scenicus" },
];

const normalized = (value: string) => value.trim().toLowerCase();

export function updateSpeciesNames(
  current: SpeciesNames,
  field: keyof SpeciesNames,
  value: string,
): SpeciesNames {
  const match = JUMPING_SPIDER_SPECIES.find(
    // Only link an exact datalist selection. Partial/custom typing must remain editable.
    (entry) => entry[field] === value,
  );
  if (match) return { ...match };

  const other = field === "commonName" ? "species" : "commonName";
  const previous = JUMPING_SPIDER_SPECIES.find(
    (entry) => entry[field] === current[field],
  );
  // Clear a stale linked name, but keep a separately entered custom counterpart.
  const clearOther = previous && normalized(previous[other]) === normalized(current[other]);
  return { ...current, [field]: value, [other]: clearOther ? "" : current[other] };
}

export const LIFE_STAGES = [
  { value: "", label: "Unknown" },
  { value: "Sling", label: "Sling" },
  ...Array.from({ length: 12 }, (_, index) => ({
    value: `i${index + 1}`,
    label: `i${index + 1}`,
  })),
  { value: "Sub-adult", label: "Sub-adult" },
  { value: "Adult", label: "Adult" },
];

export function lifeStageChoice(value: string): string {
  if (normalized(value) === "unknown") return "";
  return LIFE_STAGES.find((stage) => normalized(stage.value) === normalized(value))?.value ?? "custom";
}

/** Suggest the next displayed option; unknown/custom/final stages need keeper input. */
export function nextLifeStage(current: string): string {
  const choice = lifeStageChoice(current);
  if (!choice || choice === "custom") return "";
  const index = LIFE_STAGES.findIndex(stage => stage.value === choice);
  return LIFE_STAGES[index + 1]?.value ?? "";
}

/** Missing fields get defaults; explicitly choosing Unknown must stay unknown. */
export function resolveMoltStages(previous: string | null, next: string | null, current: string | null) {
  const previousInstar = previous ?? current ?? "";
  const newInstar = next ?? nextLifeStage(previousInstar);
  return { previousInstar: previousInstar || null, newInstar: newInstar || null };
}
