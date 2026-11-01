# Supabase 연결·관리자 인증 설정

> **통합 버전 안내:** 이 문서의 001·최초 관리자 생성 절차는 빈 DB를 처음 설정할 때만 사용합니다. 기존 프로젝트는 계정과 데이터를 유지하고 [MULTI_SPORT_UPGRADE.md](MULTI_SPORT_UPGRADE.md)의 백업·점검·승인 후 **002만** 적용하세요. 업그레이드 후 001을 다시 실행하지 마세요.

대상: `bkfluqugazkimgipbrle` / GitHub `kjy7388/volleyball_tournament`.

이 문서는 사용자가 검토·실행하는 절차입니다. 개발 작업 중 원격 SQL 실행, 실제 키 입력, 원격 DB 생성·변경, GitHub Push, Vercel 배포는 하지 않았습니다. 현재 로컬 코드와 SQL이 준비된 상태이며, 아래 설정을 마쳐야 실제 프로젝트에 연결됩니다.

## 1. 기존 데이터부터 백업

기존에 사용하던 **같은 브라우저 프로필과 같은 주소**(localhost/127.0.0.1 구분)에서 앱을 열고 ‘기존 localStorage 백업’을 누르세요. 이 버튼은 연결 설정 안내, 빈 대회 안내, 관리자 대시보드에서 사용할 수 있습니다. 설정이 없어도 백업할 수 있습니다.

- 기존 키 `volleyball-cup:data:v1`은 읽기만 합니다. 자동 초기화·삭제·업로드하지 않습니다.
- Auth는 로그인 세션을 브라우저에 저장합니다. 이는 대회 데이터의 로컬 저장과 다릅니다.
- DB가 이미 운영 중이면 별도로 Supabase Dashboard에서 DB 백업을 준비하세요. 마이그레이션을 운영 프로젝트에 적용하기 전에 SQL을 검토하세요.

## 2. SQL Editor에서 마이그레이션 실행

