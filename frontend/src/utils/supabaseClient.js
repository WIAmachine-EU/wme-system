import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // 👇 Supabase 패스키(WebAuthn) 기능을 활성화하는 필수 옵션입니다!
    experimental: {
      passkeys: true
    }
  }
});
