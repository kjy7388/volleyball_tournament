# VOLLEYBALL CUP

6개 반의 배구 토너먼트 운영 웹사이트입니다. React + Vite, JavaScript/JSX, React Router, Lucide React, Supabase Auth·PostgreSQL·Realtime을 사용합니다. 기존 홈·순위표·대진표·일정·선수·관리자 디자인과 경기 계산 로직을 유지했습니다.

## 시작하기

권장 Node.js: **22.23.4 LTS** (`.nvmrc`).

```powershell
cd 'C:\Users\김장엽\Desktop\Yeop\VS Code\my-app\volleyball tournament'
npm install
```

1. [Supabase 설정 안내](docs/SUPABASE_SETUP.md)에 따라 SQL을 검토하고 직접 실행합니다.
2. `.env.example`을 `.env.local`로 복사하고 실제 프로젝트 URL·Publishable Key를 직접 입력합니다. 서버 키는 사용하지 않습니다.
3. Supabase Dashboard에서 Auth 사용자를 생성하고 관리자 등록 SQL에 실제 Auth User ID를 입력해 직접 실행합니다.
4. `npm run dev`를 실행합니다. 환경변수 변경 후에는 서버를 다시 시작하세요.

- 홈페이지: http://localhost:5173
- 관리자: http://localhost:5173/admin
- 설정이 없으면 안내 화면이 표시됩니다. 데이터는 자동으로 생성·삭제·덮어쓰기하지 않습니다.
- DB가 비어 있으면 관리자 로그인 후 샘플 최초 등록 또는 기존 JSON 백업으로 최초 복원을 선택할 수 있습니다.

## SQL과 운영 문서

| 파일                                                                 | 용도                                                                             |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [001_initial_schema.sql](supabase/migrations/001_initial_schema.sql) | 테이블, 제약, RLS, grants, 권한 확인, 조회·원자적 저장 RPC, Realtime publication |
| [register_first_admin.sql](supabase/admin/register_first_admin.sql)  | 프로젝트 소유자가 실제 Auth UUID로 최초 관리자 등록                              |
| [verify_permissions.sql](supabase/checks/verify_permissions.sql)     | 실제 프로젝트의 RLS·grants를 읽기 전용으로 점검                                  |
| [.env.example](.env.example)                                         | 공개 환경변수 이름·예시                                                          |
| [SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)                          | 백업·SQL 적용·계정 생성·환경변수·복원·실제 검증·Vercel·Push 전 점검              |
| [TEST_RESULTS.md](docs/TEST_RESULTS.md)                              | 로컬 자동 검증 결과와 실제 원격 미검증 범위                                      |

## 데이터와 권한

**Supabase가 유일한 대회 데이터 원본입니다.** 공용 데이터가 없거나 조회가 실패해도 localStorage를 원본으로 대체하지 않습니다. 기존 localStorage는 백업·명시적인 최초 복원용으로 읽기만 하며 삭제하지 않습니다. Auth의 브라우저 세션 저장은 별도로 유지합니다.

일반 사용자는 로그인 없이 공개 데이터만 읽습니다. 로그인 계정 중 `tournament_admins`에 등록된 계정만 변경할 수 있습니다. 관리자 목록은 공개하지 않습니다. 직접 테이블 변경은 관리자에게도 허용하지 않으며, 전용 RPC가 서버 권한·점수·대진·확인된 초기화 목록을 검사하고 하나의 트랜잭션으로 저장합니다. 이전 revision은 비공개 감사 테이블에 보관합니다.

기본 규칙은 25·25·25·25·15점, 2점 차, 3세트 선승입니다. 미확정 경기는 순위에서 제외합니다. 동률은 승수 → 세트 득실 → 득실점 → 상대 전적 순으로 계산하고, 해소되지 않으면 관리자 확인을 요구합니다. 이전 결과 수정으로 결선에 영향이 생기면 확인 후 해당 기록을 초기화합니다. 최신 revision과 다르면 저장을 거부합니다.

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

`vercel.json`은 React Router 직접 접근·새로고침을 위한 SPA fallback을 유지합니다. 배포 전에 실제 프로젝트 RLS·관리자 권한·공개 선수 명단·Auth 설정을 확인하세요. 이번 2차 개발에서는 GitHub Commit/Push·Vercel 배포·원격 DB 변경을 실행하지 않았습니다. 기존 MAD FC 프로젝트는 수정하지 않습니다.
