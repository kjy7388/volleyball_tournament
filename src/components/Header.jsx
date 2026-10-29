import { NavLink, Link, Outlet, useLocation } from "react-router-dom";
import {
  Activity,
  ArrowUpRight,
  LayoutDashboard,
  Users,
  ClipboardList,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { useTournament } from "../context/TournamentContext";
import { useAuth } from "../context/AuthContext";
const publicLinks = [
  ["/", "홈"],
  ["/groups", "조별리그"],
  ["/bracket", "토너먼트"],
  ["/schedule", "경기 일정"],
  ["/teams", "참가 반"],
];
const adminLinks = [
  ["/admin", "관리자 대시보드", LayoutDashboard],
  ["/admin/teams", "참가 반 및 선수", Users],
  ["/admin/matches", "경기 결과 관리", ClipboardList],
  ["/admin/settings", "대회 설정", Settings],
];
export default function Layout() {
  const { data, error, refresh, saving, connection, notify } = useTournament();
  const { isAdmin, session, signOut } = useAuth();
  const { pathname } = useLocation();
  const admin = pathname.startsWith("/admin");
  return (
    <div className={admin ? "app admin-app" : "app"}>
      <header className="site-header">
        <div className={`header-inner${admin ? "" : " public-header"}`}>
          <Link className="brand" to="/" aria-label="VOLLEYBALL CUP 홈">
            <img src="/volleyball.svg" alt="" />
            <span>
              VOLLEYBALL<span className="brand-light"> CUP</span>
              <small>CLASS TOGETHER. PLAY TOGETHER.</small>
            </span>
          </Link>
          <nav className="public-nav" aria-label="주 메뉴">
            {publicLinks.map(([to, label]) => (
              <NavLink key={to} to={to} end={to === "/"}>
                {label}
              </NavLink>
            ))}
          </nav>
          {admin && (
            <Link className="admin-link selected" to="/">
              <ArrowUpRight size={15} />
              <span>대회 홈페이지</span>
            </Link>
          )}
        </div>
      </header>
      {admin && (
        <div className="admin-banner">
          <div className="container">
            <ShieldCheck size={17} />
            <span>{isAdmin ? "인증된 관리자" : "관리자 로그인"}</span>
            <span className="subtle">
              {isAdmin
                ? session.user.email
                : "등록된 관리자만 데이터 변경 가능"}
            </span>
            {isAdmin && (
              <button
                className="button secondary logout-button"
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
            )}
          </div>
        </div>
      )}
      <div
        className={admin ? "container admin-layout" : "container main-content"}
      >
        {admin && (
          <aside className="admin-sidebar">
            <div className="eyebrow">TOURNAMENT DESK</div>
            <nav aria-label="관리자 메뉴">
              {adminLinks.map(([to, label, Icon]) => (
                <NavLink key={to} to={to} end={to === "/admin"}>
                  <Icon size={18} />
                  {label}
                </NavLink>
              ))}
            </nav>
            <div className="sidebar-note">
              <Activity size={20} />
              <strong>운영을 더 간편하게</strong>
              <p>경기 결과를 확정하면 순위와 다음 대진이 반영됩니다.</p>
            </div>
          </aside>
        )}
        <main aria-busy={saving}>
          {data && error && (
            <div className="warning" role="alert">
              {error} 현재 화면은 마지막 조회 결과입니다.{" "}
              <button onClick={refresh}>다시 조회</button>
            </div>
          )}
          <fieldset className="page-fieldset" disabled={saving}>
            <Outlet />
          </fieldset>
        </main>
      </div>
      <footer className="site-footer container">
        <div className="footer-brand">
          <img src="/volleyball.svg" alt="" /> VOLLEYBALL CUP
        </div>
        <span>하나의 팀, 함께 만드는 순간.</span>
        <small>
          {data?.isDemo ? "데모 데이터 모드" : "SUPABASE"} ·{" "}
          {connection === "SUBSCRIBED" ? "실시간 갱신" : "주기적 갱신"}
        </small>
      </footer>
    </div>
  );
}
