import { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
const Context = createContext(null);
export function AuthProvider({ children, client = supabase }) {
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState(client ? "loading" : "anonymous");
  const [error, setError] = useState("");
  const [check, setCheck] = useState(0);
  const sequence = useRef(0);
  const userId = useRef(null);
  useEffect(() => {
    if (!client) return;
    let active = true;
    let eventReceived = false;
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      eventReceived = true;
      sequence.current++;
      const sameUser = !!next && userId.current === next.user.id;
      userId.current = next?.user.id || null;
      setSession(next);
      if (!sameUser) setStatus(next ? "checking" : "anonymous");
      setCheck((n) => n + 1);
    });
    client.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active || eventReceived) return;
        if (error) {
          setError("로그인 세션을 불러오지 못했습니다. 다시 로그인해주세요.");
          setStatus("error");
        } else {
          userId.current = data.session?.user.id || null;
          setSession(data.session);
          setStatus(data.session ? "checking" : "anonymous");
        }
      })
      .catch(() => {
        if (active) {
          setStatus("error");
          setError("로그인 서버에 연결하지 못했습니다.");
        }
      });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [client]);
  useEffect(() => {
    if (!session || !client) return;
    let active = true;
    const ticket = ++sequence.current;
    setStatus((current) =>
      ["admin", "forbidden"].includes(current) ? current : "checking",
    );
    client
      .rpc("is_tournament_admin")
      .then(({ data, error }) => {
        if (!active || ticket !== sequence.current) return;
        if (error) {
          setStatus("error");
          setError(
            "관리자 권한을 확인하지 못했습니다. SQL 설정과 네트워크를 확인해주세요.",
          );
        } else {
          setStatus(data === true ? "admin" : "forbidden");
          setError("");
        }
      })
      .catch(() => {
        if (active && ticket === sequence.current) {
          setStatus("error");
          setError("관리자 권한 확인 중 네트워크 오류가 발생했습니다.");
        }
      });
    return () => {
      active = false;
    };
  }, [client, session, check]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible" && session)
        setCheck((n) => n + 1);
    };
    window.addEventListener("focus", refresh);
    const timer = setInterval(refresh, 60000);
    return () => {
      window.removeEventListener("focus", refresh);
      clearInterval(timer);
    };
  }, [session]);
  const signIn = async (email, password) => {
    setError("");
    const { error } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error)
      throw new Error(
        error.code === "invalid_credentials" || error.status === 400
          ? "이메일 또는 비밀번호를 확인해주세요."
          : "로그인에 실패했습니다. 네트워크를 확인하고 다시 시도해주세요.",
      );
  };
  const signOut = async () => {
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) throw new Error("로그아웃에 실패했습니다. 다시 시도해주세요.");
    sequence.current++;
    setSession(null);
    setStatus("anonymous");
  };
  return (
    <Context.Provider
      value={{
        session,
        status,
        error,
        signIn,
        signOut,
        isAdmin: status === "admin",
        recheck: () => setCheck((n) => n + 1),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useAuth = () => useContext(Context);
