# 배구·피구 통합 운영 전환

이 문서는 로컬 개발 결과를 실제 프로젝트에 적용하기 위한 검토 절차입니다. 초기 개발 단계에서는 원격 SQL 실행·Push·배포를 하지 않았습니다. 이후 사용자가 기존 프로젝트에 002 적용 및 localhost 관리자 기능 확인을 완료했습니다. 배포 전 읽기 전용 확인에서도 DB 버전 2와 두 종목의 조회가 확인되었습니다. **현재 프로젝트에 001·002를 다시 실행하지 마세요.** 운영 계정과 기존 Supabase 프로젝트를 그대로 사용합니다.

## 구조와 호환

- `/volleyball`, `/dodgeball` 아래에 홈·groups·bracket·schedule·teams를 제공합니다. 관리자는 `/admin/volleyball`, `/admin/dodgeball` 아래에서 teams·matches·settings를 사용합니다.
- 기존 `/`, `/groups`, `/bracket`, `/schedule`, `/teams`, `/admin`, `/admin/teams`, `/admin/matches`, `/admin/settings`는 배구 새 주소로 `replace` 이동합니다. AuthProvider는 종목 전환 시 재생성하지 않습니다.
- `tournaments.id`는 `volleyball-cup`/`dodgeball-cup`, `sport`는 volleyball/dodgeball입니다. 기존 복합 PK/FK `(tournament_id,id)`를 활용하여 같은 반 ID여도 선수·결과·Revision·감사 이력은 종목별로 분리됩니다.
- 배구는 기존 `match_sets`의 숫자 점수를 그대로 사용합니다. 피구는 새 `match_rounds`의 `winner_side`만 저장합니다. 피구에 숫자 점수나 생존 인원을 저장하지 않습니다. 프런트엔드에서는 `rounds: [{winner: 'home'|'away'|null}]` 5개로 표현합니다.
- 백업 `schemaVersion:1`은 하위 호환되는 공통 외형입니다. `sport` 추가 및 피구 전용 rounds 모델은 `get_sports_schema_version()=2`로 지원 여부를 확인합니다. 구 배구 JSON 백업도 읽을 수 있습니다. 다른 종목 백업을 선택한 대회에 저장하면 거부합니다.
- 데이터 원본은 Supabase뿐입니다. 종목별 Provider 인스턴스가 조회·구독·Revision·편집 상태를 분리합니다. 전환하면 저장하지 않은 편집은 닫히므로 먼저 저장하세요. 로그인 세션은 유지됩니다. 저장 중 같은 요청은 중복 실행하지 않으며 서버는 예상 Revision을 비교합니다.
- Realtime은 해당 대회의 tournaments revision만 구독합니다. 연결 실패 시 페이지 진입, 포커스, 온라인 복귀, 30초 간격 재조회가 유지됩니다. 늦게 도착한 이전 종목 응답은 새 종목에 반영하지 않습니다.

## 판정과 운영

피구는 미진행/홈팀 승리/원정팀 승리를 선택합니다. 앞 판 승자를 변경하면 이후 판 입력을 비우며, 3승 또는 앞 판 미입력 상태에서는 다음 판을 비활성화합니다. 임시 저장은 순위에서 제외합니다. 결과 확정은 3:0·3:1·3:2만 가능하며 확인창 후 저장합니다. 확정 결과도 재입력하거나 임시 저장으로 변경하여 확정을 취소할 수 있습니다.

배구 순위는 승수→세트 득실→득실점→상대 전적, 피구는 승수→판 득실→상대 전적입니다. 순환 동률은 미확정으로 남습니다. 관리자는 자동 기준으로 구분되지 않은 동률 집단 안에서만 순서를 정할 수 있으며 공개 순위표에 ‘관리자 확정’을 표시합니다. 두 조의 6경기가 모두 확정되고 동률이 해소된 뒤 준결승을 배정합니다. 준결승 확정 후 결승, 결승 확정 후 우승을 표시합니다.

