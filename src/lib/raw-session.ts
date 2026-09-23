import { cache } from 'react';
import { auth } from '@/lib/auth';
/** The real Auth.js session, never an effective demo identity. */
export const getRequestSession = cache(async () => auth());
