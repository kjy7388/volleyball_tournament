# SPORTS TOURNAMENT · 배구·피구

각 종목 6개 반·9경기의 배구·피구 통합 운영 웹사이트입니다. React + Vite, JavaScript/JSX, React Router, Lucide React, Supabase Auth·PostgreSQL·Realtime을 사용합니다. 기존 홈·순위표·대진표·일정·선수·관리자 디자인과 배구 경기 계산 로직을 유지했습니다.

**기존 Supabase 프로젝트의 통합 전환은 [MULTI_SPORT_UPGRADE.md](docs/MULTI_SPORT_UPGRADE.md)를 먼저 확인하세요.** 001을 다시 실행하지 말고, 백업·검토·사용자 승인 후 새 002만 적용합니다. 로컬 테스트는 실제 DB를 변경하지 않습니다. 관리자 계정·GitHub 저장소·Vercel 프로젝트는 기존 것을 사용합니다.

현재 기존 프로젝트에는 사용자가 002 적용을 완료했습니다. 배포 전 읽기 전용 확인에서도 DB 버전 2와 배구·피구 각각 6개 반·9경기 조회를 확인했습니다. 이 프로젝트에서 001·002를 다시 실행하거나 데이터를 초기화할 필요는 없습니다. 아래 SQL 설정 절차는 아직 통합하지 않은 별도 환경을 위한 안내입니다.

**배구는 듀스 없이 목표 점수 선취 방식입니다.** [변경·검증·003 적용 안내](docs/NO_DEUCE_UPDATE.md)를 확인하세요. 사용자가 기존 운영 DB에 003 적용을 완료했으며, 2026-11-01 Data API에서 배구 규칙 버전 3·통합 버전 2를 확인했습니다. 이미 적용된 001·002·003은 다시 실행하지 않습니다. 서버 규칙 버전 3이 확인되지 않는 환경에서는 배구 저장을 차단하며, 피구 저장에는 영향이 없습니다.

## 시작하기

권장 Node.js: **22.23.4 LTS** (`.nvmrc`).

```powershell
cd 'C:\Users\김장엽\Desktop\Yeop\VS Code\volleyball tournament'
npm install
```

1. 기존 DB는 [003 적용 안내](docs/NO_DEUCE_UPDATE.md)를 따릅니다. 완전히 빈 새 테스트 DB만 001→002→003 순서로 설정합니다.
2. `.env.example`을 `.env.local`로 복사하고 실제 프로젝트 URL·Publishable Key를 직접 입력합니다. 서버 키는 사용하지 않습니다.
3. 기존 관리자 계정을 그대로 사용합니다. 새 테스트 DB에서만 [설정 안내](docs/SUPABASE_SETUP.md)에 따라 최초 관리자를 등록합니다.
4. `npm run dev`를 실행합니다. 환경변수 변경 후에는 서버를 다시 시작하세요.

- 배구: http://localhost:5173/volleyball · 피구: http://localhost:5173/dodgeball
- 관리자: http://localhost:5173/admin/volleyball · http://localhost:5173/admin/dodgeball
- 기존 `/`, `/groups`, `/bracket`, `/schedule`, `/teams`, `/admin` 및 관리자 하위 주소는 배구 새 경로로 이동합니다.
- 설정이 없으면 안내 화면이 표시됩니다. 데이터는 자동으로 생성·삭제·덮어쓰기하지 않습니다.
- DB가 비어 있으면 관리자 로그인 후 샘플 최초 등록 또는 기존 JSON 백업으로 최초 복원을 선택할 수 있습니다.

## SQL과 운영 문서

| 파일                                                                 | 용도                                                                             |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [001_initial_schema.sql](supabase/migrations/001_initial_schema.sql) | 테이블, 제약, RLS, grants, 권한 확인, 조회·원자적 저장 RPC, Realtime publication |
| [002_multi_sport_tournament.sql](supabase/migrations/002_multi_sport_tournament.sql) | 기존 DB의 배구 기록·계정 보존, 피구 판 결과 및 종목별 저장 확장 |
| [003_volleyball_no_deuce.sql](supabase/migrations/003_volleyball_no_deuce.sql) | 배구 목표 점수 선취 검증, 기존 비호환 기록 발견 시 전체 적용 중단 |
| [volleyball_no_deuce_preflight.sql](supabase/checks/volleyball_no_deuce_preflight.sql) | 003 전 실제 함수 정의·권한·점수 충돌 읽기 전용 점검 |
| [multi_sport_preflight.sql](supabase/checks/multi_sport_preflight.sql) | 적용 전 스키마·정책·함수·Revision 읽기 전용 점검 |
| [MULTI_SPORT_UPGRADE.md](docs/MULTI_SPORT_UPGRADE.md) | 종목별 구조, 백업, SQL 승인·이전·실제 검증·배포 절차 |
| [register_first_admin.sql](supabase/admin/register_first_admin.sql)  | 프로젝트 소유자가 실제 Auth UUID로 최초 관리자 등록                              |
| [verify_permissions.sql](supabase/checks/verify_permissions.sql)     | 실제 프로젝트의 RLS·grants를 읽기 전용으로 점검                                  |
| [.env.example](.env.example)                                         | 공개 환경변수 이름·예시                                                          |
| [SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)                          | 백업·SQL 적용·계정 생성·환경변수·복원·실제 검증·Vercel·Push 전 점검              |
| [TEST_RESULTS.md](docs/TEST_RESULTS.md)                              | 로컬 자동 검증 결과와 실제 원격 미검증 범위                                      |

