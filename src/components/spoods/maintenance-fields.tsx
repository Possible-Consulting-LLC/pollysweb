import { DateTimeField } from "@/components/ui/datetime-field";
import { Field, Select, Textarea } from "@/components/ui/field";

export function MaintenanceFields({ idPrefix }: { idPrefix: string }) {
  const kindId = `${idPrefix}-kind`;
  const dateId = `${idPrefix}-date`;
  const notesId = `${idPrefix}-notes`;

  return (
    <>
      <Field label="Maintenance" htmlFor={kindId}>
        <Select id={kindId} name="kind" defaultValue="cleaning">
          <option value="cleaning">Cleaning</option>
          <option value="rehouse">Rehouse</option>
          <option value="maintenance">Maintenance</option>
        </Select>
      </Field>
      <DateTimeField id={dateId} name="date" label="When" />
      <Field label="Notes" htmlFor={notesId}>
        <Textarea id={notesId} name="notes" />
      </Field>
    </>
  );
}
