"use client";

import { createContext, useContext, type ReactNode } from "react";

const WorkspaceContext = createContext({
  owner: false,
  currency: "USD",
  precision: 2,
});

export function WorkspaceProvider({
  children,
  ...value
}: {
  children: ReactNode;
  owner: boolean;
  currency: string;
  precision: number;
}) {
  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export const useWorkspace = () => useContext(WorkspaceContext);
