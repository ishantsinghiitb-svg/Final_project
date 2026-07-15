export const env = {
  appEnv: import.meta.env.VITE_APP_ENV ?? "development",
} as const;
