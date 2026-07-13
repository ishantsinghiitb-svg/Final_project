// Re-export auth functions from the service layer for backwards compatibility.
// New code should import from "@/services/AuthService" or "@/context/AuthContext" directly.
export { authService as supabaseAuth } from "@/services/AuthService";
export type { AuthResult } from "@/services/AuthService";
