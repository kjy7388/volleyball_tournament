import { useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { useTournament } from "./context/TournamentContext";
import Layout from "./components/Header";
import Home from "./pages/Home";
import Groups from "./pages/Groups";
import Bracket from "./pages/Bracket";
import Schedule from "./pages/Schedule";
import Teams from "./pages/Teams";
import NotFound from "./pages/NotFound";
import AdminDashboard from "./admin/AdminDashboard";
import TeamManager from "./admin/TeamManager";
import MatchManager from "./admin/MatchManager";
import TournamentSettings from "./admin/TournamentSettings";
import AdminGuard from "./admin/AdminGuard";
import { TournamentGate } from "./components/DataState";
export default function App() {
  const { pathname } = useLocation();
  const { data } = useTournament();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  useEffect(() => {
    document.title = `${data?.tournament.name || "VOLLEYBALL CUP"} · 배구대회`;
  }, [data?.tournament.name]);
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route element={<TournamentGate />}>
          <Route index element={<Home />} />
          <Route path="groups" element={<Groups />} />
          <Route path="bracket" element={<Bracket />} />
          <Route path="schedule" element={<Schedule />} />
          <Route path="teams" element={<Teams />} />
        </Route>
        <Route path="admin" element={<AdminGuard />}>
          <Route element={<TournamentGate />}>
            <Route index element={<AdminDashboard />} />
            <Route path="teams" element={<TeamManager />} />
            <Route path="matches" element={<MatchManager />} />
            <Route path="settings" element={<TournamentSettings />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
