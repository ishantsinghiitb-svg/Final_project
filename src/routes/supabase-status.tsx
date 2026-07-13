import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/supabase-status")({
  component: SupabaseStatus,
});

function SupabaseStatus() {
  const [state, setState] = useState<"checking" | "ok" | "fail">("checking");
  const [detail, setDetail] = useState<string>("");
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const keyLen = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.length ?? 0;

  useEffect(() => {
    (async () => {
      try {
        const { error } = await supabase.auth.getSession();
        if (error) throw error;
        setState("ok");
        setDetail("Client initialized and reached Supabase Auth successfully.");
      } catch (e: any) {
        setState("fail");
        setDetail(e?.message ?? String(e));
      }
    })();
  }, []);

  const color = state === "ok" ? "#16a34a" : state === "fail" ? "#dc2626" : "#6b7280";
  const label = state === "ok" ? "✅ SUCCESS" : state === "fail" ? "❌ FAIL" : "⏳ Checking…";

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Supabase Client Status</h1>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{label}</div>
      <ul style={{ marginTop: 16 }}>
        <li>VITE_SUPABASE_URL: <code>{url || "(missing)"}</code></li>
        <li>VITE_SUPABASE_ANON_KEY: {keyLen ? `${keyLen} chars loaded` : "(missing)"}</li>
      </ul>
      <p style={{ marginTop: 16, color }}>{detail}</p>
    </div>
  );
}