import { createClient } from "@supabase/supabase-js";
export function checkSupabaseConfig(env = {}) {
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key || key.includes("REPLACE_WITH"))
    return "프로젝트 루트의 .env.local에 VITE_SUPABASE_URL과 VITE_SUPABASE_PUBLISHABLE_KEY를 설정하고 개발 서버를 다시 시작해주세요.";
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      !parsed.hostname.endsWith(".supabase.co") ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/"
    )
      throw new Error();
  } catch {
    return "VITE_SUPABASE_URL에는 Supabase 프로젝트의 https://프로젝트ID.supabase.co 주소를 입력해주세요.";
  }
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key))
    return "VITE_SUPABASE_PUBLISHABLE_KEY에는 sb_publishable_로 시작하는 공개 키만 사용하세요. Secret Key와 service_role 키는 사용할 수 없습니다.";
  return "";
}
export const configurationError = checkSupabaseConfig(import.meta.env);
export const supabase = configurationError
  ? null
  : createClient(
      import.meta.env.VITE_SUPABASE_URL.trim(),
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY.trim(),
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
        global: {
          fetch: (url, options = {}) =>
            fetch(url, {
              ...options,
              signal: options.signal || AbortSignal.timeout(15000),
            }),
        },
      },
    );
