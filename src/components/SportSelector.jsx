import { NavLink, useLocation } from "react-router-dom";
import { SPORTS } from "../data/sports";
export default function SportSelector() {
  const { pathname } = useLocation();
  const admin = pathname.startsWith("/admin/");
  const suffix = pathname
    .split("/")
    .slice(admin ? 3 : 2)
    .join("/");
  return (
    <nav className="sport-selector" aria-label="종목 선택">
      {Object.values(SPORTS).map((sport) => (
        <NavLink
          key={sport.key}
          to={`${admin ? "/admin" : ""}/${sport.key}${suffix ? `/${suffix}` : ""}`}
        >
          <span aria-hidden="true">{sport.icon}</span> {sport.label}
        </NavLink>
      ))}
    </nav>
  );
}
