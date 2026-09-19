export const CLOUD_MODE = import.meta.env.VITE_CLOUD_MODE === "true";
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
export const DEMO_MODE = !CLOUD_MODE;
export const REPAIR_EMAIL = "reparacion@rematech.mx";
export const API_BASE_URL = "https://api.rematech.mx";