## 데이터와 권한

**Supabase가 유일한 대회 데이터 원본입니다.** 공용 데이터가 없거나 조회가 실패해도 localStorage를 원본으로 대체하지 않습니다. 기존 localStorage는 백업·명시적인 최초 복원용으로 읽기만 하며 삭제하지 않습니다. Auth의 브라우저 세션 저장은 별도로 유지합니다.

일반 사용자는 로그인 없이 공개 데이터만 읽습니다. 로그인 계정 중 `tournament_admins`에 등록된 계정만 변경할 수 있습니다. 관리자 목록은 공개하지 않습니다. 직접 테이블 변경은 관리자에게도 허용하지 않으며, 전용 RPC가 서버 권한·점수·대진·확인된 초기화 목록을 검사하고 하나의 트랜잭션으로 저장합니다. 이전 revision은 비공개 감사 테이블에 보관합니다.

배구 기본 규칙은 25·25·25·25·15점 선취, 듀스 없음, 3세트 선승입니다. 한쪽만 목표 점수에 정확히 도달하고 상대는 목표 미만이어야 합니다. 25:24·15:14는 유효하고 26:24·16:14는 거부합니다. 24:24·14:14는 진행 중인 임시 점수로만 저장할 수 있습니다. 미확정 경기는 순위에서 제외합니다. 동률은 승수 → 세트 득실 → 득실점 → 상대 전적 순으로 계산하고, 해소되지 않으면 관리자 확인을 요구합니다. 이전 결과 수정으로 결선에 영향이 생기면 확인 후 해당 기록을 초기화합니다. 최신 revision과 다르면 저장을 거부합니다.

피구는 숫자 점수 대신 각 판의 승리 반만 선택하는 5판 3선승제입니다. 순위는 승수 → 판 득실 → 상대 전적 → 동률 집단 내 관리자 확정 순입니다. 종목별 선수·조 편성·결과·Revision·데모·초기화는 독립적입니다. 종목 전환 전 미저장 편집을 저장하세요.

관리자 데모·초기화는 모든 사용자에게 보이는 DB를 변경하므로 반드시 백업하고 확인하세요. JSON 가져오기는 빈 DB에만 가능합니다. 이미 운영 데이터가 있으면 서버가 덮어쓰기를 거부합니다.

Realtime은 트랜잭션 마지막의 대회 revision 변경을 구독합니다. 연결 실패 시에도 페이지 진입, 포커스·온라인 복귀, 새로고침, 30초 주기 재조회가 동작합니다. 중복 요청과 오래된 응답의 역전 반영을 방지합니다.

## 코드 구조

- `src/lib/supabaseClient.js`: 공개 환경변수 검사·클라이언트
- `src/services/supabaseTournament.js`: Supabase 읽기·쓰기·구독, 오류 변환, 백업·가져오기
- `src/services/tournamentStorage.js`: 기존 검증·수정 계획·데모, 읽기 전용 레거시 백업 접근
- `src/context/AuthContext.jsx`: 세션·권한 확인·로그인·로그아웃
- `src/context/TournamentContext.jsx`: 비동기 조회·저장·자동 갱신·알림
- `src/admin/AdminGuard.jsx`, `src/components/DataState.jsx`: 인증·권한·연결·빈 데이터 UI
- `src/utils/`: 기존 세트 검증·순위·대진 계산
- `src/pages/`, `src/admin/`, `src/components/`, `src/styles.css`: 기존 화면 및 반응형 UI
- `supabase/`: 사용자 검토·실행용 SQL
- `src/**/*.test.js`, `tests/`: 로직·로컬 DB·브라우저 자동 테스트

## 테스트와 빌드

```powershell
npm test
npm run build
npm run test:e2e
```

브라우저 테스트는 Google Chrome과 테스트용 5174 포트를 사용합니다. 테스트 전용 Auth/HTTP 모의 응답과 실제 로컬 PostgreSQL 엔진(PGlite)에서 SQL을 검증하며, 실제 Supabase나 사용자 브라우저 데이터에 접근하지 않습니다. 5173 개발 서버를 별도로 켜지 않아도 테스트 서버가 자동 실행됩니다. Node 24.13.0에서 종료 문제가 있으면 [설정 문서의 Node 22 명령](docs/SUPABASE_SETUP.md#8-로컬-자동-테스트와-실제-프로젝트-검증의-구분)을 사용하세요.

## 배포 준비

GitHub: https://github.com/kjy7388/volleyball_tournament

Vercel 프로젝트 `volleyball-tournament`에서 Framework `Vite`, Build `npm run build`, Output `dist`, Node `22.x`와 아래 두 환경변수를 설정하면 됩니다.

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

`vercel.json`은 React Router 직접 접근·새로고침을 위한 SPA fallback을 유지합니다. 배포 전에 실제 프로젝트 RLS·관리자 권한·공개 선수 명단·Auth 설정을 확인하세요. 운영 배포는 기존 저장소 main의 Push에 연결된 기존 Vercel 프로젝트를 사용합니다. SQL은 자동 재실행하지 않으며 기존 MAD FC 프로젝트는 수정하지 않습니다.
