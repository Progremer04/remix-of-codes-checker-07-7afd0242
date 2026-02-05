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
 
     const { code } = await req.json();
 
     if (!code || typeof code !== 'string') {
       return new Response(
         JSON.stringify({ error: "Code is required" }),
         { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     // Find the code
     const { data: codeData, error: codeError } = await supabase
       .from("redeem_codes")
       .select("*")
       .eq("code", code.toUpperCase().trim())
       .eq("is_active", true)
       .single();
 
     if (codeError || !codeData) {
       return new Response(
         JSON.stringify({ error: "Invalid or inactive code" }),
         { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     // Check if expired
     if (codeData.expires_at && new Date(codeData.expires_at) < new Date()) {
       return new Response(
         JSON.stringify({ error: "Code has expired" }),
         { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     // Check if max uses reached
     if (codeData.max_uses && codeData.current_uses >= codeData.max_uses) {
       return new Response(
         JSON.stringify({ error: "Code has reached maximum uses" }),
         { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     // Check if already redeemed by this user
     const { data: existingRedemption } = await supabase
       .from("redeemed_codes")
       .select("id")
       .eq("user_id", user.id)
       .eq("code_id", codeData.id)
       .single();
 
     if (existingRedemption) {
       return new Response(
         JSON.stringify({ error: "You have already redeemed this code" }),
         { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     // Grant services to user
     const services = codeData.services || [];
     for (const service of services) {
       await supabase
         .from("user_services")
         .upsert({
           user_id: user.id,
           service,
           granted_at: new Date().toISOString(),
         }, { onConflict: 'user_id,service' });
     }
 
     // Record redemption
     await supabase
       .from("redeemed_codes")
       .insert({
         user_id: user.id,
         code_id: codeData.id,
       });
 
     // Update code usage count
     await supabase
       .from("redeem_codes")
       .update({ current_uses: codeData.current_uses + 1 })
       .eq("id", codeData.id);
 
     return new Response(
       JSON.stringify({ 
         success: true, 
         message: `Successfully redeemed! You now have access to: ${services.join(', ')}`,
         services,
       }),
       { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
     );
 
   } catch (error) {
     console.error("Error:", error);
     return new Response(
       JSON.stringify({ error: String(error) }),
       { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
     );
   }
 });