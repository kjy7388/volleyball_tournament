import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { sportFromPath } from "../data/sports";
import { useLocation } from "react-router-dom";
import { supabase, configurationError } from "../lib/supabaseClient";
import {
  createSupabaseRepository,
  downloadBackup,
  backupLegacyData,
} from "../services/supabaseTournament";
import { useAuth } from "./AuthContext";
const Context = createContext(null);
export function TournamentProvider({ children, client = supabase }) {
  const { pathname } = useLocation();
  const sport = sportFromPath(pathname);
  return (
    <SportTournamentProvider key={sport.key} sport={sport} client={client}>
      {children}
    </SportTournamentProvider>
  );
}
function SportTournamentProvider({ children, client, sport }) {
  const { isAdmin, recheck } = useAuth();
  const { pathname } = useLocation();
  const repo = useRef(
    client ? createSupabaseRepository(client, sport.id) : null,
  ).current;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(!!client);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [connection, setConnection] = useState("CONNECTING");
  const dataRef = useRef(null);
  const inFlight = useRef(null);
  const savingRef = useRef(false);
  const queued = useRef(false);
  const generation = useRef(0);
  const alive = useRef(true);
  const notify = useCallback(
    (message, type = "success") => setToast({ message, type, id: Date.now() }),
    [],
  );
  const accept = useCallback((next) => {
    if (!alive.current) return;
    if (!dataRef.current || !next || next.revision > dataRef.current.revision) {
      dataRef.current = next;
      setData(next);
    }
  }, []);
  const refresh = useCallback(async () => {
    if (!repo) return;
    if (savingRef.current) {
      queued.current = true;
      return;
    }
    if (inFlight.current) {
      queued.current = true;
      return inFlight.current;
    }
    const ticket = generation.current;
    const promise = (async () => {
      try {
        const next = await repo.load();
        if (ticket !== generation.current || !alive.current) return;
        accept(next);
        setError("");
        setLoaded(true);
      } catch (e) {
        if (alive.current && ticket === generation.current) setError(e.message);
      } finally {
        if (alive.current) setLoading(false);
      }
    })();
    inFlight.current = promise;
    await promise;
    if (inFlight.current === promise) inFlight.current = null;
    if (queued.current && !savingRef.current && alive.current) {
      queued.current = false;
      void refresh();
    }
  }, [repo, accept]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh, pathname]);
  useEffect(() => {
    if (!repo) return;
    let debounce;
    const changed = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => void refresh(), 250);
    };
    const unsubscribe = repo.subscribe(changed, (status) => {
      if (alive.current) setConnection(status);
      if (status === "SUBSCRIBED") changed();
    });
    const focus = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", focus);
    window.addEventListener("online", focus);
    document.addEventListener("visibilitychange", focus);
    const timer = setInterval(focus, 30000);
    return () => {
      clearTimeout(debounce);
      clearInterval(timer);
      unsubscribe();
      window.removeEventListener("focus", focus);
      window.removeEventListener("online", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [repo, refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  const commit = async (next, message = "저장했습니다.", options = {}) => {
    if (!isAdmin || !repo) {
      notify("관리자 로그인과 권한 확인이 필요합니다.", "error");
      return false;
    }
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    generation.current++;
    try {
      const saved = await repo.save(next, options);
      accept(saved);
      setLoaded(true);
      setError("");
      notify(message);
      return true;
    } catch (e) {
      notify(e.message, "error");
      if (e.message.includes("관리자 권한") || e.message.includes("세션"))
        recheck();
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
      if (queued.current) {
        queued.current = false;
        void refresh();
      }
    }
  };
  const backup = () => {
    try {
      downloadBackup(dataRef.current, `${sport.key}-backup.json`);
    } catch (e) {
      notify(e.message, "error");
    }
  };
  const backupLegacy = () => {
    try {
      backupLegacyData();
    } catch (e) {
      notify(e.message, "error");
    }
  };
  return (
    <Context.Provider
      value={{
        data,
        sport,
        error,
        loading,
        loaded,
        saving,
        connection,
        configurationError: client ? "" : configurationError,
        refresh,
        commit,
        notify,
        backup,
        backupLegacy,
      }}
    >
      {children}
      {saving && (
        <div className="saving-indicator" role="status">
          Supabase에 저장 중…
        </div>
      )}
      {toast && (
        <div
          role={toast.type === "error" ? "alert" : "status"}
          className={`toast ${toast.type}`}
        >
          <span>{toast.message}</span>
          <button aria-label="알림 닫기" onClick={() => setToast(null)}>
            ×
          </button>
        </div>
      )}
    </Context.Provider>
  );
}
export const useTournament = () => useContext(Context);
