 import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
 };
 
 serve(async (req) => {
   if (req.method === "OPTIONS") {
     return new Response(null, { headers: corsHeaders });
   }
 
   try {
     const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
     const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
     const supabase = createClient(supabaseUrl, supabaseServiceKey);
     
     // Get the authorization header
     const authHeader = req.headers.get("Authorization");
     if (!authHeader) {
       return new Response(
         JSON.stringify({ error: "Missing authorization header" }),
         { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     // Verify the user
     const token = authHeader.replace("Bearer ", "");
     const { data: { user }, error: authError } = await supabase.auth.getUser(token);
     
     if (authError || !user) {
       return new Response(
         JSON.stringify({ error: "Invalid token" }),
         { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     // Check if user is admin
     const { data: roleData, error: roleError } = await supabase
       .from("user_roles")
       .select("role")
       .eq("user_id", user.id)
       .eq("role", "admin")
       .single();
 
     if (roleError || !roleData) {
       return new Response(
         JSON.stringify({ error: "Unauthorized - Admin access required" }),
         { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     const { action, ...params } = await req.json();
 
     switch (action) {
       case "generate_code": {
         const { services, maxUses, expiresAt } = params;
         
         // Generate random code
         const code = Array.from({ length: 16 }, () => 
           'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]
         ).join('');
         
         const { data, error } = await supabase
           .from("redeem_codes")
           .insert({
             code,
             services: services || [],
             max_uses: maxUses || 1,
             expires_at: expiresAt || null,
             created_by: user.id,
           })
           .select()
           .single();
 
         if (error) {
           return new Response(
             JSON.stringify({ error: error.message }),
             { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
           );
         }
 
         return new Response(
           JSON.stringify({ code: data }),
           { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
         );
       }
 
       case "list_codes": {
         const { data, error } = await supabase
           .from("redeem_codes")
           .select("*")
           .order("created_at", { ascending: false });
 
         if (error) {
           return new Response(
             JSON.stringify({ error: error.message }),
             { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
           );
         }
 
         return new Response(
           JSON.stringify({ codes: data }),
           { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
         );
       }
 
       case "toggle_code": {
         const { codeId, isActive } = params;
         
         const { error } = await supabase
           .from("redeem_codes")
           .update({ is_active: isActive })
           .eq("id", codeId);
 
         if (error) {
           return new Response(
             JSON.stringify({ error: error.message }),
             { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
           );
         }
 
         return new Response(
           JSON.stringify({ success: true }),
           { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
         );
       }
 
       case "delete_code": {
         const { codeId } = params;
         
         const { error } = await supabase
           .from("redeem_codes")
           .delete()
           .eq("id", codeId);
 
         if (error) {
           return new Response(
             JSON.stringify({ error: error.message }),
             { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
           );
         }
 
         return new Response(
           JSON.stringify({ success: true }),
           { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
         );
       }
 
       case "list_users": {
         const { data, error } = await supabase
           .from("profiles")
           .select(`
             *,
             user_roles (role),
             user_services (service, expires_at)
           `)
           .order("created_at", { ascending: false });
 
         if (error) {
           return new Response(
             JSON.stringify({ error: error.message }),
             { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
           );
         }
 
         return new Response(
           JSON.stringify({ users: data }),
           { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
         );
       }
 
       case "list_history": {
         const { data, error } = await supabase
           .from("check_history")
           .select("*")
           .order("created_at", { ascending: false })
           .limit(100);
 
         if (error) {
           return new Response(
             JSON.stringify({ error: error.message }),
             { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
           );
         }
 
         return new Response(
           JSON.stringify({ history: data }),
           { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
         );
       }
 
       case "grant_service": {
         const { userId, service, expiresAt } = params;
         
         const { error } = await supabase
           .from("user_services")
           .upsert({
             user_id: userId,
             service,
             expires_at: expiresAt || null,
           }, { onConflict: 'user_id,service' });
 
         if (error) {
           return new Response(
             JSON.stringify({ error: error.message }),
             { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
           );
         }
 
         return new Response(
           JSON.stringify({ success: true }),
           { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
         );
       }
 
       case "set_admin": {
         const { userId, isAdmin } = params;
         
         if (isAdmin) {
           const { error } = await supabase
             .from("user_roles")
             .upsert({ user_id: userId, role: 'admin' }, { onConflict: 'user_id,role' });
 
           if (error) {
             return new Response(
               JSON.stringify({ error: error.message }),
               { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
             );
           }
         } else {
           await supabase
             .from("user_roles")
             .delete()
             .eq("user_id", userId)
             .eq("role", "admin");
         }
 
         return new Response(
           JSON.stringify({ success: true }),
           { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
         );
       }
 
       default:
         return new Response(
           JSON.stringify({ error: "Invalid action" }),
           { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
         );
     }
 
   } catch (error) {
     console.error("Error:", error);
     return new Response(
       JSON.stringify({ error: String(error) }),
       { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
     );
   }
 });