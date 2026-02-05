 import { useState, useEffect, createContext, useContext } from 'react';
 import { User, Session } from '@supabase/supabase-js';
 import { supabase } from '@/integrations/supabase/client';
 
 interface AuthContextType {
   user: User | null;
   session: Session | null;
   isLoading: boolean;
   isAdmin: boolean;
   userServices: string[];
   signUp: (email: string, password: string, username: string) => Promise<{ error: any }>;
   signIn: (email: string, password: string) => Promise<{ error: any }>;
   signOut: () => Promise<void>;
   redeemCode: (code: string) => Promise<{ error?: string; services?: string[] }>;
 }
 
 const AuthContext = createContext<AuthContextType | null>(null);
 
 export function AuthProvider({ children }: { children: React.ReactNode }) {
   const [user, setUser] = useState<User | null>(null);
   const [session, setSession] = useState<Session | null>(null);
   const [isLoading, setIsLoading] = useState(true);
   const [isAdmin, setIsAdmin] = useState(false);
   const [userServices, setUserServices] = useState<string[]>([]);
 
   useEffect(() => {
     // Get initial session
     supabase.auth.getSession().then(({ data: { session } }) => {
       setSession(session);
       setUser(session?.user ?? null);
       if (session?.user) {
         fetchUserData(session.user.id);
       }
       setIsLoading(false);
     });
 
     // Listen for auth changes
     const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
       setSession(session);
       setUser(session?.user ?? null);
       if (session?.user) {
         fetchUserData(session.user.id);
       } else {
         setIsAdmin(false);
         setUserServices([]);
       }
     });
 
     return () => subscription.unsubscribe();
   }, []);
 
   const fetchUserData = async (userId: string) => {
     try {
       // Check if admin
       const { data: roleData } = await supabase
         .from('user_roles')
         .select('role')
         .eq('user_id', userId)
         .eq('role', 'admin')
         .single();
       
       setIsAdmin(!!roleData);
 
       // Get user services
       const { data: servicesData } = await supabase
         .from('user_services')
         .select('service')
         .eq('user_id', userId);
       
       setUserServices(servicesData?.map(s => s.service) || []);
     } catch (e) {
       console.error('Error fetching user data:', e);
     }
   };
 
   const signUp = async (email: string, password: string, username: string) => {
     const { data, error } = await supabase.auth.signUp({
       email,
       password,
     });
 
     if (!error && data.user) {
       // Create profile
       await supabase.from('profiles').insert({
         user_id: data.user.id,
         username,
         email,
       });
     }
 
     return { error };
   };
 
   const signIn = async (email: string, password: string) => {
     const { error } = await supabase.auth.signInWithPassword({
       email,
       password,
     });
     return { error };
   };
 
   const signOut = async () => {
     await supabase.auth.signOut();
   };
 
   const redeemCode = async (code: string): Promise<{ error?: string; services?: string[] }> => {
     try {
       const { data, error } = await supabase.functions.invoke('redeem-code', {
         body: { code },
       });
 
       if (error) {
         return { error: error.message };
       }
 
       if (data.error) {
         return { error: data.error };
       }
 
       // Refresh user services
       if (user) {
         fetchUserData(user.id);
       }
 
       return { services: data.services };
     } catch (e) {
       return { error: String(e) };
     }
   };
 
   return (
     <AuthContext.Provider value={{
       user,
       session,
       isLoading,
       isAdmin,
       userServices,
       signUp,
       signIn,
       signOut,
       redeemCode,
     }}>
       {children}
     </AuthContext.Provider>
   );
 }
 
 export function useAuth() {
   const context = useContext(AuthContext);
   if (!context) {
     throw new Error('useAuth must be used within an AuthProvider');
   }
   return context;
 }