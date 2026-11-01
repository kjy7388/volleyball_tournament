import { useState, useEffect } from "react";
import { Save, MapPin, CalendarDays, SlidersHorizontal } from "lucide-react";
import { useTournament } from "../context/TournamentContext";
import { PageTitle } from "../components/Common";
import { stageLabel, teamLabel } from "../utils/display";
export default function TournamentSettings() {
  const { data, commit, notify } = useTournament();
  const [base, setBase] = useState(data);
  const [dirty, setDirty] = useState(false);
  const [t, setT] = useState(() => structuredClone(data.tournament));
  const [matches, setMatches] = useState(() => structuredClone(data.matches));
  useEffect(() => {
    if (!dirty) {
      setT(structuredClone(data.tournament));
      setMatches(structuredClone(data.matches));
      setBase(data);
    }
  }, [data, dirty]);
  const field = (key, value) => {
    setDirty(true);
    setT((old) => ({ ...old, [key]: value }));
  };
  const updateLocation = (key, value) => {
    setDirty(true);
    setT((old) => ({ ...old, locations: { ...old.locations, [key]: value } }));
  };
  const save = async (e) => {
    e.preventDefault();
    if (!t.name.trim()) {
      notify("대회명을 입력해주세요.", "error");
      return;
    }
    if (t.startDate && t.endDate && t.startDate > t.endDate) {
      notify("종료일은 시작일 이후여야 합니다.", "error");
      return;
    }
    if (t.setRules?.some((n) => !Number.isInteger(n) || n < 2 || n > 999)) {
      notify("세트 목표 점수는 2~999 사이의 정수여야 합니다.", "error");
      return;
    }
    const outside = matches.some(
      (m) =>
        m.scheduledAt &&
        ((t.startDate && m.scheduledAt.slice(0, 10) < t.startDate) ||
          (t.endDate && m.scheduledAt.slice(0, 10) > t.endDate)),
    );
    if (outside) {
      notify(
        "대회 기간 밖의 경기 일정이 있습니다. 기간 또는 경기 날짜를 확인해주세요.",
        "error",
      );
      return;
    }
    if (
      await commit(
        {
          ...base,
          tournament: { ...t, name: t.name.trim() },
          matches: matches.map((m) => ({
            ...m,
            location:
              m.location.trim() || t.locations[m.stage] || t.locations.default,
          })),
        },
        "대회 설정과 일정을 저장했습니다.",
      )
    )
      setDirty(false);
  };
  const applyLocations = () => {
    setDirty(true);
    setMatches((old) =>
      old.map((m) => ({
        ...m,
        location: t.locations[m.stage] || t.locations.default,
      })),
    );
    notify("입력 중인 장소를 경기별 설정에 적용했습니다. 저장하면 반영됩니다.");
  };
  return (
    <form onSubmit={save} onChange={() => setDirty(true)}>
      {dirty && base.revision !== data.revision && (
        <div className="warning">
          다른 관리자가 변경했습니다. 입력은 보관됩니다.{" "}
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  "입력 중인 내용을 버리고 최신 데이터를 불러올까요?",
                )
              )
                setDirty(false);
            }}
          >
            최신 데이터로 다시 편집
          </button>
        </div>
      )}
      <PageTitle
        eyebrow="TOURNAMENT SETTINGS"
        title="대회 설정"
        description="선택한 종목의 대회 이름, 일정, 장소와 경기 규칙을 설정하세요."
        action={
          <button type="submit" className="button">
            <Save size={17} />
            설정 저장
          </button>
        }
      />
      <section className="panel settings-panel">
        <h2>
          <SlidersHorizontal size={20} />
          기본 정보
        </h2>
        <p className="muted">
          진행 상태:{" "}
          {
            { upcoming: "시작 전", ongoing: "진행 중", completed: "종료" }[
              t.status
            ]
          }{" "}
          · 경기 결과에 따라 자동 계산됩니다.
        </p>
        <label>
          대회명
          <input
            value={t.name}
            maxLength={80}
            onChange={(e) => field("name", e.target.value)}
            required
          />
        </label>
        <div className="form-row">
          <label>
            시작일
            <input
              type="date"
              value={t.startDate}
              onChange={(e) => field("startDate", e.target.value)}
            />
          </label>
          <label>
            종료일
            <input
              type="date"
              value={t.endDate}
              min={t.startDate}
              onChange={(e) => field("endDate", e.target.value)}
            />
          </label>
        </div>
        <p className="muted">
          확정 전에는 비워두세요. 초기 일정의 월·일은 연도와 시간이 미정인
          예시입니다.
        </p>
      </section>
      <section className="panel settings-panel">
        <h2>
          <MapPin size={20} />
          경기 장소
        </h2>
        <div className="two-columns">
          {[
            ["default", "기본 장소"],
            ["group", "조별리그 장소"],
            ["semifinal", "준결승 장소"],
            ["final", "결승 장소"],
          ].map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                value={t.locations[key]}
                maxLength={80}
                onChange={(e) => updateLocation(key, e.target.value)}
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          className="button secondary"
          onClick={applyLocations}
        >
          위 장소를 모든 경기 설정에 적용
        </button>
      </section>
      {t.setRules ? (
        <section className="panel settings-panel">
          <h2>
            <SlidersHorizontal size={20} />
            세트별 목표 점수
          </h2>
          <div className="rules-inputs">
            {t.setRules.map((n, i) => (
              <label key={i}>
                {i + 1}세트
                <input
                  type="number"
                  min="2"
                  max="999"
                  step="1"
                  required
                  value={n}
                  onChange={(e) =>
                    field(
                      "setRules",
                      t.setRules.map((v, j) =>
                        j === i
                          ? e.target.value === ""
                            ? ""
                            : Number(e.target.value)
                          : v,
                      ),
                    )
                  }
                />
              </label>
            ))}
          </div>
          <p className="muted">
            듀스 없음 · 목표 점수 선취(1점 차 허용) · 5세트 3선승제. 기존 경기의
            목표 점수는 유지합니다. 목표 점수를 초과한 결과는 저장할 수
            없습니다.
          </p>
        </section>
      ) : (
        <section className="panel settings-panel">
          <h2>피구 경기 규칙</h2>
          <p>
            5판 3선승제 · 각 판의 승리 반 선택 · 무승부 없음 · 3승 이후 판
            미진행
          </p>
        </section>
      )}
      <section className="panel settings-panel">
        <h2>
          <CalendarDays size={20} />
          경기별 일정 및 장소
        </h2>
        <div className="notice">
          아래에서 실제 날짜와 시간을 지정할 수 있습니다. 비어 있는 경기는 월·일
          예시와 ‘시간 미정’으로 표시됩니다.
        </div>
        <div className="match-settings-list">
          {matches.map((m) => (
            <div className="match-setting-row" key={m.id}>
              <div>
                <span className="eyebrow">
                  경기 {String(m.number).padStart(2, "0")} · {stageLabel(m)}
                </span>
                <strong>
                  {teamLabel(data, m, "home")} <span className="muted">vs</span>{" "}
                  {teamLabel(data, m, "away")}
                </strong>
                <small className="muted">
                  예시: {m.exampleDate} · 연도 / 시간 미정
                </small>
              </div>
              <label>
                경기 일시
                <input
                  type="datetime-local"
                  value={m.scheduledAt}
                  onChange={(e) =>
                    setMatches((old) =>
                      old.map((n) =>
                        n.id === m.id
                          ? { ...n, scheduledAt: e.target.value }
                          : n,
                      ),
                    )
                  }
                />
              </label>
              <label>
                장소
                <input
                  value={m.location}
                  maxLength={80}
                  onChange={(e) =>
                    setMatches((old) =>
                      old.map((n) =>
                        n.id === m.id ? { ...n, location: e.target.value } : n,
                      ),
                    )
                  }
                />
              </label>
            </div>
          ))}
        </div>
      </section>
      <div className="sticky-save">
        <span>설정은 저장 후 모든 화면에 반영됩니다.</span>
        <button type="submit" className="button">
          <Save size={16} />
          설정 저장
        </button>
      </div>
    </form>
  );
}
