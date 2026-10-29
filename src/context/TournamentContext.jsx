import { createContext, useContext, useEffect, useState } from "react";
import { tournamentStorage, STORAGE_KEY } from "../services/tournamentStorage";
import { createInitialData } from "../data/initialTournament";
const Context = createContext(null);
export function TournamentProvider({ children }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const notify = (message, type = "success") =>
    setToast({ message, type, id: Date.now() });
  useEffect(() => {
    try {
      setData(tournamentStorage.load());
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    const update = (e) => {
      if (e.key === STORAGE_KEY) {
        try {
          setData(tournamentStorage.load());
          notify("다른 탭의 변경 사항을 불러왔습니다.");
        } catch (e) {
          setError(e.message);
        }
      }
    };
    window.addEventListener("storage", update);
    return () => window.removeEventListener("storage", update);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  const commit = (next, message = "저장했습니다.", replace = false) => {
    try {
      const saved = { ...next, revision: (next.revision || 0) + 1 };
      if (replace) tournamentStorage.reset(saved);
      else tournamentStorage.save(saved, next.revision);
      setData(saved);
      setError("");
      notify(message);
      return true;
    } catch (e) {
      notify(e.message, "error");
      return false;
    }
  };
  const backup = () => {
    const url = URL.createObjectURL(
      new Blob([tournamentStorage.raw()], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "volleyball-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  if (error)
    return (
      <main className="recovery panel">
        <h1>저장 데이터를 확인해주세요</h1>
        <p>{error}</p>
        <p>
          원본은 그대로 보관되어 있습니다. 먼저 백업을 다운로드할 수 있습니다.
        </p>
        <button onClick={backup}>원본 백업 다운로드</button>{" "}
        <button
          onClick={() => {
            if (
              window.confirm(
                "저장 데이터를 삭제하고 초기 데이터로 바꾸시겠습니까?",
              )
            )
              commit(createInitialData(), "초기화했습니다.", true);
          }}
        >
          확인 후 초기화
        </button>
      </main>
    );
  if (!data)
    return (
      <main className="loading" role="status">
        대회 정보를 불러오는 중…
      </main>
    );
  return (
    <Context.Provider value={{ data, commit, notify, backup }}>
      {children}
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
