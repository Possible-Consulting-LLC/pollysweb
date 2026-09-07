import { format } from "date-fns";
import { logoutAction, updateSettingsAction } from "@/app/actions/auth";
import { AppHeader } from "@/components/layout/nav";
import { PasswordForm } from "@/components/settings/password-form";
import { ThemeSelect } from "@/components/settings/theme-select";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { normalizeTheme } from "@/lib/constants";
import { getUserDefaults } from "@/lib/spiders";
import { requireUser } from "@/lib/session";

const DATE_FORMAT_OPTIONS = [
  "MMM d, yyyy",
  "d MMM yyyy",
  "yyyy-MM-dd",
] as const;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ saved?: string }>;
}) {
  const user = await requireUser();
  const defaults = await getUserDefaults(user.id!);
  const params = searchParams ? await searchParams : {};
  const saved = params.saved === "1";
  const theme = normalizeTheme(defaults.theme);
  const today = new Date();

  return (
    <div className="space-y-6">
      <AppHeader title="Settings" subtitle="Tune your little corner." />

      <Card>
        <SectionHeader title="Profile" />
        {saved ? (
          <p
            className="mb-4 rounded-2xl bg-emerald-500/15 px-3 py-2 text-sm text-[var(--midnight)]"
            role="status"
          >
            Settings saved.
          </p>
        ) : null}
        <form action={updateSettingsAction} className="space-y-4">
          <Field label="Display name" htmlFor="name">
            <Input id="name" name="name" defaultValue={defaults.name ?? ""} />
          </Field>
          <Field label="Email">
            <Input value={defaults.email} disabled readOnly />
          </Field>

          <SectionHeader title="Care reminder defaults" />
          <div className="grid grid-cols-3 gap-2">
            <Field label="Feeding (days)" htmlFor="feedDefaultDays">
              <Input
                id="feedDefaultDays"
                name="feedDefaultDays"
                type="number"
                min={1}
                defaultValue={defaults.feedDefaultDays}
              />
            </Field>
            <Field label="Misting (days)" htmlFor="mistDefaultDays">
              <Input
                id="mistDefaultDays"
                name="mistDefaultDays"
                type="number"
                min={1}
                defaultValue={defaults.mistDefaultDays}
              />
            </Field>
            <Field label="Cleaning (days)" htmlFor="cleanDefaultDays">
              <Input
                id="cleanDefaultDays"
                name="cleanDefaultDays"
                type="number"
                min={1}
                defaultValue={defaults.cleanDefaultDays}
              />
            </Field>
          </div>

          <Field label="Date format" htmlFor="dateFormat">
            <Select
              id="dateFormat"
              name="dateFormat"
              defaultValue={defaults.dateFormat}
            >
              {DATE_FORMAT_OPTIONS.map((pattern) => (
                <option key={pattern} value={pattern}>
                  {format(today, pattern)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Measurement preference" htmlFor="measurement">
            <Select
              id="measurement"
              name="measurement"
              defaultValue={defaults.measurement}
            >
              <option value="imperial">Imperial</option>
              <option value="metric">Metric</option>
            </Select>
          </Field>
          <Field label="Theme" htmlFor="theme">
            <ThemeSelect key={theme} theme={theme} />
          </Field>

          <Button type="submit" className="w-full">
            Save settings
          </Button>
        </form>
      </Card>

      <Card>
        <SectionHeader
          title="Password"
          subtitle="Choose a new password for this account."
        />
        <PasswordForm />
      </Card>

      {false && (
        <Card className="space-y-3">
          <SectionHeader
            title="Data export"
            subtitle="Export is coming soon. Your data lives in a relational model ready for portable backups."
          />
          <Button variant="soft" disabled className="w-full">
            Export data (soon)
          </Button>
        </Card>
      )}

      <form action={logoutAction}>
        <Button type="submit" variant="danger" className="w-full">
          Sign out
        </Button>
      </form>
    </div>
  );
}