1. [대상 Supabase Dashboard](https://supabase.com/dashboard/project/bkfluqugazkimgipbrle)를 엽니다.
2. SQL Editor에서 `supabase/migrations/001_initial_schema.sql` 전체를 검토한 뒤 실행합니다.
3. Table Editor에서 `tournaments`, `teams`, `players`, `matches`, `match_sets`, `tournament_admins` 생성과 RLS 활성화를 확인합니다.
4. Project Settings의 Data API가 활성화되어 있고, `public`이 노출 스키마에 포함되어 있는지 확인합니다. `volleyball_private`는 **노출하지 마세요**.
5. 초기 대회 레코드가 비어 있는 것은 정상입니다. 샘플은 SQL에 자동 삽입되지 않습니다.

SQL은 하나의 트랜잭션이며, 재실행 시 호환되는 기존 테이블과 레코드를 유지합니다. 정책은 존재하지 않을 때만 생성합니다. `DROP`이나 `TRUNCATE`를 실행하지 않습니다. 같은 이름의 다른 구조가 이미 있으면 적용이 실패할 수 있습니다. 이 경우 기존 테이블을 삭제해서 해결하지 말고 스키마 차이를 먼저 검토하세요.

`Automatically expose new tables` 설정에 의존하지 않습니다. 공개 테이블 SELECT와 RPC 실행 권한을 명시적으로 부여합니다. `tournament_admins`에는 클라이언트 SELECT/DML 권한을 주지 않습니다. 관리 권한은 인자가 없는 `is_tournament_admin()`으로 본인 여부만 확인합니다.

## 3. 최초 관리자 계정과 권한 등록

1. Authentication → Users → Add user에서 이메일·비밀번호 계정을 수동 생성합니다. 필요한 경우 이메일 확인을 완료한 계정으로 만드세요. 사용자에게 비밀번호를 안전한 경로로 전달하고 소스·SQL에 적지 마세요.
2. 생성한 사용자의 **Auth User ID(UUID)** 를 복사합니다.
3. `supabase/admin/register_first_admin.sql`의 `target_user`를 실제 UUID로 바꾼 뒤 SQL Editor에서 실행합니다. 기본값 `00000000-...`는 실수로 실행되지 않도록 오류를 냅니다.
4. `/admin`에서 해당 이메일·비밀번호로 로그인합니다.

로그인 성공만으로는 관리자 권한이 생기지 않습니다. `tournament_admins.user_id`에 등록되어야 합니다. 사이트에 회원가입 UI는 없으며, Supabase Auth의 **Allow new users to sign up을 비활성화**하세요. 일반 관리자에게 다른 관리자를 추가·조회·삭제하는 API 권한도 주지 않습니다. 권한 부여·회수는 프로젝트 소유자가 SQL Editor에서만 수행합니다.

권한 회수 예시(SQL Editor에서 실제 UUID를 확인한 뒤 직접 실행):

```sql
-- delete from public.tournament_admins where user_id = 'REPLACE_WITH_REAL_AUTH_UUID';
```

브라우저는 권한을 주기적으로 재확인합니다. 회수 직후 화면이 남더라도 모든 저장 RPC는 서버에서 현재 권한을 다시 검사하므로 저장할 수 없습니다.

## 4. 환경변수 입력

Project Settings → API 또는 API Keys에서 아래 두 값을 복사하세요.

| 변수                            | 입력값                                                                 |
| ------------------------------- | ---------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`             | 프로젝트 URL, 이 프로젝트는 `https://bkfluqugazkimgipbrle.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_`로 시작하는 Publishable Key                           |

`.env.example`을 프로젝트 루트의 `.env.local`로 복사하고 실제 Publishable Key를 **직접** 넣으세요. 예시 키로는 연결되지 않습니다. 저장 후 Vite 서버를 다시 시작해야 합니다.

Vite의 `VITE_` 값은 빌드 결과와 브라우저에 공개됩니다. DB 비밀번호, `service_role`, `sb_secret_` 키는 절대 넣지 마세요. 클라이언트 설정 검사도 공개 키 형식만 허용하며, JWT 형식의 과거 anon/service_role 키는 사용하지 않습니다. `.env.local`은 Git에서 제외됩니다.

## 5. 실행과 최초 데이터 등록·복원

권장 런타임은 Node 22.23.4입니다(`.nvmrc`). 프로젝트 폴더에서:

```powershell
npm install
npm run dev
```

- 홈페이지: http://localhost:5173
- 관리자: http://localhost:5173/admin

설정 누락 시 흰 화면 대신 설정 안내를 표시합니다. SQL 누락이나 네트워크 오류는 재시도 화면을 표시합니다. SQL은 적용했지만 대회가 없으면 ‘등록된 대회가 없습니다’가 정상입니다.

최초 로그인 후 **다음 중 하나만** 선택하세요.

- ‘최초 샘플 데이터 등록’: A조 1·2·3반, B조 4·5·6반, 가상 선수, 예정 9경기를 확인 후 등록합니다.
- ‘JSON 백업으로 최초 복원’: 기존 localStorage에서 다운로드한 JSON을 선택하고 미리 표시되는 반·경기 수와 데모 여부를 확인한 뒤 등록합니다.

동시에 다른 관리자가 최초 등록했거나 기존 데이터가 있으면 서버가 `ALREADY_EXISTS`로 거부합니다. 복원 UI는 비어 있는 DB에만 표시됩니다. 기존 DB에 임의로 덮어쓰는 가져오기는 지원하지 않습니다.

관리자 대시보드의 데모·초기화는 공용 데이터를 변경하는 운영 작업입니다. **모든 사용자 화면에 반영됨**을 확인창으로 경고하며, 확인해야만 실행합니다. 기존 데이터는 RPC가 비공개 `volleyball_private.tournament_history`에 revision별 JSON으로 보관합니다. 이 감사 이력은 브라우저에 공개하지 않습니다. 복구가 필요하면 소유자가 SQL Editor에서 백업을 조회·검토한 뒤 별도로 처리해야 합니다. 현재 UI에서 과거 DB 이력을 자동 복구하지 않습니다.

## 6. DB 모델과 저장 경로

- 앱의 기존 고유 텍스트 ID를 유지합니다. `team-1`, `sf-1` 등의 ID를 UUID로 임의 변경하지 않습니다. 관련 테이블은 `(tournament_id, id)` 복합키와 FK를 사용합니다.
- 선수 정렬, 예시 일정, 장소, 수동 동률 순위, 당시 세트 규칙, 대회 revision을 추가로 저장합니다.
- DB의 `get_public_tournament`가 정규화된 테이블을 기존 camelCase JSON 구조로 변환합니다. 한 SQL 문장이므로 여러 테이블을 서로 다른 시점에 읽는 문제가 없습니다. JS의 기존 검증·순위·브래킷 함수를 그대로 사용합니다.
- `save_tournament`는 전체 9경기 스냅샷을 한 번에 검증하고 반·선수·경기·세트를 하나의 트랜잭션으로 갱신합니다. 테이블을 여러 HTTP 호출로 나눠 저장하지 않습니다.
- advisory lock과 행 잠금으로 같은 대회 저장을 직렬화하고, `revision` 비교로 오래된 관리자의 저장을 거부합니다. 임의 자동 병합이나 오래된 데이터의 자동 재시도는 하지 않습니다. 충돌 안내 후 최신 내용을 확인하고 다시 입력하세요.
- 서버에서도 실제 종료 가능한 세트 점수, 3세트 선승, 미확정 승자 금지, 팀 수·조 인원, 중복 경기, 동률·준결승·결승 연결을 검증합니다. 이미 기록된 경기 변경·초기화는 확인한 경기 ID 목록도 검사합니다. 실패하면 전체 변경과 감사 기록도 롤백됩니다.
- 직접 테이블 쓰기는 관리자에게도 허용하지 않습니다. 인증된 지정 관리자만 전용 RPC를 실행할 수 있습니다. 이는 우회 쓰기로 경기와 세트가 불일치하는 것을 막기 위한 의도적인 제한입니다. SQL Editor의 소유자 권한은 별도이므로 운영 중 직접 테이블 편집을 피하세요.
- 조는 `group_slot` 1~3의 유일 제약으로 최대 3개 반을 유지하며, RPC에서는 조마다 정확히 3개 반을 요구합니다. 한 경기의 세트 번호는 1~5로 제한하고 중복을 금지합니다. 참가 반·경기는 삭제 대신 고유 ID를 유지해 대진을 재설정합니다. 선수 삭제는 관리자 입력에 따라 처리하고 이전 JSON은 감사 기록에 남깁니다.
- 경기의 실제 일시는 한국 학교 일정 기준 **Asia/Seoul**로 해석해 timestamptz에 저장합니다. 화면 입력값은 같은 한국 날짜·시간으로 반환합니다. 연도·시간 미정인 초기 예시는 실제 timestamp로 저장하지 않습니다.

## 7. 실시간 갱신과 장애 시 동작

SQL은 Supabase Realtime publication이 있으면 `tournaments`를 등록합니다. revision이 트랜잭션 마지막에 변경되므로 이 테이블의 이벤트 하나로 경기·세트·반·선수·설정 전체를 재조회합니다. 공개 관리자 목록이나 감사 테이블은 구독하지 않습니다.

- 이벤트는 250ms로 묶고, 중복 조회와 오래된 응답의 역전 반영을 방지합니다.
- Realtime 실패 시에도 페이지 진입, 탭 포커스 복귀, online 복귀, 새로고침, 표시 중인 탭의 30초 주기 조회로 갱신합니다.
- 조회 실패 시 마지막 결과가 있다면 안내 배너와 함께 유지합니다. 최초 조회 자체가 실패한 경우 오류·재시도를 표시합니다.
- 저장 실패를 성공으로 표시하지 않습니다. 편집창은 유지하며 재시도할 수 있습니다. 세션/권한 오류는 다시 로그인·권한 확인을 요구합니다.
- 다른 관리자의 갱신이 도착해도 편집 중 입력을 자동으로 덮어쓰지 않습니다. 오래된 저장은 서버에서 거부하고, 최신 데이터로 다시 편집할 수 있게 안내합니다.

## 8. 로컬 자동 테스트와 실제 프로젝트 검증의 구분

```powershell
npm test
npm run build
npm run test:e2e
```

브라우저 테스트는 설치된 Google Chrome을 사용하고, 별도 5174 포트에서 테스트 전용 환경변수로 Vite를 자동 실행합니다. 실제 `.env.local`이나 Supabase 프로젝트를 사용하지 않습니다. 모의 Auth/HTTP 요청과 실제 로컬 PostgreSQL 엔진(PGlite)에서 마이그레이션/RPC/RLS를 실행합니다. 실제 데이터나 사용자의 브라우저 프로필은 바뀌지 않습니다. 5174가 사용 중이면 해당 테스트 서버를 먼저 종료하세요.

이 PC의 Node 24.13.0에서 빌드·테스트 프로세스 비정상 종료가 관찰된 이력이 있습니다. Node 22 LTS 사용을 권장합니다. 전역 버전을 바꾸지 않으려면 `npx --yes --package=node@22 node node_modules/vitest/vitest.mjs run`, `npx --yes --package=node@22 node node_modules/vite/bin/vite.js build`, `npx --yes --package=node@22 node node_modules/@playwright/test/cli.js test`로 실행할 수 있습니다.

로컬 통과는 **실제 Supabase Auth/Realtime/Data API/RLS가 설정되었다는 증거가 아닙니다**. SQL과 키를 설정한 뒤 별도 브라우저 프로필로 다음을 직접 확인하세요.

1. 익명 브라우저에서 일반 5개 페이지와 선수·반·결과·순위·대진이 보이는지 확인합니다.
2. 잘못된 로그인 실패, 정상 일반 계정의 관리자 접근 거부, 지정 관리자 로그인과 로그아웃을 확인합니다.
3. 관리자에서 반·선수·조 편성·일정·임시 점수·확정 점수를 수정하고 익명 브라우저에서 동일한 결과를 확인합니다. Realtime을 끈 상태에서도 포커스 복귀·새로고침으로 갱신되는지 확인합니다.
4. 로그아웃 후 직접 관리자 URL과 데이터 변경이 차단되는지 확인합니다.
5. `supabase/checks/verify_permissions.sql`을 SQL Editor에서 검토 후 실행해 grants/RLS를 점검합니다. 이 파일은 데이터 변경을 수행하지 않습니다.
6. 실제 프로젝트의 Data API를 통해 비로그인·일반 계정의 직접 INSERT/UPDATE/DELETE와 관리자 목록 접근이 거부되는지도 확인합니다. 정상 관리자 변경은 반드시 앱/RPC를 사용합니다.

## 9. Vercel 배포 준비와 Push 전 확인

이번 작업은 커밋·Push·배포하지 않습니다. 검토 후 별도로 진행하세요.

- GitHub: `kjy7388/volleyball_tournament`, 브랜치 `main`
- Vercel 프로젝트: `volleyball-tournament`, Framework `Vite`, Build `npm run build`, Output `dist`, Node `22.x`
- Vercel의 Environment Variables에 **같은 두 변수** `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`를 Production/필요한 Preview 환경별로 설정합니다. 변경하면 다시 빌드해야 합니다.
- 기존 `vercel.json`은 SPA fallback을 유지합니다. `/admin`, `/groups`, `/bracket` 등의 직접 접근·새로고침을 배포 후 확인하세요.
- Supabase Auth URL Configuration에서 Site URL과 허용 Redirect URLs를 실제 운영 도메인으로 제한하세요. 현재 로그인은 이메일/비밀번호 방식으로 리디렉션을 사용하지 않지만, 향후 복구·초대 흐름을 위해 필요합니다.
- RLS·권한 검사, 관리자 등록, 불필요한 신규 회원가입 비활성화, 공개 선수 이름의 사용 동의를 확인하세요. demo 데이터를 운영에 남기지 마세요.
- `.env.local`, `.vercel`, DB 비밀번호·Secret/서비스 역할 키가 `git diff --cached`에 없는지 확인하세요. `.env.example`에는 실제 키를 넣지 않습니다. 공개 키를 숨기는 대신 DB 접근 권한을 보호해야 합니다.

## 참고 공식 문서

- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Database functions와 security definer 권한](https://supabase.com/docs/guides/database/functions)
- [Data API 권한 설정](https://supabase.com/docs/guides/api/securing-your-api)
- [Auth 상태 변경](https://supabase.com/docs/reference/javascript/auth-onauthstatechange)
