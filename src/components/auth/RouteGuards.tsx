import type { ReactNode } from "react";
import { Navigate } from "@tanstack/react-router";
import { useAuth } from "@/context/AuthContext";

function FullScreenLoader() {
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-white/40" />
    </div>
  );
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
}

export function GuestRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <FullScreenLoader />;
  if (user) return <Navigate to="/dashboard" />;
  return <>{children}</>;
}