결선 참가 반이 바뀌면 이미 진행된 경기 ID를 영향 목록으로 제시합니다. 저장 RPC는 해당 ID에 대한 명시적 확인 없이는 기록 변경을 거부합니다. 확인한 경우에만 영향받는 경기 결과를 새 대진의 예정 상태로 바꾸고 변경 전 스냅샷을 비공개 이력에 보관합니다. 종목별 데모/초기화도 확인창을 거치며 다른 대회는 건드리지 않습니다.

피구 DB가 비어 있을 때만 ‘배구 참가 반·선수 명단으로 최초 생성’을 사용할 수 있습니다. 명단을 조회한 뒤 확인창에서 등록합니다. 선수·조 편성만 복사하며 일정과 경기 결과는 복사하지 않습니다. `initialize`와 대회별 잠금으로 동시 최초 생성도 기존 데이터를 덮어쓰지 않습니다. 이미 피구가 생성되면 이 기능을 표시하지 않습니다.

## 적용 전 백업과 검토

1. 관리자 입력을 잠시 중지하고 현재 배포 커밋·환경변수 이름을 기록합니다. 환경변수 값은 문서/Git에 쓰지 않습니다.
2. 관리자의 JSON 백업 버튼으로 배구 스냅샷을 내려받아 6반·9경기·Revision을 확인합니다. JSON에는 선수 이름이 있으므로 공개 저장소에 올리지 않습니다.
3. Supabase 제공 DB 백업 또는 소유자 권한 `pg_dump`로 **스키마·테이블·정책·함수·비공개 이력·관리자 권한 테이블까지** 복구 가능한 SQL 백업을 만듭니다. 비밀번호를 CLI 인자·소스에 기록하지 마세요. Auth 계정은 제공되는 백업 범위와 별도 복구 절차를 확인합니다.
4. `supabase/checks/multi_sport_preflight.sql`을 검토 후 SQL Editor에서 읽기 전용으로 실행합니다. 기존 함수가 001과 다른 경우 차이를 검토하고 중단합니다. 공개 API로 내려받는 JSON만으로 실제 서버의 모든 함수·정책이 001과 같다고 단정할 수 없습니다.
5. 백업 파일의 실제 복구 가능성을 격리 환경에서 확인합니다. 이번 로컬 테스트는 PGlite에 001 데이터가 있는 상태에서 002 업그레이드·재실행·보존을 검증합니다. 실제 서버 전체 백업의 복구 검증을 대체하지 않습니다.
6. 사용자 승인을 받은 다음에만 다음 단계로 진행합니다.

개발 시 소스 ZIP·환경파일·공개 배구 JSON 백업은 저장소 밖 `../volleyball-multisport-backup-20261101/`에 보관했습니다. 환경파일이 포함된 개인 백업 폴더이므로 업로드하지 마세요. 이는 전체 DB/정책/Auth 백업을 대체하지 않습니다.

## 승인 후 SQL 적용 순서

