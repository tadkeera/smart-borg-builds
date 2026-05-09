import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type Role = "admin" | "receptionist";
export interface Session {
  role: Role;
  name: string;
  password?: string; // admin password kept in memory for admin-action calls
}

interface AuthCtx {
  session: Session | null;
  login: (s: Session) => void;
  logout: () => void;
  isAdmin: boolean;
}

const Ctx = createContext<AuthCtx | null>(null);
const KEY = "borg_alatiba_session";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setSession(JSON.parse(raw));
    } catch {}
  }, []);
  const login = (s: Session) => {
    setSession(s);
    localStorage.setItem(KEY, JSON.stringify(s));
  };
  const logout = () => {
    setSession(null);
    localStorage.removeItem(KEY);
  };
  return (
    <Ctx.Provider value={{ session, login, logout, isAdmin: session?.role === "admin" }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside provider");
  return v;
}