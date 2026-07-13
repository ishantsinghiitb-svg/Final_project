import type { ProfileUpdate } from "@/types";

export type ValidationResult = { valid: boolean; error: string | null };

export function validateEmail(email: string): ValidationResult {
  if (!email.trim()) return { valid: false, error: "Email is required." };
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(email)) return { valid: false, error: "Enter a valid email address." };
  return { valid: true, error: null };
}

export function validatePassword(password: string): ValidationResult {
  if (!password) return { valid: false, error: "Password is required." };
  if (password.length < 8) return { valid: false, error: "Password must be at least 8 characters." };
  return { valid: true, error: null };
}

export function validateFullName(name: string): ValidationResult {
  if (!name.trim()) return { valid: false, error: "Full name is required." };
  if (name.trim().length < 2) return { valid: false, error: "Name must be at least 2 characters." };
  return { valid: true, error: null };
}

export function validateProfileUpdate(updates: ProfileUpdate): ValidationResult {
  if (updates.full_name !== undefined && !updates.full_name?.trim()) {
    return { valid: false, error: "Full name cannot be empty." };
  }
  return { valid: true, error: null };
}

export function validateResumeName(name: string): ValidationResult {
  if (!name.trim()) return { valid: false, error: "Resume name is required." };
  return { valid: true, error: null };
}

export function validateJobUrl(url: string): ValidationResult {
  if (!url.trim()) return { valid: true, error: null };
  try {
    new URL(url);
    return { valid: true, error: null };
  } catch {
    return { valid: false, error: "Enter a valid URL." };
  }
}

export function validatePreferences(prefs: Record<string, string>): ValidationResult {
  for (const [key, value] of Object.entries(prefs)) {
    if (!key.trim()) return { valid: false, error: `Preference key cannot be empty.` };
    if (value.length > 2000) return { valid: false, error: `Preference "${key}" is too long.` };
  }
  return { valid: true, error: null };
}
