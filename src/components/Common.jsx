import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
export function PageTitle({ eyebrow, title, description, action }) {
  return (
    <div className="page-title">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function SectionTitle({ title, sub, to, linkText = "전체 보기" }) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {to && (
        <Link className="text-link" to={to}>
          {linkText}
          <ArrowUpRight size={16} />
        </Link>
      )}
    </div>
  );
}
export function Empty({ children = "아직 등록된 정보가 없습니다." }) {
  return <div className="empty-state">{children}</div>;
}
export function Stats({ items }) {
  return (
    <div className="stats-grid">
      {items.map(({ label, value, icon: Icon, sub }, i) => (
        <div className="stat-card" key={label}>
          <div>
            <span className="stat-label">{label}</span>
            <div className="stat-value">
              {value}
              <small>{sub || "경기"}</small>
            </div>
          </div>
          {Icon && (
            <span className={`stat-icon tone-${i}`}>
              <Icon size={23} />
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
