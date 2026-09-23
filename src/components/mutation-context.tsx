'use client';
import { createContext, useContext, type ReactNode } from 'react';
const Context = createContext('');
export function MutationContextProvider({ value, children }: {
    value: string;
    children: ReactNode;
}) { return <Context.Provider value={value}>{children}</Context.Provider>; }
export function useMutationContext() { return useContext(Context); }
export function MutationContextInput() { const value = useMutationContext(); return <input type="hidden" name="mutationContext" value={value}/>; }
