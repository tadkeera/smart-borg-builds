import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session as SbSession, User } from "@supabase/supabase-js";

export type Role = "admin" | "receptionist";

export interface Permissions {
  index: boolean;
  doctors: boolean;
  schedules: boolean;
  whatsapp: boolean;
  reports: boolean;
  audit: boolean;
  account: boolean;
}

interface AuthCtx {
  user: User | null;
  session: SbSession | null;
  role: Role | null;
  permissions: Permissions | null;
  loading: boolean;
  isAdmin: boolean;
  isReceptionist: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

async function fetchRoleAndPermissions(userId: string): Promise<{ role: Role | null, permissions: Permissions | null }> {
  const { data } = await supabase
    .from("user_roles")
    .select("role, permissions")
    .eq("user_id", userId)
    .order("role", { ascending: true }); // admin sorts before receptionist
  if (!data || data.length === 0) return { role: null, permissions: null };
  
  const adminRow = data.find(r => r.role === "admin");
  if (adminRow) return { role: "admin", permissions: adminRow.permissions as any };
  
  return { 
    role: (data[0].role as Role) ?? null, 
    permissions: data[0].permissions as any 
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SbSession | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [permissions, setPermissions] = useState<Permissions | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up listener BEFORE getting session
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        // defer DB call to avoid deadlock inside the listener
        setTimeout(() => { 
          fetchRoleAndPermissions(s.user.id).then(res => {
            setRole(res.role);
            setPermissions(res.permissions);
          }); 
        }, 0);
      } else {
        setRole(null);
        setPermissions(null);
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchRoleAndPermissions(s.user.id).then(res => {
          setRole(res.role);
          setPermissions(res.permissions);
        }).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };
  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) throw error;
  };
  const signOut = async () => { await supabase.auth.signOut(); };

  return (
    <Ctx.Provider value={{
      user, session, role, permissions, loading,
      isAdmin: role === "admin",
      isReceptionist: role === "receptionist",
      signIn, signUp, signOut,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside provider");
  return v;
}