1. 기존 프로젝트 `bkfluqugazkimgipbrle`의 SQL Editor에서 **002_multi_sport_tournament.sql만** 검토 후 실행합니다. 001을 다시 실행하면 함수가 구 버전으로 돌아갈 수 있으므로 재실행하지 마세요.
2. 002는 트랜잭션 안에서 sport 컬럼·match_rounds·읽기 정책·종목 검증 trigger·RPC를 확장합니다. 배구에 고정된 id/set_rules CHECK 두 개만 종목별 CHECK로 교체합니다. 예상과 다른 CHECK는 `SCHEMA_DRIFT_REVIEW_REQUIRED`로 중단하며 트랜잭션을 롤백해야 합니다. 기존 RLS 정책, 관리자 계정, 경기·선수, Revision은 삭제하지 않습니다. DROP TABLE/TRUNCATE/자동 seed는 없습니다.
3. `select public.get_sports_schema_version();` 결과 2, 배구 조회 전후 6반·9경기·Revision·점수·선수 일치를 확인합니다. `supabase/checks/verify_permissions.sql` 및 preflight 권한 결과도 비교합니다. match_rounds는 공개 SELECT만 가능하고 직접 DML은 관리자에게도 열지 않습니다. 쓰기는 권한 검증된 save_tournament RPC만 허용합니다.
4. 기존 관리자 계정으로 `/admin/dodgeball`에 접속하여 빈 대회에 최초 샘플 등록 또는 배구 명단 복사를 선택하고 확인합니다. 새 계정/프로젝트는 만들지 않습니다.
5. 테스트 결과를 입력하기 전 현재 배구·피구를 각각 백업합니다. 임시 저장·확정·다른 브라우저 조회·로그아웃 후 쓰기 차단을 실제 환경에서도 점검합니다. 테스트 데이터 초기화는 별도 사용자 확인 후 종목별로 진행합니다.

오류가 나면 SQL 트랜잭션을 롤백하고 사용자에게 원인을 보고합니다. 성공한 마이그레이션을 되돌리기 위해 임의로 테이블/피구 데이터를 삭제하거나 001을 덮어 적용하지 마세요. 실제 데이터가 보존된 백업과 승인된 복구 절차를 사용합니다.

002는 기존 배구 클라이언트의 조회·저장 외형을 유지합니다. sport 필드가 없는 기존 배구 JSON은 계속 허용하며 배구 숫자 점수도 그대로입니다. 프런트엔드에 문제가 있을 경우 우선 이전 프런트엔드로 돌아가 배구를 운영할 수 있도록 설계했습니다. DB의 신규 구조를 삭제하는 방식으로 되돌리지 않습니다. 비공개 이력 스키마 이름 `volleyball_private`는 기존 백업 보존을 위해 유지하지만 내부 이력은 tournament_id로 두 종목을 구분합니다.

## 로컬 실행과 검증

```powershell
cd "C:\Users\김장엽\Desktop\Yeop\VS Code\volleyball tournament"
npm install
npm run build
npm test
npm run test:e2e
npm run dev
```

Node 22.23.4 권장(`.nvmrc`). 시스템 Node 24.13.0에 Windows 프로세스 종료 문제가 있는 경우 Node 22에서 명령을 실행합니다. localhost 기본 주소는 http://127.0.0.1:5173 입니다. 배구 홈 `/volleyball`, 피구 홈 `/dodgeball`, 관리자 `/admin/volleyball` 및 `/admin/dodgeball`입니다. 실제 DB에 002를 적용하기 전 피구에는 마이그레이션 필요 안내가 나오는 것이 정상입니다.

Playwright는 별도 5174 포트와 가짜 Supabase URL을 사용하며 PGlite에서 실제 SQL/RPC/RLS를 실행합니다. 실제 Supabase 로그인과 경기 기록을 변경하지 않습니다. 테스트 실행 중 파일을 수정하면 Vite HMR이 로그인 상태를 재생성할 수 있으므로 테스트 완료 후 변경하세요. 브라우저 검증 캡처는 무시된 test-results 폴더에 생성됩니다.

## 후속 Push·배포

검토와 실제 적용 승인을 받은 후 빌드/테스트를 재실행하고 변경 파일을 확인해 기존 저장소 main에 일반 Commit/Push합니다. 초기 개발 단계에서는 Commit/Push하지 않았으며 배포는 별도 승인된 요청에 따라 진행합니다. 기존 Vercel 프로젝트만 사용하며 환경변수 이름은 `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` 그대로입니다. Secret/service_role 키는 프런트엔드에 넣지 않습니다. 기존 SPA rewrite가 종목별 새 경로도 처리합니다. SQL 적용과 데이터 보존 확인을 마친 뒤 배포하고, 직접 URL 새로고침·모바일·실제 인증·Realtime 및 재조회·RLS를 확인합니다.
