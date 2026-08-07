import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://wybmodrjazfrbwipyifc.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_w3YuTtqIjDojOLk23TV0zQ_23XekftS";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
