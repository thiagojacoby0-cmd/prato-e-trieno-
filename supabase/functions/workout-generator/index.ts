// Supabase Edge Function: workout-generator
// Deploy via: supabase functions deploy workout-generator
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { focus, duration_minutes, equipment, level, goal } = await req.json();
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `Gere um treino em casa em JSON (title, category, level, duration_minutes, estimated_calories, description, exercises[{id,name,muscle_group,sets,reps_or_duration,duration_seconds,rest_seconds,instructions,tips}]) para foco "${focus}", duração ${duration_minutes || 25} min, nível ${level || "intermediario"}, objetivo ${goal || "emagrecimento"}, equipamentos: ${(equipment || ["Peso corporal"]).join(", ")}.`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-4-hydrogen:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      }
    );

    const data = await geminiRes.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const parsed = JSON.parse(rawText);

    const { data: saved, error: insertError } = await supabaseClient
      .from("workouts")
      .insert({
        user_id: user.id,
        title: parsed.title,
        category: parsed.category,
        level: parsed.level || level || "intermediario",
        duration_minutes: parsed.duration_minutes || duration_minutes || 25,
        estimated_calories: parsed.estimated_calories || 200,
        equipment: equipment || ["Peso corporal"],
        description: parsed.description || "",
        exercises: parsed.exercises || [],
        is_ai_generated: true,
      })
      .select("*")
      .single();

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ workout: saved }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
