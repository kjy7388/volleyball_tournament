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
export default function App() {
  const { pathname } = useLocation();
  const { data } = useTournament();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  useEffect(() => {
    document.title = `${data.tournament.name} · 배구대회`;
  }, [data.tournament.name]);
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="groups" element={<Groups />} />
        <Route path="bracket" element={<Bracket />} />
        <Route path="schedule" element={<Schedule />} />
        <Route path="teams" element={<Teams />} />
        <Route path="admin" element={<AdminDashboard />} />
        <Route path="admin/teams" element={<TeamManager />} />
        <Route path="admin/matches" element={<MatchManager />} />
        <Route path="admin/settings" element={<TournamentSettings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
