# 선수 등록 상한 해제 — 005 적용 안내

작성일: 2026-11-02. 이번 변경은 로컬 코드·SQL·테스트만 작성했습니다. 실제 Supabase SQL 실행, 선수·경기 데이터 변경, Git Commit/Push, Vercel 배포, MAD FC 접근은 하지 않았습니다.

현재 배포 사전 점검: 사용자가 004·005 적용을 완료했고, 실제 Data API에서 등록 5·경기 형식 4·배구 점수 4·통합 2를 확인했습니다. 에이전트는 원격 SQL을 실행하지 않았습니다. 아래 내용은 로컬 개발·적용 절차 기록이며, 이미 적용된 001~005를 재실행하지 않습니다.

## 변경 내용

- 배구·피구 모두 홈페이지 등록 선수 수의 상한을 제거했습니다. 10·11·15·101명 저장을 로컬에서 검증했습니다.
- 경기 운영 기준 10명, 피구 잔여 인원 0~10명, 경기 규칙·승점·순위는 유지합니다.
- 10명 이상에서도 ‘선수 추가’를 활성화합니다. 부족·정원 초과 경고 대신 ‘등록 선수 N명’을 표시하고, 카드·명단은 기존 자동 높이로 늘어납니다.
- 기존 명단의 이름·ID·순서와 경기 기록을 자동 변경하지 않습니다. 새 선수는 명단 끝에 추가합니다. 기존의 명시적 수정·삭제 기능은 그대로입니다.
- 선수 수 검증만 제거합니다. 이름·ID·중복·소속 검증, 관리자 권한, RLS, Revision 충돌, 종목별 저장 잠금, 원자적 저장과 기존 2MB 요청 크기 보호는 유지합니다. 요청 크기 보호는 선수 수 기준 상한이 아닙니다.

## SQL 변경

파일: `supabase/migrations/005_unlimited_roster_registration.sql`.

004를 수정하거나 재실행하지 않습니다. 005는 다음 사항만 변경합니다.

1. 검토한 004/005의 `volleyball_private.validate_snapshot(jsonb)` 정의인지 확인합니다. 공백을 정규화한 본문 해시가 예상과 다르면 `SCHEMA_DRIFT_REVIEW_REQUIRED`로 중단합니다.
2. 알려진 `public.players.roster_limit_10` 트리거와 `volleyball_private.check_roster_limit()` 함수를 제거합니다. 트리거 대상 함수가 다르거나 예상 밖 의존성이 있으면 중단하며 CASCADE를 사용하지 않습니다.
3. 기존 스냅샷 검증 함수에서 선수 배열의 `>10` 조건만 제거합니다. 과거 001·002의 100명 조건도 현재 활성 함수에는 남기지 않습니다.
4. 읽기 전용 `get_roster_registration_version()` = 5 확인 함수를 추가합니다. 경기 형식 4·배구 점수 4·통합 2·JSON 버전 2는 그대로입니다.

선수·반·대회·경기 행과 Revision, 기존 RLS 정책·관리자 계정·감사 이력에는 DML을 하지 않습니다. 오류 시 트랜잭션 전체가 롤백됩니다. 같은 005의 재실행도 데이터와 순서를 변경하지 않습니다.

## 프런트엔드 호환성

004 서버의 기존 10명 검증에 11명 이상을 보내지 않도록, 초과 등록 저장 시에만 새 버전 확인 함수를 조회합니다. 005가 확인되지 않으면 입력을 보존하고 적용 필요 오류를 보여주며 저장 RPC를 호출하지 않습니다. 이 확인은 등록 인원 상한이 아니며, 005 확인 후에는 인원 수로 저장을 막지 않습니다. 10명 이하의 조회·저장은 기존 방식으로 동작합니다.

## 실제 적용 방법 — 사용자 검토·승인 후

1. 기존 DB 백업과 종목별 JSON 백업을 확보하고 현재 선수 수·순서·Revision을 확인합니다.
2. SQL Editor에서 005 파일 전체를 검토하고 **005만** 실행합니다. 기존 001~004는 다시 실행하지 않습니다. 에이전트가 이번 작업에서 원격 실행한 SQL은 없습니다.
3. 다음 읽기 전용 결과를 확인합니다.

```sql
select public.get_roster_registration_version(); -- 5
select public.get_competition_format_version(); -- 4
select public.get_volleyball_scoring_version(); -- 4
select public.get_sports_schema_version(); -- 2

select count(*) as old_roster_trigger_count
from pg_trigger
where tgrelid = 'public.players'::regclass
  and tgname = 'roster_limit_10'; -- 0

select t.id, t.revision, count(p.id) as registered_players
from public.tournaments t
left join public.players p on p.tournament_id = t.id
group by t.id, t.revision;
```

4. Data API에서도 새 확인 함수가 5를 반환하는지 확인합니다. 기존 선수 수·명단 순서·경기 결과·Revision은 SQL 적용 전과 같아야 합니다.
5. 별도 승인으로 새 프런트엔드를 배포한 후 초과 등록을 시작합니다. 구 프런트엔드에는 10명 검증이 남아 있으므로 새 앱 배포 전에 운영 명단을 11명 이상으로 늘리지 않습니다.
6. 오류가 나면 강제로 덮어쓰거나 004를 재실행하지 말고 실제 함수·트리거 정의와 의존성을 확인합니다. 이름이 비슷한 다른 트리거를 임의로 제거하지 않습니다.

## 주요 파일

- `src/admin/TeamManager.jsx`: 추가 버튼과 등록 인원 표시
- `src/admin/AdminDashboard.jsx`, `src/components/CompetitionRuleNotice.jsx`: 운영 기준과 등록 인원을 구분하는 안내
- `src/services/tournamentStorage.js`: 프런트엔드·JSON 복원 인원 상한 제거
- `src/services/supabaseTournament.js`: 005 미적용 서버에 초과 등록 저장 방지·입력 보존
- `src/utils/competitionRules.js`: 운영 기준 상수 명칭 정리
- 005 SQL, `src/services/unlimitedRoster.test.js`, `tests/unlimited-roster.spec.js`, 기존 관련 테스트·fixture

004 자체를 검증하는 과거 마이그레이션 테스트는 당시 10명 제한 기대값을 유지합니다. 현재 앱·005 테스트는 제한 해제를 검증합니다. 테스트는 삭제하지 않았습니다.

## 검증 결과

| 검사 | 결과 |
| --- | --- |
| 관련 단위·PGlite | 12개 통과 |
| 관련 브라우저 | 3개 통과 |
| 최종 전체 단위·DB | 201개 통과 |
| 빌드 | 성공 |
| 최종 전체 브라우저 | 71개 통과 |
| 최종 경기 시뮬레이션 | 6개 통과 |

최종 전체 검증은 총 **278개 통과, 실패 0개**입니다. 전체 단위·DB, 브라우저, 시뮬레이션은 각각 1회 실행했습니다.

005 적용 전후 명단·순서·Revision·정책·관리자·비공개 감사 이력 보존, 양 종목 10/11/15/101명 저장·JSON 복원, 경기·순위 보존, 종목 독립성, Revision 충돌·무권한 저장 거부를 확인했습니다. 예상 밖 검증 함수에서는 트리거 제거 전에 롤백되는 것도 확인했습니다.

전체 검사는 마지막에 각각 한 번만 실행합니다. 실제 Supabase 005 적용·운영 저장·실제 Auth/Realtime과 배포는 이번 범위에서 미검증입니다. 운영 Smoke Test는 기대값만 갱신했으며 실행하지 않았습니다.
