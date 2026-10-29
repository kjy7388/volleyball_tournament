import { useState } from "react";
import { Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTournament } from "../context/TournamentContext";
import { ConfigurationState } from "../components/DataState";
export default function AdminGuard() {
  const { status, error, signOut, recheck } = useAuth();
  const { configurationError, notify } = useTournament();
  if (configurationError) return <ConfigurationState />;
  if (status === "loading" || status === "checking")
    return (
      <div className="loading" role="status">
        관리자 권한 확인 중…
      </div>
    );
  if (status === "anonymous") return <AdminLogin />;
  if (status === "forbidden" || status === "error")
    return (
      <section className="panel connection-state">
        <h1>
          {status === "forbidden"
            ? "관리자 권한이 없습니다"
            : "권한을 확인하지 못했습니다"}
        </h1>
        <p>
          {status === "forbidden"
            ? "이 계정은 tournament_admins에 등록되지 않았습니다. 운영 담당자에게 권한을 요청해주세요."
            : error}
        </p>
        <div className="button-row">
          <button className="button secondary" onClick={recheck}>
            권한 다시 확인
          </button>
          <button
            className="button"
            onClick={async () => {
              try {
                await signOut();
              } catch (e) {
                notify(e.message, "error");
              }
            }}
          >
            로그아웃
          </button>
        </div>
      </section>
    );
  return <Outlet />;
}
function AdminLogin() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signIn(email, password);
      setPassword("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel login-panel">
      <span className="eyebrow">TOURNAMENT DESK</span>
      <h1>관리자 로그인</h1>
      <p>등록된 관리자 계정으로 로그인해주세요.</p>
      <form onSubmit={submit}>
        <label>
          이메일
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={busy}
          />
        </label>
        <label>
          비밀번호
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={busy}
          />
        </label>
        {error && (
          <p className="validation-errors" role="alert">
            {error}
          </p>
        )}
        <button className="button" disabled={busy}>
          {busy ? "로그인 중…" : "로그인"}
        </button>
      </form>
      <p className="muted small-text">
        계정 생성과 관리자 지정은 Supabase Dashboard에서만 진행합니다.
      </p>
    </section>
  );
}
