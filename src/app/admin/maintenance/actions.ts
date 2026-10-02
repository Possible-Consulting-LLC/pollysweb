'use server';

import { revalidatePath } from 'next/cache';
import { setFeatureTelemetrySink as setSink } from '@/lib/admin/maintenance-state';

export async function setFeatureTelemetrySink(
  sinkOrForm: 'off' | 'posthog' | FormData
): Promise<void> {
  const sink = (typeof sinkOrForm === 'string'
    ? sinkOrForm
    : (sinkOrForm && typeof (sinkOrForm as { get?: unknown }).get === 'function')
      ? String((sinkOrForm as FormData).get('sink') ?? '')
      : '') as 'off' | 'posthog';
  await setSink(sink);
  revalidatePath('/admin/maintenance');
}
