const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/index-gkLmUwxL.js","assets/chunk-ZSOCVAT7-CUb-ofjX.js","assets/index-1HGZOZkT.js","assets/index-D4YjrTHs.css","assets/pgcrypto-DvQ-zBrc.js","assets/uuid_ossp-B-isMaqZ.js"])))=>i.map(i=>d[i]);
import{_ as P,g as z}from"./index-1HGZOZkT.js";const un=`-- 체험관 가상 부서 데이터 — 실제 직원·업무와 무관한 지어낸 내용이다.
-- 날짜는 '채우는 날(서울 기준 오늘)'에 맞춰 상대값으로 넣는다 → 언제 열어도 이번 주 일정이 보인다.
-- 사람 이름·uid 는 booth/people.ts 와 같아야 한다.

insert into auth.users(id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-00000000b007', 'guest@booth.invalid', '{"name":"김지스트"}'),
  ('00000000-0000-4000-8000-0000000000a1', 'a1@booth.invalid', '{"name":"이서준"}'),
  ('00000000-0000-4000-8000-0000000000a2', 'a2@booth.invalid', '{"name":"박하은"}'),
  ('00000000-0000-4000-8000-0000000000a3', 'a3@booth.invalid', '{"name":"최도윤"}');

insert into public.profiles(id, auth_user_id, name, emp_no, role, status, position) values
  ('00000000-0000-4000-8000-00000000b007', '00000000-0000-4000-8000-00000000b007', '김지스트', 'guest', 'admin', 'active', 'member'),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', '이서준', 'a1', 'admin', 'active', 'lead'),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a2', '박하은', 'a2', 'member', 'active', 'member'),
  ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000a3', '최도윤', 'a3', 'member', 'active', 'member');
`,cn=`-- 가상 데이터 공용 도우미 — 날짜는 '채우는 날(서울 기준 오늘)'에서 n 일 떨어진 날로 넣는다.
--   booth.d(n)          → 'YYYY-MM-DD' (글자 날짜 칸: works.start, notices.posted_date …)
--   booth.dt(n, 'HH:MI') → 'YYYY-MM-DDTHH:MI' (calendar_events.start_at·end_at)
--   booth.ts(n, 'HH:MI') → timestamptz (created_at 등)
--   booth.day(n)        → date (date 칸)
create schema if not exists booth;
create or replace function booth.day(n int) returns date language sql stable as $$
  select (now() at time zone 'Asia/Seoul')::date + n
$$;
create or replace function booth.d(n int) returns text language sql stable as $$
  select to_char(booth.day(n), 'YYYY-MM-DD')
$$;
create or replace function booth.dt(n int, hm text) returns text language sql stable as $$
  select booth.d(n) || 'T' || hm
$$;
create or replace function booth.ts(n int, hm text default '09:00') returns timestamptz language sql stable as $$
  select (booth.d(n) || ' ' || hm)::timestamp at time zone 'Asia/Seoul'
$$;
`,pn=`-- 업무현황 가상 데이터 — GIST 연구지원팀(가상). 실제 직원·업무와 무관한 지어낸 내용이다.
-- 업무 본문은 아래 작은 약식(src)으로 쓰고, 함수가 works.task(평문) 와 works.content_fmt(서식 JSON) 로 바꾼다.
--   첫 줄 = 제목 / ○ 할 일 · ◐ 진행 · ✓ 완료 · · 메모 · ※ 참고 / '# ' 묶음 제목 / 표시 없는 줄 = 본문
--   들여쓰기 2칸 = 한 단계 / 줄 끝 '[-3]' = 완료일(오늘 기준) / 줄 끝 '@이름' = 세부업무 담당자 칩
-- 사람: 김지스트 J(방문자) · 이서준 S(팀장) · 박하은 H · 최도윤 D

-- ── 도우미 함수 ─────────────────────────────────────────
create or replace function booth.w_uid(k text) returns uuid language sql immutable as $$
  select (case k when 'J' then '00000000-0000-4000-8000-00000000b007' when 'S' then '00000000-0000-4000-8000-0000000000a1'
                 when 'H' then '00000000-0000-4000-8000-0000000000a2' else '00000000-0000-4000-8000-0000000000a3' end)::uuid
$$;
create or replace function booth.w_name(k text) returns text language sql immutable as $$
  select case k when 'J' then '김지스트' when 'S' then '이서준' when 'H' then '박하은' else '최도윤' end
$$;

create or replace function booth.w_lines(src text) returns jsonb language plpgsql stable as $$
declare
  ln text; out jsonb := '[]'::jsonb; first boolean := true; sp int; rest text; st text; txt text;
  names text[]; nm text; done_at text; m text[];
begin
  foreach ln in array string_to_array(src, E'\\n') loop
    if first then first := false; continue; end if;
    if btrim(ln) = '' then out := out || jsonb_build_array(jsonb_build_object('blank', true)); continue; end if;
    sp := length(ln) - length(ltrim(ln));
    rest := ltrim(ln);
    st := case left(rest, 1) when '○' then 'todo' when '◐' then 'progress' when '✓' then 'done'
                              when '·' then 'memo' when '※' then 'note' when '⊗' then 'cancel' else null end;
    if st is not null then
      txt := btrim(substr(rest, 2));
    elsif left(rest, 2) = '# ' then
      st := 'head'; txt := substr(rest, 3);
    else
      st := 'text'; txt := rest;
    end if;
    names := '{}';
    while txt ~ '\\s@[^\\s@]+$' loop
      nm := substring(txt from '@([^\\s@]+)$');
      names := array_prepend(nm, names);
      txt := btrim(regexp_replace(txt, '\\s+@[^\\s@]+$', ''));
    end loop;
    done_at := null;
    m := regexp_match(txt, '\\[(-?\\d+)\\]\\s*$');
    if m is not null then
      done_at := booth.d(m[1]::int);
      txt := btrim(regexp_replace(txt, '\\s*\\[-?\\d+\\]\\s*$', ''));
    end if;
    out := out || jsonb_build_array(jsonb_build_object('st', st, 'ind', least(sp / 2, 2), 'txt', txt, 'names', to_jsonb(names), 'done', done_at));
  end loop;
  return out;
end $$;

-- 평문 task: 제목 + 본문 줄(상태 줄은 '- ')
create or replace function booth.wtask(src text) returns text language plpgsql stable as $$
declare l jsonb; res text := split_part(src, E'\\n', 1); line text;
begin
  for l in select * from jsonb_array_elements(booth.w_lines(src)) loop
    if l ? 'blank' then res := res || E'\\n'; continue; end if;
    line := case l->>'st'
      when 'head' then l->>'txt'
      when 'text' then l->>'txt'
      else repeat('  ', (l->>'ind')::int) || '- ' || (l->>'txt') end;
    if jsonb_array_length(l->'names') > 0 then
      line := line || ' (' || (select string_agg(x, ', ') from jsonb_array_elements_text(l->'names') x) || ')';
    end if;
    res := res || E'\\n' || line;
  end loop;
  return res;
end $$;

-- 서식 JSON(content_fmt) — 제목은 빼고 본문만
create or replace function booth.wfmt(src text) returns text language plpgsql stable as $$
declare l jsonb; paras jsonb := '[]'::jsonb; kids jsonb; attrs jsonb; nm text; p jsonb;
begin
  for l in select * from jsonb_array_elements(booth.w_lines(src)) loop
    if l ? 'blank' then paras := paras || jsonb_build_array(jsonb_build_object('type', 'paragraph')); continue; end if;
    kids := jsonb_build_array(jsonb_build_object('type', 'text',
              'text', (l->>'txt') || case when jsonb_array_length(l->'names') > 0 then ' ' else '' end));
    for nm in select jsonb_array_elements_text(l->'names') loop
      kids := kids || jsonb_build_array(jsonb_build_object('type', 'assignee', 'attrs', jsonb_build_object('name', nm)));
    end loop;
    p := jsonb_build_object('type', 'paragraph', 'content', kids);
    if (l->>'st') <> 'head' then
      attrs := jsonb_build_object('itemStatus', l->>'st');
      if (l->>'ind')::int > 0 then attrs := attrs || jsonb_build_object('indent', (l->>'ind')::int); end if;
      if (l->>'st') = 'done' and (l->>'done') is not null then attrs := attrs || jsonb_build_object('doneAt', l->>'done'); end if;
      p := p || jsonb_build_object('attrs', attrs);
    end if;
    paras := paras || jsonb_build_array(p);
  end loop;
  if jsonb_array_length(paras) = 0 then return ''; end if;
  return jsonb_build_object('version', 1, 'doc', jsonb_build_object('type', 'doc', 'content', paras))::text;
end $$;

-- 이 파일이 넣는 기록은 자동 이력(트리거)이 덧붙지 않게 — 이력은 아래에서 직접 넣는다
select set_config('app.work_skip_history', '1', false);

-- ── 프로젝트·트랙 ───────────────────────────────────────
insert into public.projects (id, name, description, sort_order) overriding system value values
  (1, '연구비·예산', '연구비 정산·집행 점검과 팀 예산', 10),
  (2, '과제·협약', '연구과제 협약 체결·평가 지원', 20),
  (3, '교육·행사', '세미나·교육·안전점검 행사', 30),
  (4, '운영·규정', '내부 규정, 인사, 공용 자원 운영', 40);

insert into public.project_tracks (id, project_id, name, sort_order) overriding system value values
  (1, 1, '연구비 정산', 10), (2, 1, '예산 편성·집행', 20),
  (3, 2, '협약·계약', 10), (4, 2, '평가·보고', 20),
  (5, 3, '세미나·워크숍', 10), (6, 3, '안전교육·점검', 20),
  (7, 4, '규정 개정', 10), (8, 4, '인사·근태', 20), (9, 4, '공용 자원·장비', 30);

-- ── 업무 ────────────────────────────────────────────────
-- (num, cat, src, dept, st, plan, ptime, loc, mgr, status, endo, progress, wo, wsince, contact, prio, health, proj, trk, au, upd, chief, remind, rem)
insert into public.works (
  num, cat, task, dept, start, plan, plan_time, loc, mgr, status, end_date, content_fmt,
  progress, waiting_on, waiting_since, last_contact_at, priority, health, project_id, track_id,
  author, owner_uid, created_at, updated_at, chief, remind, remind_at
)
select
  v.num, v.cat, booth.wtask(v.src), v.dept, booth.d(v.st::int),
  case when v.plan is null then '' else booth.d(v.plan::int) end,
  coalesce(v.ptime, ''), coalesce(v.loc, ''), v.mgr, v.status,
  case when v.endo is null then '' else booth.d(v.endo::int) end,
  booth.wfmt(v.src),
  v.progress, v.wo, booth.day(v.wsince::int), booth.day(v.contact::int),
  coalesce(v.prio, 0)::smallint, v.health, v.proj::bigint, v.trk::bigint,
  booth.w_name(v.au), booth.w_uid(v.au),
  booth.ts(least(v.st::int, 0), '09:' || lpad(((v.num * 11) % 50 + 5)::text, 2, '0')),
  case when v.upd::int = 0 then booth.ts(0, '00:' || lpad(((v.num * 7) % 50 + 5)::text, 2, '0'))
       else booth.ts(v.upd::int, lpad((9 + v.num % 9)::text, 2, '0') || ':' || lpad(((v.num * 7) % 60)::text, 2, '0')) end,
  v.chief, v.remind, case when v.rem is null then null else booth.day(v.rem::int) end
from (values
-- ===== 진행중 (1~30) =====
(1, '예산', '2026년 3분기 연구비 정산 점검
# 정산 점검 범위
✓ 과제별 집행 내역 취합 [-12]
◐ 증빙 누락 건 보완 요청 (14건 중 9건 회수) @김지스트
  ○ 미회수 5건은 연구실별 담당자에게 재안내
○ 점검 결과 요약표 작성 후 팀장 검토
※ 재무회계팀 제출 전 사전 확인 필요', '재무회계팀', -40, 3, null, null, '김지스트', '진행중', null, null, null, null, null, 2, 'at_risk', 1, 1, 'S', -1, false, false, null),
(2, '예산', '2027년도 팀 운영예산 편성안 작성
# 편성 방향
✓ 올해 집행 실적 분석 [-9]
◐ 사업별 소요액 산출 (세미나·장비·인건비) @박하은
○ 증액 요청 항목 근거 자료 정리 @이서준
○ 편성안 초안을 팀 회의에서 공유', '재무회계팀', -25, 12, null, null, '이서준, 박하은', '진행중', null, null, null, null, null, 3, 'on_track', 1, 2, 'S', -3, false, false, null),
(3, '예산', '연말 예산 불용 방지 집행 계획
◐ 잔액 현황 점검 (과제 11건)
○ 12월 초까지 집행 가능한 항목 선별 @최도윤
○ 이월·반납 대상 건 분리
· 11월 말 이후 신규 계약은 일정상 어려움', '재무회계팀', -14, 10, null, null, '최도윤', '진행중', null, null, null, null, null, 2, 'at_risk', 1, 2, 'D', -2, true, false, null),
(4, '행정', '신규 협약 체결: 반도체 소재 공동연구 (가상 대학 A)
✓ 협약서 초안 상대 기관에 송부 [-18]
◐ 상대 기관 의견 반영 (비밀유지 조항 수정)
○ 내부 결재 및 직인 날인
○ 체결 후 협약서 사본 보관', '연구처', -30, 9, null, null, '박하은', '진행중', null, null, null, null, null, 2, 'on_track', 2, 3, 'H', -4, false, false, null),
(5, '행정', '연차평가 보고서 취합 (6개 과제)
✓ 작성 양식·일정 안내 메일 발송 [-18]
◐ 과제별 보고서 취합 (4/6 제출)
  ○ 미제출 2건 독촉 @김지스트
  ○ 작성 오류 항목 회신
○ 종합 의견서 작성 @이서준
※ 제출처 시스템 마감 17시 기준', '연구처', -20, 6, null, null, '김지스트, 이서준', '진행중', null, null, null, null, null, 1, 'at_risk', 2, 4, 'S', -1, true, false, null),
(6, '교육세미나', '연구윤리·연구비 관리 교육 운영
✓ 강사 섭외 완료 [-10]
✓ 장소(대강당) 가예약 [-8]
◐ 홍보 포스터·안내 메일 발송 준비 @박하은
○ 사전 신청 접수 폼 작성
○ 참석 확인서 양식 준비', '연구처', -18, 14, '14:00', '대강당', '박하은', '진행중', null, null, null, null, null, 3, 'on_track', 3, 5, 'H', -2, false, false, null),
(7, '교육세미나', '연구 성과 공유 세미나 준비
# 일정·장소
✓ 발표자 6명 확정 [-6]
○ 발표 순서 및 시간표 확정
○ 다과·현수막 발주 @최도윤
○ 사전 안내문 발송', '연구처', -22, 21, '15:00', '본관 세미나실', '최도윤, 박하은', '진행중', null, null, null, null, null, 3, 'on_track', 3, 5, 'D', -5, false, false, null),
(8, '교육세미나', '신입 연구원 안전·보안 교육 계획
○ 교육 대상자 명단 확인
◐ 교육 자료 갱신 (최신 지침 반영) @김지스트
○ 이수 확인 방식 정하기', '안전관리팀', -10, 17, null, null, '김지스트, 박하은', '진행중', null, null, null, null, null, 3, null, 3, 6, 'H', -4, false, false, null),
(9, '행정', '연구실 안전관리 규정 개정(안)
✓ 현행 규정 문제점 정리 [-20]
◐ 개정안 조문 작성 (3장 중 2장)
○ 관련 부서 의견 수렴 @박하은
○ 운영위원회 상정 일정 협의
※ 상위 지침 개정 시행일 이후 적용 예정', '안전관리팀', -35, 20, null, null, '이서준, 박하은', '진행중', null, null, null, null, null, 2, 'on_track', 4, 7, 'S', -3, false, false, null),
(10, '행정', '내부 회계 규정 개정 검토
✓ 개정 필요 조항 목록화 [-14]
○ 재무회계팀과 문구 협의
○ 개정 전후 대비표 작성', '재무회계팀', -28, 25, null, null, '박하은', '진행중', null, null, null, null, null, 3, 'on_track', 4, 7, 'H', -8, false, false, null),
(11, '인사', '연말 인사평가 일정 수립 및 안내
✓ 평가 양식 확정 [-5]
◐ 자기평가서 제출 안내 메일 작성
○ 평가자별 일정 조율', '인사팀', -12, 8, null, null, '이서준', '진행중', null, null, null, null, null, 2, 'on_track', 4, 8, 'S', -2, false, false, null),
(12, '인사', '신규 계약직 연구지원 인력 채용 진행
✓ 채용 공고 게시 [-24]
✓ 서류 심사 (지원 14명) [-12]
◐ 면접 일정 조율 (면접관 3인) @최도윤
○ 합격자 통보 및 근로계약 준비', '인사팀', -30, 7, '14:00', '소회의실', '최도윤', '진행중', null, null, null, null, null, 2, 'at_risk', 4, 8, 'D', -3, false, false, null),
(13, '장비', '공용 분석장비 공동활용 신청 접수·배정
✓ 11월 신청 접수 마감 [-3]
◐ 신청 18건 중복·충돌 검토 @박하은
○ 이용 일정표 배포
○ 이용료 정산 방식 확인', '시설관리팀', -45, 30, null, null, '박하은', '진행중', null, null, null, null, null, 3, 'on_track', 4, 9, 'H', -3, false, false, null),
(14, '장비', '고가 연구장비 도입 타당성 검토 (진공 증착기)
✓ 연구실 수요조사 [-14]
◐ 견적 3사 비교표 작성 @김지스트
○ 도입 타당성 보고서 초안
○ 장비심의 상정 여부 판단
※ 예산 확보 방안에 따라 도입 시기가 달라질 수 있음', '연구처', -26, 11, null, null, '이서준, 김지스트', '진행중', null, null, null, null, null, 2, 'at_risk', 4, 9, 'S', -1, true, false, null),
(15, '장비', '공용 회의실 예약 시스템 개선 요청 정리
✓ 이용자 불편 사항 수집 [-4]
○ 개선 요청 항목 우선순위 정하기
○ 시설관리팀에 요청서 전달', '시설관리팀', -8, 14, null, null, '최도윤', '진행중', null, null, null, null, null, 4, null, 4, 9, 'D', -4, false, false, null),
(16, '행정', '협약 대학 방문 일정 조율 및 방문 준비
✓ 방문 목적·의제 정리 [-4]
◐ 면담 일정 조율 @김지스트
○ 방문 자료집 인쇄 @박하은
○ 차량·방문증 신청', '연구처', -9, 5, '10:30', '가상 A대학교 연구협력관', '김지스트, 박하은', '진행중', null, null, null, null, null, 3, 'on_track', 2, 3, 'S', -3, false, false, null),
(17, '예산', '11월 연구비 카드 사용 내역 월간 점검
✓ 카드 사용 내역 다운로드 [-2]
◐ 비목 부적합 의심 건 확인 (5건)
○ 연구실에 소명 요청', '재무회계팀', -5, 2, null, null, '박하은', '진행중', null, null, null, null, null, 3, 'on_track', 1, 1, 'H', -1, false, false, null),
(18, '행정', '연구과제 중간평가 대응 자료 준비
◐ 과제별 성과 지표 정리
○ 평가위원 질의 예상 문답 작성
○ 발표 자료 검토 일정 잡기', '연구처', -18, 16, null, null, '이서준, 최도윤', '진행중', null, null, null, null, null, 2, 'on_track', 2, 4, 'S', -6, false, false, null),
(19, '행정', '연구노트 작성 현황 점검 및 안내
✓ 점검 대상 연구실 선정 [-7]
○ 점검표 작성 및 현장 확인
○ 결과 회신 및 개선 안내', '연구처', -12, 13, null, null, '최도윤', '진행중', null, null, null, null, null, 4, null, 2, 4, 'D', -7, false, false, null),
(20, '교육세미나', '연구실 안전점검의 날 운영
✓ 점검 구역 배정 [-8]
◐ 점검 체크리스트 최신본 배포
○ 점검 결과 취합
○ 지적사항 시정 요청 공문', '안전관리팀', -15, 4, '10:00', '각 연구동', '박하은', '진행중', null, null, null, null, null, 1, 'at_risk', 3, 6, 'H', -2, false, false, null),
(21, '행정', '위탁 용역 계약 변경 검토 (복합기 유지보수)
✓ 현행 계약 조건 확인 [-3]
○ 변경 계약서 초안 작성
○ 재무회계팀 결재 상신', '재무회계팀', -6, 19, null, null, '김지스트', '진행중', null, null, null, null, null, 4, null, 1, 2, 'J', -3, false, false, null),
(22, '행정', '연말 결산 대비 팀 자산 실사
○ 실사 대상 목록 출력
○ 현장 확인 및 라벨 부착
○ 불용 처리 대상 분류', '재무회계팀', -3, 24, null, null, '센터', '진행중', null, null, null, null, null, 3, null, 4, 9, 'S', -3, false, false, null),
(23, '인사', '연차 사용 현황 점검 및 사용 촉진 안내
✓ 직원별 잔여 연차 집계 [-3]
○ 사용 촉진 안내 메일 발송
○ 사용 계획서 회수', '인사팀', -4, 9, null, null, '센터', '진행중', null, null, null, null, null, 4, null, 4, 8, 'S', -3, false, false, null),
(24, '교육세미나', '연구지원팀 업무 매뉴얼 정비 워크숍
○ 정비 대상 매뉴얼 목록 작성
○ 워크숍 일정 및 장소 정하기
○ 분야별 담당 배분', '연구지원팀', 3, 28, null, null, '센터', '진행중', null, 'planned', null, null, null, 3, null, 3, 5, 'S', -1, false, false, null),
(25, '행정', '2027년 연구과제 신규 공모 대응 (사전 준비)
○ 공모 예정 과제 목록 확인
○ 협력 대학·기관 후보 정리
○ 제안서 작성 일정표 초안', '연구처', 2, 40, null, null, '이서준', '진행중', null, 'planned', null, null, null, 3, null, 2, 4, 'S', -1, false, false, null),
(26, '예산', '연구비 사용 기준 안내문 개정
✓ 변경된 상위 지침 확인 [-7]
◐ 안내문 개정안 작성
○ 팀장 검토 후 공문 시행', '재무회계팀', -11, 6, null, null, '최도윤', '진행중', null, null, null, null, null, 3, 'on_track', 1, 1, 'D', -2, false, false, null),
(27, '장비', '연구장비 이용료 분기 정산 (3분기)
✓ 장비별 이용 내역 취합 [-6]
◐ 이용료 산정표 작성 @김지스트
○ 연구실별 청구서 발송 @박하은', '시설관리팀', -10, 0, null, null, '김지스트, 박하은', '진행중', null, null, null, null, null, 2, 'on_track', 1, 1, 'J', -1, false, false, null),
(28, '행정', '방문 연구자 출입 등록 절차 정비
✓ 현행 절차 흐름도 작성 [-5]
○ 보안 서약 양식 개정
○ 안내 페이지 문구 정리', '안전관리팀', -9, 17, null, null, '박하은', '진행중', null, null, null, null, null, 4, null, 4, 7, 'H', -5, false, false, null),
(29, '행정', '연구윤리 서약서 징구
✓ 서약서 양식 배포 [-9]
◐ 제출 현황 점검 (38명 중 29명)
○ 미제출자 개별 안내', '연구처', -14, 8, null, null, '최도윤', '진행중', null, null, null, null, null, 3, 'on_track', 3, 5, 'D', -2, false, false, null),
(30, '행정', '정보보안 점검표 제출
✓ 연구실별 점검표 수합 [-3]
◐ 전수 확인 및 오류 정정 @김지스트
○ 최종본 제출', '정보보안팀', -7, 1, null, null, '김지스트', '진행중', null, null, null, null, null, 1, 'on_track', 4, 7, 'S', -1, false, false, null),
-- ===== 보류 (31~34) =====
(31, '장비', '신규 연구동 공용 공간 배정 협의
✓ 공간 수요 조사 [-30]
◐ 배정안에 대한 타 부서 회신 대기
· 연구동 준공 일정에 따라 재개', '시설관리팀', -40, null, null, null, '이서준', '보류', null, null, 'other_dept', -16, -4, 3, null, 4, 9, 'S', -4, false, false, null),
(32, '장비', '연구장비 수리 견적 확인
✓ 고장 증상 정리 및 업체 연락 [-11]
◐ 업체 회신 대기 (견적·수리 기간)
○ 견적 수령 후 수리 여부 결정', '시설관리팀', -12, null, null, null, '박하은', '보류', null, null, 'vendor', -9, -2, 3, null, 4, 9, 'H', -2, false, false, null),
(33, '예산', '미집행 잔액 반납 승인 대기
✓ 반납 대상 과제 확정 [-14]
◐ 상위기관 승인 대기
○ 승인 후 잔액 반납 처리', '재무회계팀', -18, null, null, null, '김지스트', '보류', null, null, 'parent_org', -12, -5, 2, null, 1, 2, 'J', -5, false, false, null),
(34, '인사', '복무 규정 해석 질의
✓ 질의서 작성 [-8]
◐ 내부 검토 중 (인사팀 회신 전)
○ 회신에 맞춰 안내문 수정', '인사팀', -10, null, null, null, '최도윤', '보류', null, null, 'internal', -7, -3, 4, null, 4, 8, 'D', -3, false, false, null),
-- ===== 완료 (35~58) =====
(35, '예산', '2026년 상반기 연구비 정산
✓ 과제별 집행 내역 점검 [-66]
✓ 증빙 보완 요청 및 회수 [-61]
✓ 정산 보고서 제출 [-58]', '재무회계팀', -85, -60, null, null, '박하은', '완료', -58, 'done', null, null, null, 2, null, 1, 1, 'S', -58, false, false, null),
(36, '행정', '산업체 B(가상) 협약 갱신
✓ 갱신 조건 협의 [-56]
✓ 협약서 변경 날인 [-50]', '연구처', -75, -50, null, null, '이서준', '완료', -50, 'done', null, null, null, 3, null, 2, 3, 'S', -50, false, false, null),
(37, '교육세미나', '하계 연구원 교육 운영
✓ 강사·장소 확정 [-60]
✓ 교육 진행 및 출석 확인 [-48]
✓ 만족도 조사 결과 정리 [-47]', '연구처', -70, -47, '13:30', '대강당', '박하은, 최도윤', '완료', -47, 'done', null, null, null, 3, null, 3, 5, 'H', -47, false, false, null),
(38, '장비', '공용 장비 정기 교정 일정 수립
✓ 교정 대상 장비 목록 확인 [-50]
✓ 업체 일정 조율 [-45]
✓ 이용자 공지 [-44]', '시설관리팀', -60, -44, null, null, '최도윤', '완료', -44, 'done', null, null, null, 4, null, 4, 9, 'D', -44, false, false, null),
(39, '인사', '하계 인턴 위촉 및 종료 처리
✓ 위촉장 발급 [-70]
✓ 종료 평가서 수합 [-45]
✓ 활동 증명서 발급 [-41]', '인사팀', -75, -41, null, null, '이서준', '완료', -41, 'done', null, null, null, 4, null, 4, 8, 'S', -41, false, false, null),
(40, '행정', '상반기 연구실 안전점검 결과 보고
✓ 점검 결과 취합 [-44]
✓ 지적사항 조치 확인 [-40]
✓ 결과 보고서 제출 [-38]', '안전관리팀', -58, -38, null, null, '박하은', '완료', -38, 'done', null, null, null, 2, null, 3, 6, 'H', -38, false, false, null),
(41, '예산', '3분기 예산 전용 승인 처리
✓ 전용 사유서 작성 [-38]
✓ 결재 완료 [-35]', '재무회계팀', -45, -35, null, null, '이서준', '완료', -35, 'done', null, null, null, 3, null, 1, 2, 'S', -35, false, false, null),
(42, '행정', '연구과제 협약 변경 (기간 연장) 2건
✓ 변경 협약서 작성 [-36]
✓ 상대 기관 날인 회수 [-32]', '연구처', -48, -32, null, null, '최도윤', '완료', -32, 'done', null, null, null, 3, null, 2, 3, 'D', -32, false, false, null),
(43, '교육세미나', '가을 연구 성과 발표회 운영
✓ 발표자 확정 및 시간표 배포 [-40]
✓ 행사 당일 운영 (참석 62명) [-29]
✓ 설문 결과 정리 [-28]', '연구처', -60, -29, '14:00', '대강당', '최도윤, 박하은', '완료', -29, 'done', null, null, null, 3, null, 3, 5, 'D', -28, false, false, null),
(44, '행정', '회의실 예약 규칙 개정 및 공지
✓ 개정안 작성 [-34]
✓ 팀 회의 의결 [-30]
✓ 전체 공지 [-27]', '시설관리팀', -42, -27, null, null, '박하은', '완료', -27, 'done', null, null, null, 4, null, 4, 7, 'H', -27, false, false, null),
(45, '장비', '분광분석기 이용 교육 및 매뉴얼 배포
✓ 이용 교육 2회 진행 [-26]
✓ 매뉴얼 개정본 배포 [-24]', '시설관리팀', -38, -24, '16:00', '분석실', '최도윤', '완료', -24, 'done', null, null, null, 3, null, 4, 9, 'D', -24, false, false, null),
(46, '예산', '연구시설·장비비 구매 요청 처리 (7건)
✓ 요청서 검토 및 분류 [-28]
✓ 구매 의뢰 [-25]
✓ 납품 확인 및 검수 [-22]', '재무회계팀', -35, -22, null, null, '박하은', '완료', -22, 'done', null, null, null, 1, null, 1, 2, 'H', -22, false, false, null),
(47, '인사', '근무시간 유연제 운영 지침 안내
✓ 지침 초안 작성 [-26]
✓ 전 직원 안내 [-20]', '인사팀', -32, -20, null, null, '이서준', '완료', -20, 'done', null, null, null, 3, null, 4, 8, 'S', -20, false, false, null),
(48, '행정', '연구노트 점검 결과 회신
✓ 연구실별 점검 [-24]
✓ 결과 회신 및 시정 요청 [-18]', '연구처', -30, -18, null, null, '최도윤', '완료', -18, 'done', null, null, null, 4, null, 2, 4, 'D', -18, false, false, null),
(49, '행정', '소방·전기 안전 합동점검 대응
✓ 점검 자료 준비 [-19]
✓ 현장 점검 입회 [-16]
✓ 지적사항 조치 요청 [-15]', '안전관리팀', -25, -15, '10:00', '본관 및 연구동', '박하은', '완료', -15, 'done', null, null, null, 2, null, 3, 6, 'H', -15, false, false, null),
(50, '교육세미나', '연구비 부정사용 예방 교육
✓ 교육 자료 작성 [-18]
✓ 교육 진행 (참석 41명) [-13]', '연구처', -24, -13, '15:00', '대강당', '최도윤', '완료', -13, 'done', null, null, null, 3, null, 3, 5, 'D', -13, false, false, null),
(51, '예산', '10월 연구비 카드 사용 내역 점검
✓ 사용 내역 확인 [-14]
✓ 소명 건 회신 확인 [-9]', '재무회계팀', -18, -9, null, null, '박하은', '완료', -9, 'done', null, null, null, 3, null, 1, 1, 'H', -9, false, false, null),
(52, '행정', '공동연구 협약 대학 현장 방문
✓ 방문 자료집 인쇄 [-10]
✓ 면담 진행 및 면담록 작성 [-8]
· 후속 협의는 다음 달 초 예정', '연구처', -20, -8, '10:30', '가상 B대학교', '김지스트, 이서준', '완료', -8, 'done', null, null, null, 2, null, 2, 3, 'J', -8, false, true, 10),
(53, '인사', '인사 발령 반영 및 조직 연락망 갱신
✓ 발령 내용 확인 [-8]
✓ 연락망·권한 정리 [-6]', '인사팀', -12, -6, null, null, '이서준', '완료', -6, 'done', null, null, null, 4, null, 4, 8, 'S', -6, false, false, null),
(54, '장비', '장비 이용료 단가표 개정 안내
✓ 단가표 개정안 작성 [-9]
✓ 이용자 안내 [-5]', '시설관리팀', -14, -5, null, null, '김지스트', '완료', -5, 'done', null, null, null, 3, null, 4, 9, 'J', -5, false, false, null),
(55, '행정', '2026 연구과제 종료보고서 제출
✓ 보고서 작성 양식 확인 [-14]
✓ 최종본 검토 [-5]
✓ 제출처 시스템 등록 [-3]', '연구처', -28, -3, null, null, '이서준, 최도윤', '완료', -3, 'done', null, null, null, 2, null, 2, 4, 'S', -3, false, false, null),
(56, '교육세미나', '외부 기관 벤치마킹 방문 결과 공유
✓ 방문 결과 정리 [-4]
✓ 팀 내 공유 [-2]', '연구지원팀', -12, -2, null, null, '김지스트', '완료', -2, 'done', null, null, null, 4, null, 3, 5, 'J', -2, false, false, null),
(57, '행정', '정보보안 점검표 1차 제출
✓ 점검표 작성 [-6]
✓ 1차 제출 [-1]
· 지적사항은 2차 점검 때 반영', '정보보안팀', -9, -1, null, null, '김지스트', '완료', -1, 'done', null, null, null, 3, null, 4, 7, 'J', -1, false, true, 14),
(58, '장비', '10월 장비 이용료 청구 발송
✓ 청구서 작성 [-7]
✓ 연구실별 발송 [-4]', '시설관리팀', -10, -4, null, null, '박하은', '완료', -4, 'done', null, null, null, 3, null, 1, 1, 'H', -4, false, false, null)
) as v(num, cat, src, dept, st, plan, ptime, loc, mgr, status, endo, progress, wo, wsince, contact, prio, health, proj, trk, au, upd, chief, remind, rem);

-- ── 태그 ────────────────────────────────────────────────
insert into public.work_tags (id, name, tone, sort_order, created_by, kind) overriding system value values
  (1, '연구비', null, 10, '이서준', 'what'),
  (2, '협약', null, 20, '이서준', 'what'),
  (3, '세미나', null, 30, '이서준', 'what'),
  (4, '규정', null, 40, '이서준', 'what'),
  (5, '안전', null, 50, '이서준', 'what'),
  (6, '예산', null, 60, '이서준', 'what'),
  (7, '장비공동활용', null, 70, '이서준', 'what'),
  (8, '인사', null, 80, '이서준', 'what'),
  (9, '평가', null, 90, '이서준', 'what'),
  (10, '정산', null, 100, '이서준', 'how'),
  (11, '보고서', null, 110, '이서준', 'output'),
  (12, '공문', null, 120, '이서준', 'output');

insert into public.work_tag_aliases (alias, tag_id, created_by) values
  ('과제비', 1, '이서준'), ('워크숍', 3, '박하은'), ('공동활용', 7, '박하은'), ('안전점검', 5, '최도윤');

insert into public.work_tag_links (work_num, tag_id, source, created_by)
select t.n, t.tag, case when t.n % 7 = 0 then 'auto' else 'user' end, case when t.n % 7 = 0 then '' else booth.w_name((array['J','S','H','D'])[t.n % 4 + 1]) end
from (values
  (1,1),(1,10),(2,6),(3,6),(3,1),(4,2),(4,12),(5,9),(5,11),(6,3),(6,1),(7,3),(8,5),(8,3),(9,4),(9,5),(10,4),(10,6),
  (11,8),(12,8),(13,7),(14,7),(14,6),(15,7),(16,2),(16,12),(17,1),(17,10),(18,9),(18,11),(19,9),(20,5),(21,6),(21,12),
  (22,6),(23,8),(24,3),(24,4),(25,9),(26,1),(26,4),(26,12),(27,7),(27,10),(28,4),(28,5),(29,4),(30,12),
  (31,7),(32,7),(33,6),(33,1),(34,8),(34,4),
  (35,1),(35,10),(35,11),(36,2),(37,3),(38,7),(39,8),(40,5),(40,11),(41,6),(42,2),(42,12),(43,3),(43,11),(44,4),(44,7),
  (45,7),(45,3),(46,1),(46,6),(47,8),(47,4),(48,9),(49,5),(50,3),(50,1),(51,1),(51,10),(52,2),(53,8),(54,7),(54,6),
  (55,9),(55,11),(56,3),(57,12),(58,7),(58,10)
) as t(n, tag);

-- ── 관련 업무 ───────────────────────────────────────────
insert into public.work_relations (a_num, b_num) values
  (1,17),(1,26),(2,3),(4,16),(4,36),(5,18),(5,55),(7,43),(8,20),(9,10),(9,28),(13,27),(14,31),(6,50),(30,57),(12,39);
delete from public.work_link_log where target_type = 'work';

-- ── 세부업무 담당 표시(벨 알림) ─────────────────────────
-- line 은 업무 본문 줄의 글(담당자 칩 앞까지)과 같아야 알림으로 보인다
insert into public.work_mentions (work_num, person, line, by_name, by_uid, created_at)
select m.n, m.person, m.line, booth.w_name(m.by), booth.w_uid(m.by), booth.ts(m.off, m.hm)
from (values
  (1,  '김지스트', '증빙 누락 건 보완 요청 (14건 중 9건 회수)', 'S', -2, '10:05'),
  (5,  '김지스트', '미제출 2건 독촉', 'S', -1, '09:40'),
  (8,  '김지스트', '교육 자료 갱신 (최신 지침 반영)', 'H', -4, '11:50'),
  (14, '김지스트', '견적 3사 비교표 작성', 'H', -2, '14:05'),
  (16, '김지스트', '면담 일정 조율', 'S', -3, '16:20'),
  (27, '김지스트', '이용료 산정표 작성', 'H', -1, '13:15'),
  (30, '김지스트', '전수 확인 및 오류 정정', 'S', -1, '17:20'),
  (2,  '박하은', '사업별 소요액 산출 (세미나·장비·인건비)', 'S', -6, '10:30'),
  (2,  '이서준', '증액 요청 항목 근거 자료 정리', 'S', -6, '10:31'),
  (3,  '최도윤', '12월 초까지 집행 가능한 항목 선별', 'S', -5, '15:10'),
  (6,  '박하은', '홍보 포스터·안내 메일 발송 준비', 'S', -7, '09:50'),
  (7,  '최도윤', '다과·현수막 발주', 'H', -5, '10:45'),
  (9,  '박하은', '관련 부서 의견 수렴', 'S', -9, '15:25'),
  (12, '최도윤', '면접 일정 조율 (면접관 3인)', 'S', -8, '09:15'),
  (13, '박하은', '신청 18건 중복·충돌 검토', 'S', -3, '14:20'),
  (16, '박하은', '방문 자료집 인쇄', 'S', -3, '16:21')
) as m(n, person, line, by, off, hm);

-- ── 코멘트 ──────────────────────────────────────────────
insert into public.work_comments (id, num, author, author_uid, content, created_at, parent_id, deleted)
select c.id, c.n, booth.w_name(c.au), booth.w_uid(c.au), c.txt, booth.ts(c.off, c.hm), null, c.del
from (values
  (1, 5, 'S', '지원 님, 미제출 2건은 오늘 중으로 한 번 더 연락 부탁드립니다. 마감 연장은 어렵습니다.', -1, '10:12', false),
  (3, 5, 'H', '작년과 달라진 항목(연구비 집행률)은 제가 안내 메일 다시 보냈어요.', -1, '13:40', false),
  (4, 14, 'H', '견적 비교표는 지원 님이 맡는 걸로 반영했어요. 비교 기준은 3사 공통으로 맞춰야 할 것 같습니다.', -2, '15:20', false),
  (6, 14, 'S', '비교표 확인한 뒤 타당성 보고서 초안 목차까지 같이 잡아 주세요.', -1, '09:30', false),
  (7, 1, 'D', '증빙 회수율은 9/14입니다. 남은 건은 연구실 담당자에게 오늘 다시 안내했어요.', -2, '17:10', false),
  (8, 1, 'S', '금요일 오전까지 요약표 초안 부탁해요. 지원 님이 확인하고 공유해 주세요.', -1, '14:00', false),
  (9, 8, 'H', '최신 지침 반영본은 공유 폴더에 올려 뒀습니다. 지원 님 확인 부탁드려요.', -4, '11:45', false),
  (10, 12, 'D', '면접관 세 분이 모두 가능한 시간이 목요일 오후뿐입니다.', -3, '10:20', false),
  (12, 16, 'S', '지원 님, 상대 대학 연구협력관 일정 회신 오면 바로 공유해 주세요.', -3, '16:30', false),
  (13, 3, 'D', '불용 예상액이 과제 2건에서 큽니다. 다음 회의에서 집행 가능한 항목을 같이 보면 좋겠습니다.', -6, '11:10', false),
  (15, 9, 'H', '의견 수렴 대상에 연구실 안전관리자 협의체도 넣으면 어떨까요?', -9, '15:00', false),
  (17, 13, 'H', '신청 18건 중 이틀씩 겹치는 건이 4건입니다. 조정안 초안 올립니다.', -3, '14:15', false),
  (18, 6, 'D', '강사님 일정이 확정돼서 장소를 대강당으로 예약했습니다.', -10, '13:00', false),
  (19, 7, 'D', '발표자 6명 확정했습니다. 발표 시간은 15분 기준으로 잡겠습니다.', -6, '10:40', false),
  (20, 7, 'S', '', -5, '09:20', true),
  (22, 20, 'H', '점검 체크리스트는 최신본으로 교체했습니다.', -2, '09:50', false),
  (23, 30, 'S', '점검표 항목이 하나 늘었습니다. 지원 님 확인 부탁드려요. 내일이 제출일입니다.', -1, '17:20', false),
  (24, 35, 'S', '상반기 정산 마무리. 증빙 보완 건 모두 확인했습니다.', -58, '16:30', false),
  (25, 43, 'D', '발표회 설문 결과를 정리해서 공유 폴더에 올렸습니다.', -28, '11:00', false),
  (26, 46, 'H', '7건 모두 구매 처리를 마쳤습니다. 납품 일정은 연구실별로 안내했어요.', -22, '15:10', false),
  (27, 49, 'S', '합동점검 지적사항 2건은 시설관리팀에서 보수할 예정입니다.', -14, '10:20', false),
  (28, 52, 'J', '면담록은 공유 폴더에 올렸습니다. 후속 협의는 다음 달 초에 진행합니다.', -8, '17:00', false),
  (29, 55, 'S', '종료보고서 제출 확인했습니다. 수고하셨습니다.', -3, '14:40', false),
  (30, 57, 'J', '1차 제출을 마쳤습니다. 지적사항은 2차 점검 때 반영할게요.', -1, '10:05', false),
  (31, 32, 'H', '업체에 재촉했고 이번 주 안에 회신을 준다고 합니다.', -2, '15:30', false),
  (32, 33, 'J', '상위기관 담당자가 부재라서 내주 초에 다시 문의할 예정입니다.', -5, '16:00', false)
) as c(id, n, au, txt, off, hm, del);

-- 답글(부모 코멘트가 먼저 들어간 뒤)
insert into public.work_comments (id, num, author, author_uid, content, created_at, parent_id, deleted)
select c.id, c.n, booth.w_name(c.au), booth.w_uid(c.au), c.txt, booth.ts(c.off, c.hm), c.parent, false
from (values
  (2, 5, 'J', '네, 오전에 연구실 두 곳 모두 전화드렸고 오후에 회신 받기로 했습니다.', -1, '11:03', 1),
  (5, 14, 'J', '알겠습니다. 3사 중 한 곳은 납기 항목이 빠져 있어서 재요청해 두었습니다.', -2, '16:05', 4),
  (11, 12, 'S', '그 시간으로 확정하고 면접실 예약 부탁합니다.', -3, '10:50', 10),
  (14, 3, 'S', '좋아요. 회의 전에 항목별 표만 만들어 둡시다.', -6, '11:40', 13),
  (16, 9, 'S', '포함하세요. 다음 주까지 회신 받는 걸로 합시다.', -9, '15:20', 15),
  (21, 7, 'H', '시간표는 제가 먼저 만들어 볼게요.', -5, '10:05', 20)
) as c(id, n, au, txt, off, hm, parent);

-- ── 세부 할 일(내 할 일) ────────────────────────────────
insert into public.work_subtasks (num, owner_uid, title, content, priority, effort, status, due, sort_order, done_at, created_at, updated_at)
select s.n, booth.w_uid(s.o), s.title, '', s.pri, s.eff, s.st,
       case when s.due is null then '' else booth.d(s.due) end, s.so,
       case when s.st = 'done' then booth.ts(s.doneoff, '16:30') end,
       booth.ts(s.cre, '09:20'),
       case when s.st = 'done' then booth.ts(s.doneoff, '16:30') else booth.ts(-1, '10:00') end
from (values
  (1, 'J', '증빙 누락 14건 목록 작성', 'high', 'low', 'done', -20, 1, -20, -14),
  (1, 'J', '연구실별 재안내 메일 발송', 'high', 'low', 'done', -12, 2, -14, -10),
  (1, 'J', '정산 점검 요약표 초안', 'urgent', 'mid', 'doing', 1, 3, -5, null),
  (5, 'J', '미제출 2건 연락', 'urgent', 'low', 'doing', 0, 1, -3, null),
  (5, 'J', '종합 의견서 목차 작성', 'mid', 'mid', 'todo', 4, 2, -2, null),
  (14, 'J', '업체 3곳 견적 재요청', 'high', 'low', 'done', -8, 1, -10, -5),
  (14, 'J', '견적 비교표 서식 만들기', 'high', 'mid', 'doing', 2, 2, -5, null),
  (8, 'J', '교육 자료 지침 반영', 'mid', 'mid', 'doing', 7, 1, -4, null),
  (30, 'J', '연구실 전수 확인', 'urgent', 'mid', 'todo', 1, 1, -2, null),
  (30, 'J', '점검표 최종본 확인', 'high', 'low', 'todo', 1, 2, -2, null),
  (16, 'J', '방문증 신청서 제출', 'mid', 'low', 'todo', 3, 1, -2, null),
  (27, 'J', '3분기 이용 내역 취합', 'high', 'mid', 'done', -4, 1, -8, -4),
  (27, 'J', '청구서 작성', 'high', 'low', 'doing', 0, 2, -3, null),
  (55, 'S', '종료보고서 최종본 PDF 변환', 'mid', 'low', 'done', -4, 1, -8, -4),
  (43, 'D', '설문 결과 요약', 'mid', 'low', 'done', -29, 1, -34, -29),
  (52, 'J', '면담 자료집 인쇄', 'mid', 'low', 'done', -10, 1, -14, -10),
  (46, 'H', '납품 확인서 취합', 'mid', 'low', 'done', -23, 1, -27, -23),
  (35, 'H', '증빙 보완 확인', 'high', 'mid', 'done', -61, 1, -70, -61),
  (12, 'D', '면접실 예약', 'mid', 'low', 'todo', 5, 1, -2, null),
  (20, 'H', '점검 결과 취합 양식 준비', 'mid', 'low', 'doing', 2, 1, -3, null)
) as s(n, o, title, pri, eff, st, due, so, cre, doneoff);

-- ── 변경 이력(상태·계획 변화, 벨 알림의 재료) ───────────
insert into public.work_history (num, field, prev, next, author, at)
select h.n,
       h.f,
       case when h.p like 'd:%' then booth.d(substr(h.p, 3)::int) else h.p end,
       case when h.q like 'd:%' then booth.d(substr(h.q, 3)::int) else h.q end,
       h.a, booth.ts(h.off, h.hm)
from (values
  -- 이번 주 — 김지스트 담당 업무를 다른 사람이 바꾼 것(벨 알림)
  (1,  '예정일', 'd:-4', 'd:3', '최도윤', -2, '16:40'),
  (1,  '긴급도', '', '높음', '이서준', -9, '10:15'),
  (1,  '담당자', '박하은', '김지스트', '이서준', -21, '09:50'),
  (5,  '긴급도', '높음', '긴급', '이서준', -1, '15:30'),
  (5,  '예정일', 'd:3', 'd:6', '이서준', -1, '15:31'),
  (5,  '건강도', '정상', '주의', '이서준', -7, '11:20'),
  (5,  '담당자', '박하은', '김지스트', '이서준', -12, '09:40'),
  (14, '담당자', '이서준', '이서준, 김지스트', '박하은', -2, '14:05'),
  (14, '건강도', '정상', '주의', '이서준', -6, '10:00'),
  (14, '예정일', 'd:6', 'd:11', '이서준', -6, '10:02'),
  (16, '예정일', 'd:2', 'd:5', '박하은', -3, '13:25'),
  (30, '내용', E'정보보안 점검표 제출\\n- 연구실별 점검표 수합', E'정보보안 점검표 제출\\n- 연구실별 점검표 수합\\n- 전수 확인 및 오류 정정 (김지스트)', '이서준', -1, '17:25'),
  (8,  '세부담당', '', '김지스트 · 교육 자료 갱신 (최신 지침 반영)', '박하은', -4, '11:50'),
  (27, '세부담당', '', '김지스트 · 이용료 산정표 작성', '박하은', -1, '13:15'),
  (33, '대기처', '', '상위기관', '김지스트', -12, '10:20'),
  (33, '상태', '진행중', '보류', '김지스트', -12, '10:20'),
  (12, '예정일', 'd:2', 'd:7', '이서준', -5, '09:30'),
  (12, '긴급도', '', '높음', '이서준', -5, '09:31'),
  (3,  '건강도', '정상', '주의', '최도윤', -6, '11:15'),
  (20, '예정일', 'd:7', 'd:4', '이서준', -3, '10:10'),
  -- 보류
  (31, '상태', '진행중', '보류', '박하은', -16, '10:00'),
  (31, '대기처', '', '타부서', '박하은', -16, '10:01'),
  (31, '담당자', '박하은', '이서준', '박하은', -16, '10:02'),
  (32, '상태', '진행중', '보류', '박하은', -9, '11:30'),
  (32, '대기처', '', '업체', '박하은', -9, '11:31'),
  (34, '상태', '진행중', '보류', '최도윤', -7, '14:00'),
  (34, '대기처', '', '내부 보류', '최도윤', -7, '14:01'),
  (34, '긴급도', '보통', '낮음', '이서준', -7, '14:10'),
  -- 지난 업무(완료) 추적
  (35, '담당자', '', '박하은', '이서준', -84, '09:10'),
  (35, '예정일', 'd:-70', 'd:-60', '박하은', -72, '14:00'),
  (35, '긴급도', '', '높음', '이서준', -66, '10:30'),
  (35, '상태', '진행중', '완료', '박하은', -58, '16:20'),
  (36, '예정일', 'd:-55', 'd:-50', '이서준', -56, '11:10'),
  (36, '상태', '진행중', '완료', '이서준', -50, '15:40'),
  (37, '담당자', '박하은', '박하은, 최도윤', '이서준', -60, '09:35'),
  (37, '예정일', 'd:-52', 'd:-47', '박하은', -53, '13:20'),
  (37, '상태', '진행중', '완료', '박하은', -47, '17:00'),
  (39, '예정일', 'd:-48', 'd:-41', '이서준', -46, '10:00'),
  (39, '상태', '진행중', '완료', '이서준', -41, '16:10'),
  (40, '긴급도', '', '높음', '이서준', -45, '09:45'),
  (40, '예정일', 'd:-42', 'd:-38', '박하은', -43, '15:25'),
  (40, '상태', '진행중', '완료', '박하은', -38, '16:50'),
  (42, '예정일', 'd:-36', 'd:-32', '최도윤', -37, '10:15'),
  (42, '상태', '진행중', '완료', '최도윤', -32, '15:45'),
  (43, '예정일', 'd:-33', 'd:-29', '이서준', -35, '14:30'),
  (43, '담당자', '최도윤', '최도윤, 박하은', '이서준', -34, '09:20'),
  (43, '상태', '진행중', '완료', '최도윤', -29, '18:00'),
  (46, '긴급도', '', '긴급', '이서준', -28, '09:10'),
  (46, '예정일', 'd:-26', 'd:-22', '박하은', -27, '11:40'),
  (46, '상태', '진행중', '완료', '박하은', -22, '16:30'),
  (49, '예정일', 'd:-18', 'd:-15', '박하은', -19, '10:50'),
  (49, '상태', '진행중', '완료', '박하은', -15, '17:20'),
  (52, '예정일', 'd:-12', 'd:-8', '김지스트', -11, '11:00'),
  (52, '담당자', '김지스트', '김지스트, 이서준', '김지스트', -11, '11:02'),
  (52, '상태', '진행중', '완료', '김지스트', -8, '17:10'),
  (55, '담당자', '이서준', '이서준, 최도윤', '이서준', -20, '09:30'),
  (55, '예정일', 'd:-6', 'd:-3', '이서준', -8, '15:00'),
  (55, '상태', '진행중', '완료', '이서준', -3, '14:50'),
  (57, '예정일', 'd:-3', 'd:-1', '김지스트', -4, '09:40'),
  (57, '상태', '진행중', '완료', '김지스트', -1, '10:10')
) as h(n, f, p, q, a, off, hm);

-- ── 회의 메모(주간회의 — 이번 주 화요일 전후 3회) ───────
insert into public.meeting_memos (num, anchor, content, meeting_date, author, author_uid, created_at)
select m.n, '', m.txt, booth.day(m.off), booth.w_name(m.au), booth.w_uid(m.au), booth.ts(m.off, '11:30')
from (values
  (1,  '증빙 회수율 9/14. 미회수 5건은 이번 주 안에 재안내하고 금요일까지 요약표 초안을 낸다.', 'S', -1),
  (5,  '미제출 2건은 오늘 독촉, 마감 연장 불가. 종합 의견서는 팀장이 직접 작성.', 'S', -1),
  (14, '견적 3사 비교표 완성 후 타당성 보고서 초안으로 이어간다. 예산 확보 방안을 같이 정리할 것.', 'S', -1),
  (16, '상대 대학 회신 대기 중. 일정 확정되면 자료집 인쇄와 차량 신청을 같이 진행.', 'S', -1),
  (12, '면접은 목요일 오후로 확정. 면접실 예약과 평가표 준비는 최도윤 님이 맡는다.', 'S', -1),
  (2,  '증액 요청 항목은 근거 자료를 붙여서 다음 회의에 공유하기로 함.', 'S', -8),
  (3,  '불용 예상액이 큰 과제 2건부터 집행 가능한 항목을 찾는다. 12월 초가 사실상 마감.', 'S', -8),
  (9,  '개정안 3장 중 2장 작성 완료. 안전관리자 협의체 의견도 수렴하기로 함.', 'S', -8),
  (13, '신청 18건 중 일정이 겹치는 4건은 조정안을 만들어 이용자에게 개별 안내.', 'S', -8),
  (20, '점검 체크리스트는 최신본으로 교체. 점검 당일 인력 배치는 안전관리팀과 협의.', 'S', -8),
  (4,  '상대 기관 의견 중 비밀유지 조항 수정이 쟁점. 이번 주 안에 수정안을 다시 보낸다.', 'S', -15),
  (6,  '강사 확정. 장소는 대강당으로 가예약하고 홍보 자료를 준비한다.', 'S', -15),
  (7,  '발표자 6명 확정 대기. 시간표 초안은 다음 회의 전에 공유.', 'S', -15),
  (11, '평가 양식 확정 후 자기평가서 안내 메일을 보낸다.', 'S', -15),
  (10, '개정 필요 조항은 재무회계팀과 문구를 맞춘 뒤 대비표로 정리.', 'S', -15)
) as m(n, txt, au, off);

select set_config('app.work_skip_history', '', false);
`,mn=`-- 업무일정(달력·출장) 가상 데이터 — calendar_events 1001~1150, trip_shares, place_favorites.
-- 날짜는 전부 '채우는 날(오늘)'에서 상대값. 주말에 걸리지 않게 booth.cal_wd 로 평일로 맞춘다(끝에서 지움).
-- 출장 3건: 1001 대전 당일(KTX) · 1002 서울 1박2일(KTX) · 1003 일본 도쿄 3박4일(고속버스+항공). 웹 일정표 공유: 1001·1003.

create or replace function booth.cal_wd(n int) returns int language sql stable as $$
  select case extract(dow from booth.day(n))::int
    when 6 then case when n < 0 then n - 1 else n + 2 end
    when 0 then case when n < 0 then n - 2 else n + 1 end
    else n end
$$;

do $do$
declare
  w int;    -- 이번 주 월요일까지의 차이(0 이하)
  t1 int;   -- 대전 당일 출장일
  t2 int;   -- 서울 1박2일 시작일
  t3 int;   -- 일본 3박4일 시작일
  tj text;
begin
  w  := -((extract(dow from booth.day(0))::int + 6) % 7);
  t1 := case when w + 4 >= 1 then w + 4 else w + 11 end;
  t2 := w + 8;
  t3 := w + 22;

  ------------------------------------------------------------------ 출장 1001 : 대전 당일 (열차)
  tj := $j$
{
 "mode":"train",
 "place":{"q":"대전 연구지원협력센터 대강당","name":"대전 연구지원협력센터","addr":"대전광역시 서구 둔산로 100 (가상 주소)","lat":36.3504,"lng":127.3845},
 "legs":[
  {"id":"t1-go-1","dir":"go","mode":"car","seq":0,"by":"김지스트","from":"GIST","fromTime":"06:40","to":"광주송정역"},
  {"id":"t1-go-2","dir":"go","mode":"train","seq":1,"by":"김지스트","no":"KTX 408","from":"광주송정","fromTime":"07:40","to":"대전","toTime":"09:02","seat":"5호차 7A·7B","gate":"3번 승강장"},
  {"id":"t1-back-1","dir":"back","mode":"train","seq":0,"by":"김지스트","no":"KTX 421","from":"대전","fromTime":"17:48","to":"광주송정","toTime":"19:10","seat":"5호차 8A·8B","gate":"5번 승강장"},
  {"id":"t1-back-2","dir":"back","mode":"car","seq":1,"by":"김지스트","from":"광주송정역","fromTime":"19:25","to":"GIST"}
 ],
 "places":[
  {"id":"pl-dj0","name":"대전 연구지원협력센터","addr":"대전광역시 서구 둔산로 100 (가상 주소)","lat":36.3504,"lng":127.3845,"rep":true,"by":"김지스트"},
  {"id":"pl-dj1","name":"대전역","addr":"대전광역시 동구 중앙로 215","lat":36.3326,"lng":127.4344,"by":"김지스트"},
  {"id":"pl-dj2","name":"둔산동 한식당 (점심)","addr":"대전광역시 서구 둔산동 (가상 주소)","lat":36.3518,"lng":127.3862,"by":"김지스트"}
 ],
 "days":[
  {"date":"@A0@","summary":"연구협약 설명회 참석","placeIds":["main"],"items":[
   {"id":"t1-i1","time":"09:30","title":"등록 및 자료집 수령","body":"1층 로비 등록 데스크에서 명찰과 자료집을 받습니다.\\n참석 확인서에 서명합니다.","placeIds":["main"],"move":{"at":"09:10","mins":15,"how":"택시","detail":"1대 (2명)"}},
   {"id":"t1-i2","time":"10:00","endTime":"12:00","title":"연구협약 제도 변경 설명회","body":"- 협약 변경 절차 및 제출 서류 간소화 안내\\n- 간접비 집행 기준 개정 사항\\n- 질의응답","placeIds":["main"],"placeNote":"대강당 2층"},
   {"id":"t1-i3","time":"12:00","endTime":"13:30","title":"점심 식사","body":"둔산동 한식당 예약 (2명). 회의비 처리 예정.","placeIds":["pl-dj2"]},
   {"id":"t1-i4","time":"13:30","endTime":"15:30","title":"분임 토의 - 협약 변경 절차 질의","body":"우리 팀 질의 사항을 사전에 정리해 가져갑니다.\\n(1) 참여율 변경 시 협약 변경 필요 여부\\n(2) 공동활용 장비 구입비 비목 분류","placeIds":["main"],"placeNote":"2층 소회의실 B"},
   {"id":"t1-i5","time":"15:40","endTime":"16:30","title":"담당자 개별 상담 (서류 사전 점검)","status":"ifneeded","placeIds":["main"]},
   {"id":"t1-i6","time":"17:00","title":"대전역으로 이동","placeIds":["pl-dj1"],"move":{"at":"17:00","mins":20,"how":"택시"}}
  ]}
 ],
 "guide":{
  "prep":"설명회 참석 신청 확인 메일 (출력)\\n자료집 양식 파일 (USB)\\n법인카드\\n명함",
  "prepRec":"우산\\n보조 배터리",
  "notes":"설명회장 주차 불가 - 열차 이용\\n질의 사항은 12시 전까지 접수처에 제출\\n귀환 열차 시간이 촉박하니 개별 상담은 필요시에만"
 },
 "costs":{
  "items":[
   {"id":"c1-go","label":"가는 국내편","people":2,"amount":57200,"detail":"KTX(일반실)","route":"광주송정 → 대전"},
   {"id":"c1-back","label":"오는 국내편","people":2,"amount":57200,"detail":"KTX(일반실)","route":"대전 → 광주송정"},
   {"id":"c1-taxi","label":"대전 시내 택시","people":2,"amount":16000,"planned":true}
  ],
  "meals":{"@A0@":{"l":"회의비"}}
 }
}
$j$;
  tj := replace(tj, '@A0@', booth.d(t1));

  insert into public.calendar_events(id, title, loc, all_day, start_at, end_at, repeat, repeat_until, created_by, series_id, gcal_id, note, travel, updated_at)
  values (1001, '[출장] 국내(대전)-연구협약 설명회 참석 @김지스트, 박하은', '대전 연구지원협력센터 대강당', false,
          booth.dt(t1, '07:00'), booth.dt(t1, '19:30'), 'none', '', '김지스트', '', 'booth-gcal-1001',
          '설명회 자료집·협약 변경 양식 출력해서 지참. 법인카드는 박하은 님이 챙기기.', tj::jsonb || jsonb_build_object('daysUnofficial', tj::jsonb->'days', 'remindBy', $r$ {"김지스트":[{"anchor":"go","kind":"dayBefore","time":"18:00"},{"anchor":"go","kind":"before","minutes":60}],"박하은":[{"anchor":"go","kind":"before","minutes":45}]} $r$::jsonb), booth.ts(-5, '10:00'));

  ------------------------------------------------------------------ 출장 1002 : 서울 1박 2일 (열차)
  tj := $j$
{
 "mode":"train",
 "place":{"q":"서울 연구행정교육원 3층 강의실","name":"연구행정교육원 (가상)","addr":"서울특별시 강남구 테헤란로 (가상 주소)","lat":37.5006,"lng":127.0364},
 "legs":[
  {"id":"t2-go-1","dir":"go","mode":"car","seq":0,"by":"박하은","from":"GIST","fromTime":"06:15","to":"광주송정역"},
  {"id":"t2-go-2","dir":"go","mode":"train","seq":1,"by":"박하은","no":"KTX 004","from":"광주송정","fromTime":"07:05","to":"용산","toTime":"08:55","seat":"3호차 12C·12D","gate":"2번 승강장"},
  {"id":"t2-back-1","dir":"back","mode":"train","seq":0,"by":"박하은","no":"KTX 023","from":"용산","fromTime":"17:20","to":"광주송정","toTime":"19:12","seat":"3호차 14A·14B","gate":"7번 승강장"},
  {"id":"t2-back-2","dir":"back","mode":"car","seq":1,"by":"박하은","from":"광주송정역","fromTime":"19:25","to":"GIST"}
 ],
 "stays":[
  {"name":"강남 비즈니스 호텔","addr":"서울특별시 강남구 역삼동 (가상 주소)","lat":37.5009,"lng":127.0371,"inDate":"@C0@","inTime":"18:30","outDate":"@C1@","outTime":"08:00","note":"2인 트윈 1실. 조식 미포함.","outNote":"교육장까지 도보 5분"}
 ],
 "places":[
  {"id":"pl-sl1","name":"용산역","addr":"서울특별시 용산구 한강대로 23","lat":37.5299,"lng":126.9648,"by":"박하은"}
 ],
 "days":[
  {"date":"@C0@","summary":"연구비 통합관리 교육 1일차","placeIds":["pl-sl2"],"items":[
   {"id":"t2-i0","time":"09:00","title":"용산역 도착 후 교육원으로 이동","placeIds":["pl-sl2"],"move":{"at":"09:10","mins":35,"minsMax":45,"how":"지하철","detail":"신분당선 환승","note":"출근시간대"}},
   {"id":"t2-i1","time":"10:00","endTime":"12:00","title":"연구비 통합관리 제도 개요","body":"- 연구비 관리 체계와 최근 제도 변경\\n- 비목별 사용 원칙","placeIds":["pl-sl2"],"placeNote":"3층 강의실 301호"},
   {"id":"t2-i1b","time":"12:00","endTime":"13:30","title":"점심 식사","body":"교육원 인근 식당가. 각자 결제 후 영수증 보관.","placeIds":["pl-sl4"]},
   {"id":"t2-i2","time":"13:30","endTime":"17:30","title":"비목별 집행 기준 실습","body":"사례 중심 실습. 개인 노트북 지참.\\n실습 과제는 팀별로 제출합니다.","placeIds":["pl-sl2"],"placeNote":"3층 강의실 301호"},
   {"id":"t2-i3","time":"18:30","title":"호텔 체크인","placeIds":["pl-sl3"],"placeNote":"1층 프런트"},
   {"id":"t2-i3b","time":"19:30","title":"저녁 식사 · 내일 교육 예습","placeIds":["pl-sl4"],"status":"ifneeded"}
  ]},
  {"date":"@C1@","summary":"교육 2일차 · 복귀","placeIds":["pl-sl2"],"items":[
   {"id":"t2-i3c","time":"08:00","title":"체크아웃","placeIds":["pl-sl3"],"memo":"숙박비 법인카드 결제"},
   {"id":"t2-i4","time":"09:30","endTime":"12:00","title":"정산·증빙 관리와 감사 대응","body":"- 정산 서류 구성과 증빙 보관 기준\\n- 감사 지적 사례 분석","placeIds":["pl-sl2"],"placeNote":"3층 강의실 301호"},
   {"id":"t2-i4b","time":"12:00","endTime":"13:00","title":"점심 식사","placeIds":["pl-sl4"]},
   {"id":"t2-i5","time":"13:00","endTime":"14:30","title":"수료 평가 및 수료증 수령","placeIds":["pl-sl2"]},
   {"id":"t2-i6","time":"16:00","title":"용산역 이동","placeIds":["pl-sl1"],"move":{"at":"16:00","mins":35,"how":"지하철"}},
   {"id":"t2-i7","time":"17:20","title":"KTX 023 용산 출발","placeIds":["pl-sl1"]}
  ]}
 ],
 "guide":{
  "prep":"교육 수강 확인증\\n개인 노트북·충전기\\n법인카드\\n신분증",
  "prepRec":"텀블러\\n얇은 겉옷 (강의실 냉방)\\n보조 배터리",
  "notes":"교육장 내 식사 불가 - 점심은 인근 식당 이용\\n2일차 수료 평가는 1일차 실습 내용에서 출제\\n호텔은 체크인 18:30 이후 가능, 늦으면 프런트에 미리 연락"
 },
 "costs":{
  "items":[
   {"id":"c2-stay","label":"숙박","kind":"stay","people":2,"amount":190000},
   {"id":"c2-go","label":"가는 국내편","people":2,"amount":93600,"detail":"KTX(일반실)","route":"광주송정 → 용산"},
   {"id":"c2-back","label":"오는 국내편","people":2,"amount":93600,"detail":"KTX(일반실)","route":"용산 → 광주송정"},
   {"id":"c2-sub","label":"서울 지하철·택시","people":2,"amount":36000,"planned":true}
  ]
 }
}
$j$;
  tj := replace(replace(tj, '@C0@', booth.d(t2)), '@C1@', booth.d(t2 + 1));

  insert into public.calendar_events(id, title, loc, all_day, start_at, end_at, repeat, repeat_until, created_by, series_id, gcal_id, note, travel, updated_at)
  values (1002, '[출장] 국내(서울)-연구비 통합관리 실무 교육 @박하은, 최도윤', '서울 연구행정교육원 3층 강의실', true,
          booth.d(t2), booth.d(t2 + 1), 'none', '', '박하은', '', 'booth-gcal-1002',
          '교육비는 사업비(교육훈련비)에서 집행. 수료증 사본은 인사 서류에 첨부.', tj::jsonb || jsonb_build_object('daysUnofficial', tj::jsonb->'days', 'remindBy', $r$ {"박하은":[{"anchor":"go","kind":"dayBefore","time":"19:00"},{"anchor":"go","kind":"before","minutes":60},{"anchor":"stayIn","kind":"before","minutes":30}]} $r$::jsonb), booth.ts(-8, '15:20'));

  ------------------------------------------------------------------ 출장 1003 : 일본 도쿄 3박 4일 (국외, 고속버스 + 항공)
  tj := $j$
{
 "mode":"flight",
 "tz":{"label":"JST","offset":0},
 "place":{"q":"일본 도쿄 도쿄대학 혼고 캠퍼스 외","name":"도쿄대학 혼고 캠퍼스","addr":"7 Chome-3-1 Hongo, Bunkyo City, Tokyo","lat":35.7126,"lng":139.7620},
 "legs":[
  {"id":"t3-go-1","dir":"go","mode":"express","seq":0,"by":"김지스트","no":"프리미엄 고속버스","from":"광주 유스퀘어","fromTime":"06:30","to":"인천공항 T2","toTime":"10:15","seat":"2A·2B"},
  {"id":"t3-go-2","dir":"go","mode":"flight","seq":1,"by":"김지스트","no":"KE2109","from":"인천 ICN","fromTime":"13:05","to":"도쿄 하네다 HND","toTime":"15:25","seat":"31A·31B","terminal":"T2","gate":"246번 게이트","board":"12:35"},
  {"id":"t3-back-1","dir":"back","mode":"flight","seq":0,"by":"김지스트","no":"KE2112","from":"도쿄 하네다 HND","fromTime":"11:20","to":"인천 ICN","toTime":"13:50","seat":"30C·30D","terminal":"국제선 3터미널","gate":"112번 게이트","board":"10:50"},
  {"id":"t3-back-2","dir":"back","mode":"express","seq":1,"by":"김지스트","no":"프리미엄 고속버스","from":"인천공항 T2","fromTime":"15:30","to":"광주 유스퀘어","toTime":"19:25","seat":"3A·3B"}
 ],
 "stays":[
  {"name":"신주쿠 시티 호텔","addr":"Shinjuku, Tokyo (가상 숙소)","lat":35.6938,"lng":139.7034,"inDate":"@B0@","inTime":"17:30","outDate":"@B3@","outTime":"08:30","note":"조식 포함 (06:30~09:30). 2인 각 1실, 예약자 김지스트.","outNote":"체크아웃 후 짐 보관 가능"}
 ],
 "places":[
  {"id":"pl-jp1","name":"하네다공항 국제선","addr":"3 Chome-3-2 Hanedakuko, Ota City, Tokyo","lat":35.5494,"lng":139.7798,"by":"김지스트"},
  {"id":"pl-jp2","name":"신주쿠 시티 호텔","addr":"Shinjuku, Tokyo (가상 숙소)","lat":35.6938,"lng":139.7034,"by":"김지스트"},
  {"id":"pl-jp3","name":"도쿄대학 혼고 캠퍼스 연구지원부","addr":"7 Chome-3-1 Hongo, Bunkyo City, Tokyo","lat":35.7126,"lng":139.7620,"rep":true,"by":"김지스트"},
  {"id":"pl-jp4","name":"과학미래관","addr":"2 Chome-3-6 Aomi, Koto City, Tokyo","lat":35.6195,"lng":139.7767,"by":"김지스트"},
  {"id":"pl-jp5","name":"아사쿠사 센소지 주변 식당가","addr":"2 Chome-3-1 Asakusa, Taito City, Tokyo","lat":35.7148,"lng":139.7967,"by":"김지스트"}
 ],
 "days":[
  {"date":"@B0@","summary":"출국 · 도쿄 도착","placeIds":["pl-jp2"],"items":[
   {"id":"t3-i1","time":"15:25","title":"하네다공항 도착 · 입국 심사","body":"Visit Japan Web QR 준비. 수하물 수취 후 지하철역으로 이동.","placeIds":["pl-jp1"]},
   {"id":"t3-i2","time":"16:15","title":"신주쿠로 이동","body":"게이큐선·JR 환승 (약 55분). IC카드 1인 1장.","placeIds":["pl-jp2"],"move":{"at":"16:15","mins":55,"minsMax":70,"how":"지하철","note":"퇴근시간대 혼잡"}},
   {"id":"t3-i3","time":"17:30","title":"호텔 체크인","placeIds":["pl-jp2"],"placeNote":"1층 프런트"},
   {"id":"t3-i4","time":"19:00","title":"팀 저녁 식사","body":"호텔 인근 이자카야 예약 (2명). 내일 일정 점검.","placeIds":["pl-jp2"],"status":"ifneeded"}
  ]},
  {"date":"@B1@","summary":"도쿄대 연구지원부 방문","placeIds":["pl-jp3"],"items":[
   {"id":"t3-i5","time":"09:00","title":"호텔 출발","placeIds":["pl-jp2"],"move":{"at":"09:00","mins":35,"how":"지하철","detail":"마루노우치선 → 난보쿠선"}},
   {"id":"t3-i6","time":"10:00","endTime":"12:00","title":"연구지원부 방문 - 연구비 집행·감사 체계 소개 (Host: 연구지원부 담당자)","body":"우리 팀 사전 질의서를 이메일로 전달함.\\n- 연구비 집행 시스템\\n- 정산 및 내부 감사 절차\\n- 연구행정 인력 운영 방식","placeIds":["pl-jp3"],"placeNote":"본관 3층 회의실"},
   {"id":"t3-i7","time":"12:00","endTime":"13:30","title":"점심 - 학내 식당","placeIds":["pl-jp3"],"memo":"회의비 처리 (영수증 보관)"},
   {"id":"t3-i8","time":"13:30","endTime":"16:00","title":"연구행정 담당자 면담 및 질의응답","body":"공동활용 장비 예약·정산 운영 사례 중심으로 질의.","placeIds":["pl-jp3"]},
   {"id":"t3-i9","time":"16:00","endTime":"17:00","title":"캠퍼스 투어","placeIds":["pl-jp3"],"status":"ifneeded"}
  ]},
  {"date":"@B2@","summary":"공용장비센터·과학관 견학","placeIds":["pl-jp4"],"items":[
   {"id":"t3-i10","time":"10:00","endTime":"12:00","title":"과학미래관 견학 - 연구시설 공개·교육 프로그램 운영 사례","placeIds":["pl-jp4"],"move":{"at":"09:10","mins":50,"how":"지하철·유리카모메"}},
   {"id":"t3-i11","time":"13:30","endTime":"16:00","title":"공용장비센터 견학 (현지 파트너 안내)","body":"장비 예약 시스템과 이용료 정산 방식을 확인합니다.\\n사진 촬영은 담당자 허락 후.","placeIds":["main"],"placeNote":"센터 안내 데스크 앞 집합"},
   {"id":"t3-i12","time":"17:00","title":"자유 시간","body":"기념품 구입 등","personal":"김지스트","placeIds":["pl-jp5"]},
   {"id":"t3-i13","time":"18:30","title":"저녁 - 아사쿠사 인근","placeIds":["pl-jp5"],"move":{"at":"17:50","mins":40,"how":"지하철"}}
  ]},
  {"date":"@B3@","summary":"귀국","placeIds":["pl-jp1"],"items":[
   {"id":"t3-i14","time":"08:30","title":"체크아웃","placeIds":["pl-jp2"]},
   {"id":"t3-i15","time":"09:00","title":"하네다공항으로 이동","placeIds":["pl-jp1"],"move":{"at":"09:00","mins":50,"how":"지하철","note":"출발 2시간 전 도착 목표"}},
   {"id":"t3-i16","time":"11:20","title":"KE2112 하네다 출발","placeIds":["pl-jp1"]}
  ]}
 ],
 "guide":{
  "prep":"여권 (유효기간 6개월 이상)\\n전자항공권·탑승권\\n방문 확인 이메일 (출력본)\\n명함 20매\\n멀티 어댑터 (일본 A형, 100V)\\n법인카드·영수증 봉투",
  "prepRec":"포켓 와이파이 또는 eSIM\\n접이식 우산\\n편한 신발\\n상비약",
  "notes":"입국 전 Visit Japan Web 사전 등록 권장\\n현지 대학 방문 시 사진 촬영은 담당자 허락 후\\n영수증·지하철 이용 내역은 귀국 후 정산을 위해 보관\\n택시는 현금 또는 IC카드 지참"
 },
 "costs":{
  "region":"가",
  "items":[
   {"id":"c3-stay","label":"숙박","kind":"stay","people":2,"amount":900000},
   {"id":"c3-fl","label":"항공권","kind":"flight","each":{"이서준":432000,"김지스트":432000}},
   {"id":"c3-go","label":"가는 국내편","kind":"leg","legId":"t3-go-1","people":2,"amount":66000,"detail":"고속버스(프리미엄)","route":"광주(유스퀘어) → 인천공항T2"},
   {"id":"c3-back","label":"오는 국내편","kind":"leg","legId":"t3-back-2","people":2,"amount":66000,"detail":"고속버스(프리미엄)","route":"인천공항T2 → 광주(유스퀘어)"},
   {"id":"c3-local","label":"현지 교통(지하철)","people":2,"amount":84000,"planned":true}
  ],
  "meals":{
   "@B1@":{"b":"호텔조식","l":"회의비"},
   "@B2@":{"b":"호텔조식"},
   "@B3@":{"b":"호텔조식"}
  }
 }
}
$j$;
  tj := replace(replace(replace(replace(tj, '@B0@', booth.d(t3)), '@B1@', booth.d(t3 + 1)), '@B2@', booth.d(t3 + 2)), '@B3@', booth.d(t3 + 3));

  insert into public.calendar_events(id, title, loc, all_day, start_at, end_at, repeat, repeat_until, created_by, series_id, gcal_id, note, travel, updated_at)
  values (1003, '[출장] 국외(일본 도쿄)-대학 연구지원 체계 벤치마킹 방문 @이서준, 김지스트', '일본 도쿄 도쿄대학 혼고 캠퍼스 외', true,
          booth.d(t3), booth.d(t3 + 3), 'none', '', '이서준', '', 'booth-gcal-1003',
          '국외출장 계획서 결재 완료. 여비는 귀국 후 7일 이내 정산.', tj::jsonb || jsonb_build_object('daysUnofficial', tj::jsonb->'days', 'remindBy', $r$ {"김지스트":[{"anchor":"go","kind":"dayBefore","time":"20:00"},{"anchor":"go","kind":"before","minutes":120},{"anchor":"stayIn","kind":"before","minutes":30},{"anchor":"back","kind":"before","minutes":150}],"이서준":[{"anchor":"go","kind":"before","minutes":150}]} $r$::jsonb), booth.ts(-10, '11:30'));

  ------------------------------------------------------------------ 출장 1004 : 지난 출장(간단)
  insert into public.calendar_events(id, title, loc, all_day, start_at, end_at, created_by, gcal_id, note, updated_at)
  values (1004, '[출장] 국내(세종)-연구비 관리 우수사례 방문 @김지스트', '세종 정부청사 인근', false,
          booth.dt(booth.cal_wd(-15), '08:30'), booth.dt(booth.cal_wd(-15), '18:00'), '김지스트', 'booth-gcal-1004',
          '방문 결과는 팀 주간회의에서 공유 완료.', booth.ts(-16, '09:00'));

  ------------------------------------------------------------------ 반복 시리즈 : 센터 주간업무회의(매주 월 10:00) / 연구비 집행 점검(매주 금 15:00)
  insert into public.calendar_events(id, title, loc, all_day, start_at, end_at, repeat, repeat_until, created_by, series_id, gcal_id, note, updated_at)
  select 1009 + row_number() over (order by k), '[회의] 센터 주간업무회의', '원내 행정동 중회의실', false,
         booth.dt(w + 7 * k, '10:00'), booth.dt(w + 7 * k, '11:00'), 'none', '', '이서준', 'booth-series-weekly', 'booth-gcal-' || (1009 + row_number() over (order by k)),
         '안건: 이번 주 연구비 정산 현황 / 협약 서류 제출 일정 / 장비 공동활용 예약 점검 / 기타 공유 사항', booth.ts(-40, '09:00')
  from generate_series(-5, 5) as k;

  insert into public.calendar_events(id, title, loc, all_day, start_at, end_at, repeat, repeat_until, created_by, series_id, gcal_id, note, updated_at)
  select 1020 + row_number() over (order by k), '[업무] 연구비 집행 내역 점검 @박하은', '', false,
         booth.dt(w + 4 + 7 * k, '15:00'), booth.dt(w + 4 + 7 * k, '16:00'), 'none', '', '박하은', 'booth-series-expense', 'booth-gcal-' || (1020 + row_number() over (order by k)),
         '', booth.ts(-35, '09:00')
  from generate_series(-4, 4) as k;

  ------------------------------------------------------------------ 단발 일정
  -- (순번, 제목, 장소, 설명, 종일, 시작일, 종료일, 시작시각, 종료시각, 등록자, 구글 연동 여부)
  insert into public.calendar_events(id, title, loc, note, all_day, start_at, end_at, created_by, gcal_id, updated_at)
  select 1029 + o,
         title, loc, note, ad,
         case when ad then booth.d(s) else booth.dt(s, st) end,
         case when ad then booth.d(e) else booth.dt(e, et) end,
         cb,
         case when g then 'booth-gcal-' || (1029 + o) else '' end,
         booth.ts(least(s, 0) - 3, '09:00')
  from (values
    -- 지난 일정
    (1,  '[행사] 연구개발 성과 공유회 @이서준, 김지스트, 박하은, 최도윤', '원내 국제관 대강당', '발표 자료 취합: 각 담당 3일 전까지.', false, booth.cal_wd(-40), booth.cal_wd(-40), '14:00', '17:00', '이서준', true),
    (2,  '[회의] 연구과제 협약 변경 협의 @박하은, 최도윤', '원내 행정동 소회의실', '', false, booth.cal_wd(-34), booth.cal_wd(-34), '14:00', '15:30', '박하은', true),
    (3,  '[업무] 상반기 연구비 집행 실적 보고 @센터', '', '보고서 제출처: 연구처 연구관리팀.', true, booth.cal_wd(-30), booth.cal_wd(-30), '', '', '김지스트', true),
    (4,  '[교육] 연구윤리·청렴 교육 @이서준, 김지스트, 박하은, 최도윤', '원내 국제관 세미나실', '온라인 수강 인정 불가 - 현장 참석.', false, booth.cal_wd(-22), booth.cal_wd(-22), '10:00', '12:00', '김지스트', true),
    (5,  '[회의] 내부 규정 개정 TF 1차 @이서준, 박하은, 최도윤', '원내 행정동 소회의실', '개정 대상: 연구비 관리 지침, 장비 공동활용 운영 규정.', false, booth.cal_wd(-19), booth.cal_wd(-19), '15:00', '16:30', '이서준', true),
    (6,  '[업무] 연구장비 공동활용 현황 점검 @최도윤', '원내 중앙기기연구소', '', false, booth.cal_wd(-12), booth.cal_wd(-12), '10:00', '12:00', '최도윤', true),
    (7,  '[행사] 신입 연구원 오리엔테이션 지원 @박하은, 김지스트', '원내 국제관 대강당', '', false, booth.cal_wd(-9), booth.cal_wd(-9), '13:30', '16:30', '박하은', true),
    (8,  '[회의] 연구재단 담당자 화상회의 @이서준, 김지스트', '화상 (Zoom)', '협약 변경 건 사전 협의.', false, booth.cal_wd(-6), booth.cal_wd(-6), '11:00', '12:00', '김지스트', true),
    (9,  '[업무] 연구실 안전 점검 사전 안내 발송 @최도윤', '', '', false, booth.cal_wd(-4), booth.cal_wd(-4), '09:30', '10:30', '최도윤', false),
    (10, '[회의] 팀 점심 간담회 @이서준, 김지스트, 박하은, 최도윤', '원내 학생회관 식당', '', false, booth.cal_wd(-3), booth.cal_wd(-3), '12:00', '13:30', '이서준', true),
    (11, '[업무] 월간 연구비 정산 마감 @센터', '', '마감 후 미정산 건은 담당자별로 개별 안내.', true, booth.cal_wd(-2), booth.cal_wd(-2), '', '', '박하은', true),
    -- 이번 주 · 오늘
    (12, '[회의] 협약 서류 점검 @박하은, 최도윤', '원내 행정동 소회의실', '제출 서류 체크리스트 대조.', false, w + 1, w + 1, '14:00', '15:00', '박하은', true),
    (13, '[업무] 연구비 카드 사용 내역 확인 @최도윤', '', '', false, w + 2, w + 2, '10:30', '11:30', '최도윤', true),
    (14, '[업무] 협약 변경 서류 제출 (연구관리시스템) @김지스트', '', '제출 마감 17시.', false, 0, 0, '09:30', '10:30', '김지스트', true),
    (15, '[회의] 연구과제 평가위원회 일정 조율 @이서준, 김지스트', '원내 행정동 대회의실', '위원 5명 일정 취합 결과 공유.', false, 0, 0, '13:30', '14:30', '이서준', true),
    (16, '[행사] 연구지원 시스템 사용자 설명회 @이서준, 김지스트, 박하은, 최도윤', '원내 국제관 세미나실', '신규 메뉴 시연. 질문은 사전 접수.', false, 0, 0, '16:00', '17:30', '김지스트', true),
    (17, '[반차] 최도윤', '', '', false, 0, 0, '13:00', '18:00', '최도윤', true),
    (18, '[회의] 장비 공동활용 이용 현황 보고 @이서준, 최도윤', '원내 행정동 중회의실', '', false, booth.cal_wd(1), booth.cal_wd(1), '15:00', '16:00', '최도윤', true),
    (19, '[업무] 월말 연구비 정산 마감 안내 메일 @박하은', '', '', false, booth.cal_wd(2), booth.cal_wd(2), '09:30', '10:00', '박하은', true),
    (20, '[연차] 이서준', '', '', true, booth.cal_wd(3), booth.cal_wd(3), '', '', '이서준', true),
    -- 앞으로
    (21, '[업무] 연구협약 서류 제출 마감 (연구관리시스템) @센터', '', '제출 누락 건 없도록 전날 최종 점검.', true, booth.cal_wd(5), booth.cal_wd(5), '', '', '김지스트', true),
    (22, '[회의] 내부 규정 개정 TF 2차 @이서준, 박하은, 최도윤', '원내 행정동 소회의실', '1차 의견 반영본 검토.', false, booth.cal_wd(7), booth.cal_wd(7), '15:00', '16:30', '이서준', true),
    (23, '[교육] 연구실 안전관리 교육 @센터', '원내 국제관 세미나실', '연구실 안전관리자 대상.', false, booth.cal_wd(8), booth.cal_wd(8), '14:00', '16:00', '최도윤', true),
    (24, '[업무] 연구실 안전 점검 현장 확인 @최도윤, 김지스트', '원내 자연과학동', '', false, booth.cal_wd(10), booth.cal_wd(10), '10:00', '12:00', '최도윤', true),
    (25, '[회의] 외부 회의 - 협약기관 협의 @이서준', '광주 북구 (협약기관 사무실)', '자료: 협약 변경안 3부.', false, booth.cal_wd(12), booth.cal_wd(12), '14:00', '16:00', '이서준', true),
    (26, '[연차] 김지스트', '', '', true, booth.cal_wd(14), booth.cal_wd(15), '', '', '김지스트', true),
    (27, '[행사] 연구지원 합동 워크숍 @이서준, 김지스트, 박하은, 최도윤', '원내 국제관 대강당', '타 부서 연구지원 담당자 참석 - 약 30명.', false, booth.cal_wd(16), booth.cal_wd(16), '13:00', '17:00', '이서준', true),
    (28, '[업무] 연말 예산 집행 마감 점검 @센터', '', '', true, booth.cal_wd(18), booth.cal_wd(18), '', '', '박하은', true),
    (29, '[회의] 평가 결과 보고 사전 검토 @이서준, 김지스트', '원내 행정동 중회의실', '', false, booth.cal_wd(19), booth.cal_wd(19), '11:00', '12:00', '김지스트', true),
    (30, '[업무] 출장 결과 보고서 작성 (일본 출장) @이서준, 김지스트', '', '', false, booth.cal_wd(t3 + 6), booth.cal_wd(t3 + 6), '10:00', '12:00', '김지스트', false),
    (31, '[업무] 감사 대비 서류 정비 @박하은', '', '', false, booth.cal_wd(t3 + 8), booth.cal_wd(t3 + 8), '13:00', '17:00', '박하은', true),
    (32, '[연차] 박하은', '', '', true, booth.cal_wd(t3 + 10), booth.cal_wd(t3 + 10), '', '', '박하은', true),
    (33, '[교육] 연구윤리 심화 교육 @이서준, 김지스트, 박하은, 최도윤', '원내 국제관 세미나실', '', false, booth.cal_wd(t3 + 12), booth.cal_wd(t3 + 12), '10:00', '12:00', '김지스트', true),
    (34, '[업무] 장비 공동활용 이용료 정산 @최도윤', '', '', false, booth.cal_wd(t3 + 14), booth.cal_wd(t3 + 14), '14:00', '16:00', '최도윤', true),
    (35, '[회의] 연구과제 종합 성과 보고회 준비 @이서준, 박하은', '원내 행정동 소회의실', '', false, booth.cal_wd(t3 + 16), booth.cal_wd(t3 + 16), '15:00', '16:00', '이서준', true),
    (36, '[행사] 팀 송년 간담회 @센터', '원내 학생회관 식당', '', false, booth.cal_wd(t3 + 20), booth.cal_wd(t3 + 20), '17:30', '19:30', '이서준', false)
  ) as v(o, title, loc, note, ad, s, e, st, et, cb, g);
end
$do$;

------------------------------------------------------------------ 비출장 일정 보강: 설명(안건)·원외 이동·미리알림·관련 업무·장비
do $do2$
declare
  tj text;
begin
  -- 설명(note) — 회의는 안건, 교육·행사는 프로그램, 업무는 대상·범위
  update public.calendar_events c set note = v.n
  from (values
    (1029 + 1,  E'프로그램: 14:00 개회 / 14:10 과제별 성과 발표(6건) / 16:00 질의응답 / 16:40 폐회\\n발표 자료는 3일 전까지 담당자에게 제출'),
    (1029 + 2,  E'안건\\n1. 참여 연구원 변경에 따른 협약 변경 범위\\n2. 변경 협약서 제출 일정\\n3. 상대 기관 회신 대기 건 점검\\n준비: 협약서 사본, 변경 신청서 초안'),
    (1029 + 3,  E'제출처: 연구처 연구관리팀\\n포함 내용: 과제별 집행률, 미집행 사유, 하반기 집행 계획'),
    (1029 + 4,  E'대상: 전 구성원 필수 이수 (온라인 수강 인정 불가)\\n내용: 연구윤리 규정, 연구비 부정사용 사례, 청렴 서약\\n이수증은 인사팀에 제출'),
    (1029 + 5,  E'안건\\n1. 개정 범위와 우선순위\\n2. 현행 규정 문제점 공유\\n3. 담당별 조문 초안 작성 일정'),
    (1029 + 6,  E'점검 대상: 공동활용 장비 가동·예약 현황\\n점검표에 이상 유무를 기록하고 시설관리팀과 공유'),
    (1029 + 7,  E'신입 연구원 24명 대상. 명찰·안내 자료집 준비, 점심은 도시락 제공.'),
    (1029 + 8,  E'안건\\n1. 협약 변경 건 진행 현황\\n2. 제출 서류 보완 사항\\n접속 링크는 참석자에게 메일로 안내'),
    (1029 + 9,  E'대상: 전 연구실 안전관리자\\n내용: 점검 일정, 점검표 서식, 제출 기한\\n발송 후 회신 현황을 표로 관리'),
    (1029 + 10, E'신규 입사자 환영을 겸한 팀 점심. 장소 예약 완료.'),
    (1029 + 12, E'안건\\n1. 제출 서류 체크리스트 대조\\n2. 누락·보완 건 담당 배정'),
    (1029 + 13, E'카드 사용 내역에서 비목 부적합 의심 5건 확인 후 연구실에 소명 요청'),
    (1029 + 15, E'안건\\n1. 위원 후보 5명 일정 취합 결과\\n2. 평가 일정(안) 확정\\n3. 평가 자료 배포 시점'),
    (1029 + 16, E'1. 신규 메뉴 시연 (30분)\\n2. 질의응답\\n사용 매뉴얼은 행사 후 게시판에 올립니다.'),
    (1029 + 18, E'안건\\n1. 3분기 이용 현황 (장비별 가동률)\\n2. 이용료 정산 방식 확인\\n3. 비가동 장비 조치 계획'),
    (1029 + 19, E'과제별 미정산 건 안내. 발송 대상 연구실 목록은 정산 점검표 참조'),
    (1029 + 22, E'안건\\n1. 1차 의견 반영본 검토\\n2. 조문별 수정 사항 확정\\n3. 운영위원회 상정 일정'),
    (1029 + 24, E'점검 구역: 자연과학동 3~5층 실험실\\n점검표를 지참하고 지적사항은 현장에서 사진으로 기록'),
    (1029 + 27, E'프로그램: 13:00 기조 발표 / 14:00 분임 토의 / 16:00 결과 공유\\n문의: 연구지원팀'),
    (1029 + 28, E'가용 잔액을 점검해 집행 가능 건과 이월·반납 건을 분리'),
    (1029 + 29, E'안건\\n1. 평가 결과 보고서 초안 검토\\n2. 보고 순서와 발표 담당 확정'),
    (1029 + 30, E'출장 결과보고서 양식에 따라 작성. 방문 기관 면담 내용과 시사점 중심.'),
    (1029 + 31, E'감사 대상 서류 목록과 대조해 누락 보완'),
    (1029 + 33, E'연구윤리 사례 토론 중심 심화 과정 (2시간)\\n출석 확인서 제출'),
    (1029 + 34, E'장비별 이용 내역과 단가를 대조해 연구실별 청구서 작성'),
    (1029 + 35, E'안건\\n1. 발표 자료 구성\\n2. 연간 성과 지표 정리 분담'),
    (1029 + 36, E'장소 예약 완료. 참석 여부는 이번 주까지 회신.')
  ) as v(id, n)
  where c.id = v.id;
  update public.calendar_events set note = E'점검 항목: 카드 사용 내역 비목 적합성 / 증빙 누락 / 미집행 잔액' where series_id = 'booth-series-expense';

  -- 외부 회의 (협약기관 협의): 원외 이동정보 + 일정표
  tj := $j$
{
 "mode":"car",
 "place":{"q":"광주 북구 (협약기관 사무실)","name":"협약기관 사무실 (가상)","addr":"광주광역시 북구 첨단과기로 (가상 주소)","lat":35.2276,"lng":126.8426},
 "legs":[
  {"id":"m1-go","dir":"go","mode":"car","seq":0,"by":"이서준","from":"GIST","fromTime":"13:25","to":"협약기관 사무실"},
  {"id":"m1-back","dir":"back","mode":"car","seq":0,"by":"이서준","from":"협약기관 사무실","fromTime":"16:15","to":"GIST"}
 ],
 "places":[{"id":"pl-m1","name":"협약기관 사무실 (가상)","addr":"광주광역시 북구 첨단과기로 (가상 주소)","lat":35.2276,"lng":126.8426,"rep":true,"by":"이서준"}],
 "days":[{"date":"@D@","summary":"협약 변경 협의","placeIds":["pl-m1"],"items":[
   {"id":"m1-i1","time":"14:00","endTime":"15:30","title":"협약 변경안 협의","body":"- 변경 협약서 문구 확정\\n- 제출 일정 합의\\n자료: 협약 변경안 3부","placeIds":["pl-m1"],"placeNote":"본관 2층 회의실"},
   {"id":"m1-i2","time":"15:30","endTime":"16:00","title":"담당자 인사 및 후속 일정 확인","placeIds":["pl-m1"]}
 ]}],
 "remindBy":{"이서준":[{"anchor":"go","kind":"before","minutes":30}]}
}
$j$;
  update public.calendar_events set travel = replace(tj, '@D@', substr(start_at, 1, 10))::jsonb where id = 1029 + 25;

  -- 외부 교육 (원외)
  tj := $j$
{
 "mode":"car",
 "place":{"q":"광주 서구 연구행정교육센터 (가상)","name":"연구행정교육센터 (가상)","addr":"광주광역시 서구 상무중앙로 (가상 주소)","lat":35.1527,"lng":126.8514},
 "legs":[
  {"id":"e1-go","dir":"go","mode":"car","seq":0,"by":"김지스트","from":"GIST","fromTime":"08:40","to":"연구행정교육센터"},
  {"id":"e1-back","dir":"back","mode":"car","seq":0,"by":"김지스트","from":"연구행정교육센터","fromTime":"17:40","to":"GIST"}
 ],
 "places":[{"id":"pl-e1","name":"연구행정교육센터 (가상)","addr":"광주광역시 서구 상무중앙로 (가상 주소)","lat":35.1527,"lng":126.8514,"rep":true,"by":"김지스트"}],
 "days":[{"date":"@D@","summary":"외부 교육 수강","placeIds":["pl-e1"],"items":[
   {"id":"e1-i1","time":"09:30","title":"등록 및 교재 수령","placeIds":["pl-e1"]},
   {"id":"e1-i2","time":"10:00","endTime":"12:00","title":"연구행정 실무 역량 - 협약·정산 사례","placeIds":["pl-e1"],"placeNote":"4층 강의실"},
   {"id":"e1-i3","time":"12:00","endTime":"13:00","title":"점심 식사","placeIds":[]},
   {"id":"e1-i4","time":"13:00","endTime":"17:00","title":"실습 및 수료 평가","body":"개인 노트북 지참","placeIds":["pl-e1"],"placeNote":"4층 강의실"}
 ]}],
 "guide":{"prep":"교육 신청 확인서\\n개인 노트북","notes":"주차 지원 없음 - 인근 공영주차장 이용"},
 "remindBy":{"김지스트":[{"anchor":"go","kind":"before","minutes":30}]}
}
$j$;
  insert into public.calendar_events(id, title, loc, note, all_day, start_at, end_at, created_by, gcal_id, travel, updated_at)
  values (1029 + 37, '[교육] 연구행정 실무 역량 교육 (외부) @김지스트, 최도윤', '광주 서구 연구행정교육센터 (가상)',
          E'외부 위탁 교육. 수강료는 교육훈련비로 집행하고 수료증을 제출합니다.\\n점심은 각자 해결.', false,
          booth.dt(booth.cal_wd(11), '09:30'), booth.dt(booth.cal_wd(11), '17:30'), '김지스트', 'booth-gcal-' || (1029 + 37),
          replace(tj, '@D@', booth.d(booth.cal_wd(11)))::jsonb, booth.ts(-2, '10:00'));

  -- 협약 대학 방문 면담 (원외)
  tj := $j$
{
 "mode":"car",
 "place":{"q":"가상 A대학교 연구협력관","name":"가상 A대학교 연구협력관","addr":"광주광역시 북구 (가상 주소)","lat":35.1760,"lng":126.9070},
 "legs":[
  {"id":"v1-go","dir":"go","mode":"car","seq":0,"by":"김지스트","from":"GIST","fromTime":"09:40","to":"가상 A대학교"},
  {"id":"v1-back","dir":"back","mode":"car","seq":0,"by":"김지스트","from":"가상 A대학교","fromTime":"13:00","to":"GIST"}
 ],
 "places":[{"id":"pl-v1","name":"가상 A대학교 연구협력관","addr":"광주광역시 북구 (가상 주소)","lat":35.1760,"lng":126.9070,"rep":true,"by":"김지스트"}],
 "days":[{"date":"@D@","summary":"협약 대학 방문","placeIds":["pl-v1"],"items":[
   {"id":"v1-i1","time":"10:30","endTime":"11:30","title":"공동연구 협약 이행 면담","body":"- 방문 목적·의제: 협약 이행 점검, 연구비 정산 일정\\n- 방문 자료집 지참","placeIds":["pl-v1"],"placeNote":"연구협력관 2층"},
   {"id":"v1-i2","time":"11:30","endTime":"12:00","title":"공용 연구시설 안내","placeIds":["pl-v1"],"status":"ifneeded"}
 ]}],
 "guide":{"prep":"방문증 신청 확인\\n방문 자료집 3부","notes":"방문증은 정문 경비실에서 수령"},
 "remindBy":{"김지스트":[{"anchor":"go","kind":"before","minutes":30}]}
}
$j$;
  insert into public.calendar_events(id, title, loc, note, all_day, start_at, end_at, created_by, gcal_id, travel, updated_at)
  values (1029 + 38, '[회의] 협약 대학 방문 면담 @김지스트, 박하은', '가상 A대학교 연구협력관',
          E'안건\\n1. 공동연구 협약 이행 현황 점검\\n2. 연구비 정산 일정 협의\\n3. 차기 협약 갱신 의견 청취', false,
          booth.dt(booth.cal_wd(9), '10:30'), booth.dt(booth.cal_wd(9), '12:00'), '김지스트', 'booth-gcal-' || (1029 + 38),
          replace(tj, '@D@', booth.d(booth.cal_wd(9)))::jsonb, booth.ts(-2, '11:00'));

  -- 미리알림(내 것): 일정 시작 N분 전 — 원내 회의·행사
  update public.calendar_events
     set travel = coalesce(travel, '{}'::jsonb) || '{"remindBy":{"김지스트":[{"anchor":"start","kind":"before","minutes":10}]}}'::jsonb
   where id in (1029 + 15, 1029 + 16, 1029 + 18, 1029 + 22, 1029 + 29);

  -- 관련 업무(work_events) — 일정 ↔ 업무현황
  insert into public.work_events(work_num, event_id) values
    (4, 1001), (6, 1002), (1, 1002), (13, 1003), (14, 1003),
    (1, 1015), (2, 1016), (17, 1025), (17, 1026),
    (7, 1029 + 1), (4, 1029 + 2), (1, 1029 + 3), (29, 1029 + 4), (9, 1029 + 5), (13, 1029 + 6),
    (8, 1029 + 7), (5, 1029 + 8), (20, 1029 + 9), (1, 1029 + 11), (17, 1029 + 11), (4, 1029 + 12),
    (17, 1029 + 13), (4, 1029 + 14), (18, 1029 + 15), (26, 1029 + 16), (27, 1029 + 18), (1, 1029 + 19),
    (4, 1029 + 21), (5, 1029 + 21), (9, 1029 + 22), (10, 1029 + 22), (20, 1029 + 23), (20, 1029 + 24),
    (4, 1029 + 25), (24, 1029 + 27), (3, 1029 + 28), (18, 1029 + 29), (22, 1029 + 31), (29, 1029 + 33),
    (27, 1029 + 34), (7, 1029 + 35), (8, 1029 + 37), (16, 1029 + 38);

  -- (장비 연결 event_equipments 는 장비 시드(30)가 먼저 있어야 해서 이 파일에서는 넣지 않는다)
end
$do2$;

drop function booth.cal_wd(int);

------------------------------------------------------------------ 출장 웹 일정표 공유 (암호 없음 = 공개)
-- 토큰은 insert 때 서버 트리거가 새로 뽑아 덮어쓴다 — 정해 둔 32자 토큰을 넣으려고 잠깐 끈다.
alter table public.trip_shares disable trigger trip_shares_guard;
insert into public.trip_shares(event_id, token, enabled, created_by, pin) values
  (1001, 'boothDaejeonBrief2026xKtxDemo001', true, '김지스트', null),
  (1002, 'boothSeoulEduTraining2026Demo003', true, '김지스트', null),
  (1003, 'boothTokyoBenchmark26xTripDemo02', true, '김지스트', null);
alter table public.trip_shares enable trigger trip_shares_guard;

do $$ begin
  if exists (select 1 from public.trip_shares where token !~ '^[A-Za-z0-9_-]{32}$') then
    raise exception 'trip_shares token must be 32 chars';
  end if;
end $$;

------------------------------------------------------------------ 장소 즐겨찾기
insert into public.place_favorites(name, place_name, addr, lat, lng, created_by) values
  ('광주송정역', '광주송정역 KTX', '광주광역시 광산구 상무대로 201', 35.1378, 126.7910, '00000000-0000-4000-8000-00000000b007'),
  ('대전역', '대전역', '대전광역시 동구 중앙로 215', 36.3326, 127.4344, '00000000-0000-4000-8000-00000000b007'),
  ('인천공항 T2', '인천국제공항 제2여객터미널', '인천광역시 중구 제2터미널대로 446', 37.4690, 126.4339, '00000000-0000-4000-8000-0000000000a1'),
  ('광주 유스퀘어', '광주종합버스터미널(유스퀘어)', '광주광역시 서구 무진대로 904', 35.1601, 126.8791, '00000000-0000-4000-8000-0000000000a2'),
  -- 발표 시연(src/booth/demo) 학회 출장 위치 — 즐겨찾기에서 고르는 장면
  ('도쿄 국제포럼', 'Tokyo International Forum', 'Marunouchi, Chiyoda City, Tokyo', 35.6769, 139.7639, '00000000-0000-4000-8000-00000000b007');

------------------------------------------------------------------ 출장비 예측용 직급 (개인 설정 'trip.grade')
insert into public.user_settings(user_name, settings) values ('김지스트', '{"trip.grade":"mid"}')
on conflict (user_name) do update set settings = public.user_settings.settings || excluded.settings;
`,bn=`-- 체험관 가상 데이터 — 장비관리(도입·운영·데모결과). 모든 업체·모델·금액은 지어낸 것이다.
-- 장비 id 1~10 = 도입 단계(1 평가 · 2~3 데모 · 4~5 공고 · 6 협상 · 7 제작 · 8~9 설치 · 10 사전규격), 11~20 = 운영.
-- 데모결과는 장비명이 같은 두 종: '대형 강의실 AV·화상회의 시스템'(id 1), '공용 3D 프린터'(id 2·3).

-- ───────── 도입일정(schedules) — 장비 1대당 1행, 관리번호(code)로 equipments 와 짝 ─────────
-- stage_* = 단계별 소요 개월(0.5 단위). start = 'YYYY-MM-DD'(14일 이하 전반월 · 15일 이상 후반월)
insert into public.schedules (id, seq, code, name, mgr, status, start, stage_pre, stage_bid, stage_eval, stage_nego, stage_make, stage_install, duration, cat, method, price) values
  (1,  '1',  'GS-26-001', '대형 강의실 AV·화상회의 시스템', '이서준', '도입중',   booth.d(-75),  '1','1','1','1','2','1', '7', '내자', '제한경쟁입찰', 128000000),
  (2,  '2',  'GS-26-002', '공용 3D 프린터',               '박하은', '도입예정', booth.d(30),   '1','1','1','1','1','1', '6', '내자', '일반경쟁입찰', 18500000),
  (3,  '3',  'GS-26-003', '공용 3D 프린터',               '박하은', '도입예정', booth.d(30),   '1','1','1','1','1','1', '6', '내자', '일반경쟁입찰', 18500000),
  (4,  '4',  'GS-26-004', '연구실 공기질 측정 시스템',     '최도윤', '도입예정', booth.d(-35),  '1','1','1','1','1','1', '6', '내자', '일반경쟁입찰', 24000000),
  (5,  '5',  'GS-26-005', '연구실 공기질 측정 시스템',     '최도윤', '도입예정', booth.d(-35),  '1','1','1','1','1','1', '6', '내자', '일반경쟁입찰', 24000000),
  (6,  '6',  'GS-26-006', '시약 관리 캐비닛·재고 시스템', '박하은', '도입중',   booth.d(-105), '1','1','1','1','2','1', '7', '내자', '제한경쟁입찰', 46000000),
  (7,  '7',  'GS-26-007', '공용 소형 XRD 분석장비',        '이서준', '도입중',   booth.d(-150), '1','1','1','1','3','1', '8', '외자', '협상에 의한 계약', 215000000),
  (8,  '8',  'GS-26-008', '대용량 스캐너·복합기',         '최도윤', '도입중',   booth.d(-190), '1','1','1','1','2','1', '7', '내자', '일반경쟁입찰', 9800000),
  (9,  '9',  'GS-26-009', '대용량 스캐너·복합기',         '최도윤', '도입중',   booth.d(-190), '1','1','1','1','2','1', '7', '내자', '일반경쟁입찰', 9800000),
  (10, '10', 'GS-26-010', '공용 FT-IR 분석장비',          '이서준', '도입예정', booth.d(-10),  '1','1','1','1','3','1', '8', '외자', '협상에 의한 계약', 98000000),
  (11, '11', 'GS-26-011', '세미나실 화상회의 시스템',     '이서준', '운영중',   booth.d(-300), '1','1','1','1','1','1', '6', '내자', '제한경쟁입찰', 32000000),
  (12, '12', 'GS-26-012', '공용 UV-Vis 분광광도계',       '박하은', '운영중',   booth.d(-290), '1','1','1','1','1','1', '6', '외자', '수의계약',       27500000),
  (13, '13', 'GS-26-013', '공용 초순수 제조장치',         '최도윤', '운영중',   booth.d(-280), '1','1','1','1','1','1', '6', '내자', '일반경쟁입찰', 38000000),
  (14, '14', 'GS-26-014', '공용 항온항습 챔버',           '박하은', '운영중',   booth.d(-270), '1','1','1','1','1','1', '6', '내자', '일반경쟁입찰', 21000000),
  (15, '15', 'GS-26-015', '대형 포스터 플로터',           '최도윤', '운영중',   booth.d(-295), '1','1','1','1','1','1', '6', '내자', '수의계약',       7400000),
  (16, '16', 'GS-26-016', '공용 초저온 냉동고(-80℃)',     '박하은', '운영중',   booth.d(-285), '1','1','1','1','1','1', '6', '내자', '일반경쟁입찰', 13200000),
  (17, '17', 'GS-26-017', '공용 초저온 냉동고(-80℃)',     '박하은', '운영중',   booth.d(-285), '1','1','1','1','1','1', '6', '내자', '일반경쟁입찰', 13200000),
  (18, '18', 'GS-26-018', '공용 고속 원심분리기',         '최도윤', '비가동',   booth.d(-300), '1','1','1','1','1','1', '6', '내자', '수의계약',       8900000),
  (19, '19', 'GS-26-019', '공용 열화상 카메라',           '이서준', '운영중',   booth.d(-260), '1','1','1','1','1','1', '6', '내자', '수의계약',       6200000),
  (20, '20', 'GS-26-020', '공용 광학현미경(정립형)',      '최도윤', '운영중',   booth.d(-275), '1','1','1','1','1','1', '6', '외자', '수의계약',       15800000);

-- ───────── 장비(equipments) ─────────
-- stage = 실제 도입 단계(review·quote·demo·spec·pre·bid·eval·nego·make·install). 운영 장비는 install(설치 완료).
insert into public.equipments
  (id, num, code, name, cat, use_type, eq_type, bid, fund, mgr, start, asset_no, nfec, maker, model, price,
   install_date, install_loc, state, mgr2, vendor, contact, note, created_at, stage, stage_at, stage_by) values
  (1,  '1',  'GS-26-001', '대형 강의실 AV·화상회의 시스템', '교육·회의설비', '공동활용', '내자', '제한경쟁', '기관 고유사업', '이서준', booth.d(-75),
       '', '', '', '', 128000000, '', '행정동 2층 대회의실', '도입중', '박하은', '', '',
       '데모 3개사 시연 후 사양 확정, 현재 기술평가 중. 천장 마이크 어레이·PTZ 카메라 2대·DSP 포함.', booth.ts(-150,'10:00'), 'eval', booth.ts(-15,'14:30'), '이서준'),
  (2,  '2',  'GS-26-002', '공용 3D 프린터', '연구지원 설비', '공동활용', '내자', '일반경쟁', '공동활용 장비지원사업(가상)', '박하은', booth.d(30),
       '', '', '', '', 18500000, '', '연구동 A동 1층 메이커스페이스', '도입예정', '최도윤', '', '',
       '필라멘트(FDM)형 1대 + 레진(SLA)형 1대 도입 검토. 업체 데모 진행 중, 사양 확정 예정.', booth.ts(-45,'09:30'), 'demo', booth.ts(-26,'11:00'), '박하은'),
  (3,  '3',  'GS-26-003', '공용 3D 프린터', '연구지원 설비', '공동활용', '내자', '일반경쟁', '공동활용 장비지원사업(가상)', '박하은', booth.d(30),
       '', '', '', '', 18500000, '', '연구동 A동 1층 메이커스페이스', '도입예정', '최도윤', '', '',
       '2호기. 1호기와 같은 일정으로 묶어 공고 예정.', booth.ts(-45,'09:30'), 'demo', booth.ts(-26,'11:00'), '박하은'),
  (4,  '4',  'GS-26-004', '연구실 공기질 측정 시스템', '안전·환경설비', '공동활용', '내자', '일반경쟁', '기관 고유사업', '최도윤', booth.d(-35),
       '', '', '', '', 24000000, '', '연구동 B동 전층 연구실', '도입예정', '박하은', '', '',
       '연구실 12곳 상시 측정(미세먼지·TVOC·CO2). 구매공고 중, 마감 후 기술평가.', booth.ts(-60,'10:30'), 'bid', booth.ts(-33,'09:40'), '최도윤'),
  (5,  '5',  'GS-26-005', '연구실 공기질 측정 시스템', '안전·환경설비', '공동활용', '내자', '일반경쟁', '기관 고유사업', '최도윤', booth.d(-35),
       '', '', '', '', 24000000, '', '연구동 C동 전층 연구실', '도입예정', '박하은', '', '',
       'C동 설치분. 4번과 한 공고로 진행.', booth.ts(-60,'10:30'), 'bid', booth.ts(-33,'09:40'), '최도윤'),
  (6,  '6',  'GS-26-006', '시약 관리 캐비닛·재고 시스템', '안전·환경설비', '공동활용', '내자', '제한경쟁', '기관 고유사업', '박하은', booth.d(-105),
       '', '', '세이프랩코리아', 'SL-RC600 + 바코드 재고관리', 46000000, '', '연구동 A동 지하1층 시약보관실', '도입중', '이서준', '세이프랩코리아', '031-000-0101',
       '기술평가 결과 1순위 업체와 협상 중. 재고관리 소프트웨어 포털 연동 범위 확정 필요.', booth.ts(-170,'13:00'), 'nego', booth.ts(-12,'10:00'), '박하은'),
  (7,  '7',  'GS-26-007', '공용 소형 XRD 분석장비', '분석장비', '공동활용', '외자', '협상계약', '공동활용 장비지원사업(가상)', '이서준', booth.d(-150),
       '', 'NFEC-2026-0172', '세오인스트루먼트', 'SX-Mini 3', 215000000, booth.d(40), '공동기기원 1층 분석실', '도입중', '박하은', '세오인스트루먼트 코리아', '02-000-0142',
       '계약 완료, 제작 중(납기 약 9주). 설치 전 항온항습·전원 공사 필요.', booth.ts(-200,'09:00'), 'make', booth.ts(-35,'15:00'), '이서준'),
  (8,  '8',  'GS-26-008', '대용량 스캐너·복합기', '사무기기', '행정지원', '내자', '일반경쟁', '기관 고유사업', '최도윤', booth.d(-190),
       'GIST-A-2026-0431', 'NFEC-2026-0210', '한빛오피스', 'HB-MFP 9500', 9800000, booth.d(6), '행정동 1층 복합기실', '도입중', '박하은', '한빛오피스솔루션', '02-000-0210',
       '설치 일정 협의 완료. 구형 복합기 반납 동시 진행.', booth.ts(-230,'10:00'), 'install', booth.ts(-8,'09:30'), '최도윤'),
  (9,  '9',  'GS-26-009', '대용량 스캐너·복합기', '사무기기', '행정지원', '내자', '일반경쟁', '기관 고유사업', '최도윤', booth.d(-190),
       'GIST-A-2026-0432', 'NFEC-2026-0211', '한빛오피스', 'HB-MFP 9500', 9800000, booth.d(6), '연구동 B동 2층 행정실', '도입중', '박하은', '한빛오피스솔루션', '02-000-0210',
       '2호기, 1호기와 같은 날 설치.', booth.ts(-230,'10:00'), 'install', booth.ts(-8,'09:30'), '최도윤'),
  (10, '10', 'GS-26-010', '공용 FT-IR 분석장비', '분석장비', '공동활용', '외자', '협상계약', '공동활용 장비지원사업(가상)', '이서준', booth.d(-10),
       '', '', '', '', 98000000, '', '공동기기원 1층 분석실', '도입예정', '박하은', '', '',
       '사용 수요조사 완료(7개 연구실). 사전규격 공개 중, 의견 접수 후 공고.', booth.ts(-40,'11:00'), 'pre', booth.ts(-9,'10:00'), '이서준'),
  (11, '11', 'GS-26-011', '세미나실 화상회의 시스템', '교육·회의설비', '공동활용', '내자', '제한경쟁', '기관 고유사업', '이서준', booth.d(-300),
       'GIST-A-2026-0118', 'NFEC-2026-0044', '라이트웨이브 시스템즈', 'LW-C400', 32000000, booth.d(-120), '본관 1층 세미나실', '운영중', '최도윤', '라이트웨이브 코리아', '02-000-0118',
       '월 평균 사용 38회. 소프트웨어 라이선스 갱신(매년 3월).', booth.ts(-300,'10:00'), 'install', booth.ts(-120,'16:00'), '이서준'),
  (12, '12', 'GS-26-012', '공용 UV-Vis 분광광도계', '분석장비', '공동활용', '외자', '수의계약', '공동활용 장비지원사업(가상)', '박하은', booth.d(-290),
       'GIST-A-2026-0127', 'NFEC-2026-0051', '세오인스트루먼트', 'SX-UV 2600', 27500000, booth.d(-115), '공동기기원 1층 분석실', '운영중', '이서준', '세오인스트루먼트 코리아', '02-000-0142',
       '연 1회 파장 교정(분기 점검). 사용 예약은 공동기기원 달력에서.', booth.ts(-290,'10:00'), 'install', booth.ts(-115,'16:00'), '박하은'),
  (13, '13', 'GS-26-013', '공용 초순수 제조장치', '연구지원 설비', '공동활용', '내자', '일반경쟁', '기관 고유사업', '최도윤', booth.d(-280),
       'GIST-A-2026-0133', 'NFEC-2026-0058', '아쿠아노바', 'AN-Ultra 20', 38000000, booth.d(-105), '연구동 A동 3층 공용장비실', '운영중', '박하은', '아쿠아노바테크', '031-000-0133',
       '필터 교체 주기 6개월(다음 교체 예정 12월).', booth.ts(-280,'10:00'), 'install', booth.ts(-105,'16:00'), '최도윤'),
  (14, '14', 'GS-26-014', '공용 항온항습 챔버', '연구지원 설비', '공동활용', '내자', '일반경쟁', '기관 고유사업', '박하은', booth.d(-270),
       'GIST-A-2026-0140', 'NFEC-2026-0066', '한빛계측', 'HC-TH 800', 21000000, booth.d(-100), '연구동 B동 3층 공용장비실', '운영중', '최도윤', '한빛계측', '02-000-0140',
       '온도 -10~80℃, 습도 20~95%. 연구실 예약 사용.', booth.ts(-270,'10:00'), 'install', booth.ts(-100,'16:00'), '박하은'),
  (15, '15', 'GS-26-015', '대형 포스터 플로터', '사무기기', '행정지원', '내자', '수의계약', '기관 고유사업', '최도윤', booth.d(-295),
       'GIST-A-2026-0144', 'NFEC-2026-0070', '한빛오피스', 'HB-Plot 44', 7400000, booth.d(-125), '행정동 1층 복합기실', '운영중', '박하은', '한빛오피스솔루션', '02-000-0210',
       '학술대회 포스터 출력용. 잉크 소모품은 행정실 보관.', booth.ts(-295,'10:00'), 'install', booth.ts(-125,'16:00'), '최도윤'),
  (16, '16', 'GS-26-016', '공용 초저온 냉동고(-80℃)', '연구지원 설비', '공동활용', '내자', '일반경쟁', '기관 고유사업', '박하은', booth.d(-285),
       'GIST-A-2026-0151', 'NFEC-2026-0077', '크라이오원', 'CO-U500', 13200000, booth.d(-110), '연구동 A동 지하1층 시약보관실', '운영중', '이서준', '크라이오원 코리아', '031-000-0151',
       '온도 경보 문자 수신자: 담당·부담당. 월 1회 성에 제거.', booth.ts(-285,'10:00'), 'install', booth.ts(-110,'16:00'), '박하은'),
  (17, '17', 'GS-26-017', '공용 초저온 냉동고(-80℃)', '연구지원 설비', '공동활용', '내자', '일반경쟁', '기관 고유사업', '박하은', booth.d(-285),
       'GIST-A-2026-0152', 'NFEC-2026-0078', '크라이오원', 'CO-U500', 13200000, booth.d(-110), '연구동 A동 지하1층 시약보관실', '운영중', '이서준', '크라이오원 코리아', '031-000-0151',
       '2호기. 1호기 고장 시 시료 이동용 예비.', booth.ts(-285,'10:00'), 'install', booth.ts(-110,'16:00'), '박하은'),
  (18, '18', 'GS-26-018', '공용 고속 원심분리기', '연구지원 설비', '공동활용', '내자', '수의계약', '기관 고유사업', '최도윤', booth.d(-300),
       'GIST-A-2026-0160', 'NFEC-2026-0083', '메디스핀', 'MS-HS 21K', 8900000, booth.d(-130), '연구동 B동 3층 공용장비실', '비가동', '박하은', '메디스핀 서비스센터', '031-000-0160',
       '로터 베어링 이상음으로 사용 중지, 수리 의뢰(견적 접수). 사용 재개 전까지 예약 막음.', booth.ts(-300,'10:00'), 'install', booth.ts(-130,'16:00'), '최도윤'),
  (19, '19', 'GS-26-019', '공용 열화상 카메라', '안전·환경설비', '공동활용', '내자', '수의계약', '기관 고유사업', '이서준', booth.d(-260),
       'GIST-A-2026-0171', 'NFEC-2026-0092', '세오인스트루먼트', 'SX-IR 320', 6200000, booth.d(-90), '행정동 2층 시설관리실', '운영중', '최도윤', '세오인스트루먼트 코리아', '02-000-0142',
       '전기·설비 점검과 연구실 안전점검에 대여. 대여는 시설관리실 문의.', booth.ts(-260,'10:00'), 'install', booth.ts(-90,'16:00'), '이서준'),
  (20, '20', 'GS-26-020', '공용 광학현미경(정립형)', '분석장비', '공동활용', '외자', '수의계약', '공동활용 장비지원사업(가상)', '최도윤', booth.d(-275),
       'GIST-A-2026-0178', 'NFEC-2026-0099', 'Norvex', 'NX-Scope U5', 15800000, booth.d(-95), '공동기기원 2층 관찰실', '운영중', '박하은', 'Norvex Korea', '02-000-0178',
       '명시야·형광 겸용. 카메라 소프트웨어 USB 동글 분실 주의.', booth.ts(-275,'10:00'), 'install', booth.ts(-95,'16:00'), '최도윤');

-- ───────── 운영 이력(equipment_history) — 화면은 prev → next 상태 변화만 보여 준다 ─────────
-- at = 'YYYY-MM-DD HH:MI' 글자
insert into public.equipment_history (id, at, code, name, prev, next, reason, author, work_type, note) values
  (1,  booth.d(-15)  || ' 14:30', 'GS-26-001', '대형 강의실 AV·화상회의 시스템', '도입예정', '도입중', '기술평가 착수(평가위원회 구성)', '이서준', '상태변경', ''),
  (2,  booth.d(-12)  || ' 10:00', 'GS-26-006', '시약 관리 캐비닛·재고 시스템',   '도입예정', '도입중', '기술평가 완료, 1순위 협상 개시',   '박하은', '상태변경', ''),
  (3,  booth.d(-90)  || ' 11:00', 'GS-26-007', '공용 소형 XRD 분석장비',          '도입예정', '도입중', '평가 결과 확정, 협상 개시',        '이서준', '상태변경', ''),
  (4,  booth.d(-130) || ' 09:30', 'GS-26-008', '대용량 스캐너·복합기',           '도입예정', '도입중', '평가 완료',                         '최도윤', '상태변경', ''),
  (5,  booth.d(-130) || ' 09:30', 'GS-26-009', '대용량 스캐너·복합기',           '도입예정', '도입중', '평가 완료',                         '최도윤', '상태변경', ''),
  (6,  booth.d(-120) || ' 16:00', 'GS-26-011', '세미나실 화상회의 시스템',       '도입중',   '운영중', '설치·검수 완료',                    '이서준', '상태변경', ''),
  (7,  booth.d(-115) || ' 16:00', 'GS-26-012', '공용 UV-Vis 분광광도계',         '도입중',   '운영중', '설치·검수 완료',                    '박하은', '상태변경', ''),
  (8,  booth.d(-105) || ' 16:00', 'GS-26-013', '공용 초순수 제조장치',           '도입중',   '운영중', '설치·검수 완료',                    '최도윤', '상태변경', ''),
  (9,  booth.d(-100) || ' 16:00', 'GS-26-014', '공용 항온항습 챔버',             '도입중',   '운영중', '설치·검수 완료',                    '박하은', '상태변경', ''),
  (10, booth.d(-125) || ' 16:00', 'GS-26-015', '대형 포스터 플로터',             '도입중',   '운영중', '설치·검수 완료',                    '최도윤', '상태변경', ''),
  (11, booth.d(-110) || ' 16:00', 'GS-26-016', '공용 초저온 냉동고(-80℃)',       '도입중',   '운영중', '설치·검수 완료',                    '박하은', '상태변경', ''),
  (12, booth.d(-110) || ' 16:00', 'GS-26-017', '공용 초저온 냉동고(-80℃)',       '도입중',   '운영중', '설치·검수 완료',                    '박하은', '상태변경', ''),
  (13, booth.d(-130) || ' 16:00', 'GS-26-018', '공용 고속 원심분리기',           '도입중',   '운영중', '설치·검수 완료',                    '최도윤', '상태변경', ''),
  (14, booth.d(-9)   || ' 15:20', 'GS-26-018', '공용 고속 원심분리기',           '운영중',   '비가동', '로터 베어링 이상음, 수리 의뢰',     '최도윤', '상태변경', ''),
  (15, booth.d(-90)  || ' 16:00', 'GS-26-019', '공용 열화상 카메라',             '도입중',   '운영중', '설치·검수 완료',                    '이서준', '상태변경', ''),
  (16, booth.d(-95)  || ' 16:00', 'GS-26-020', '공용 광학현미경(정립형)',        '도입중',   '운영중', '설치·검수 완료',                    '최도윤', '상태변경', '');

-- ───────── 데모결과: 지표 정의(demo_metric_defs) — equipment = 장비 이름(짝) ─────────
insert into public.demo_metric_defs (id, equipment, metric_key, label, unit, direction, sort, active, created_by, created_at, updated_by, updated_at) overriding system value values
  (1,  '대형 강의실 AV·화상회의 시스템', 'mic_range',    '음성 수음 거리',     'm',    'higher', 1, true, '이서준', booth.ts(-150,'10:00'), '이서준', booth.ts(-150,'10:00')),
  (2,  '대형 강의실 AV·화상회의 시스템', 'latency',      '영상 지연',          'ms',   'lower',  2, true, '이서준', booth.ts(-150,'10:00'), '이서준', booth.ts(-150,'10:00')),
  (3,  '대형 강의실 AV·화상회의 시스템', 'zoom',         '카메라 광학 줌',     '배',   'higher', 3, true, '이서준', booth.ts(-150,'10:05'), '이서준', booth.ts(-150,'10:05')),
  (4,  '대형 강의실 AV·화상회의 시스템', 'noise_cut',    '배경소음 억제',      'dB',   'higher', 4, true, '박하은', booth.ts(-148,'11:20'), '박하은', booth.ts(-148,'11:20')),
  (5,  '대형 강의실 AV·화상회의 시스템', 'install_days', '설치 소요',          '일',   'lower',  5, true, '이서준', booth.ts(-150,'10:05'), '이서준', booth.ts(-150,'10:05')),
  (6,  '대형 강의실 AV·화상회의 시스템', 'quote',        '견적가',             '백만원', 'lower', 6, true, '이서준', booth.ts(-150,'10:10'), '이서준', booth.ts(-150,'10:10')),
  (7,  '대형 강의실 AV·화상회의 시스템', 'compat',       '타 시스템 연동',     '',     'none',   7, true, '박하은', booth.ts(-148,'11:25'), '박하은', booth.ts(-148,'11:25')),
  (8,  '공용 3D 프린터', 'accuracy',  '치수 정밀도',     '±mm',  'lower',  1, true, '박하은', booth.ts(-30,'10:00'), '박하은', booth.ts(-30,'10:00')),
  (9,  '공용 3D 프린터', 'build',     '최대 출력 크기',  'mm',   'higher', 2, true, '박하은', booth.ts(-30,'10:00'), '박하은', booth.ts(-30,'10:00')),
  (10, '공용 3D 프린터', 'speed',     '출력 속도',       'mm/s', 'higher', 3, true, '박하은', booth.ts(-30,'10:05'), '박하은', booth.ts(-30,'10:05')),
  (11, '공용 3D 프린터', 'noise',     '작동 소음',       'dB',   'lower',  4, true, '박하은', booth.ts(-30,'10:05'), '박하은', booth.ts(-30,'10:05')),
  (12, '공용 3D 프린터', 'materials', '지원 소재',       '종',   'higher', 5, true, '박하은', booth.ts(-30,'10:10'), '박하은', booth.ts(-30,'10:10')),
  (13, '공용 3D 프린터', 'post',      '후처리 편의',     '',     'none',   6, true, '최도윤', booth.ts(-26,'15:00'), '최도윤', booth.ts(-26,'15:00')),
  (14, '공용 3D 프린터', 'quote',     '견적가',          '백만원', 'lower', 7, true, '박하은', booth.ts(-30,'10:10'), '박하은', booth.ts(-30,'10:10'));

insert into public.demo_metric_def_history (equipment, metric_key, action, before, after, changed_by, changed_at) values
  ('대형 강의실 AV·화상회의 시스템', 'mic_range',  'create', null, '{"label":"음성 수음 거리","unit":"m","direction":"higher","sort":1,"active":true}', '이서준', booth.ts(-150,'10:00')),
  ('대형 강의실 AV·화상회의 시스템', 'noise_cut',  'create', null, '{"label":"배경소음 억제","unit":"dB","direction":"higher","sort":4,"active":true}', '박하은', booth.ts(-148,'11:20')),
  ('대형 강의실 AV·화상회의 시스템', 'latency',    'update', '{"label":"영상 지연","unit":"초","direction":"lower","sort":2,"active":true}', '{"label":"영상 지연","unit":"ms","direction":"lower","sort":2,"active":true}', '이서준', booth.ts(-146,'09:40')),
  ('공용 3D 프린터', 'accuracy', 'create', null, '{"label":"치수 정밀도","unit":"±mm","direction":"lower","sort":1,"active":true}', '박하은', booth.ts(-30,'10:00')),
  ('공용 3D 프린터', 'post',     'create', null, '{"label":"후처리 편의","unit":"","direction":"none","sort":6,"active":true}', '최도윤', booth.ts(-26,'15:00'));

-- ───────── 데모 방문(demo_visits) — 제조사에 간 순서가 차수(round) ─────────
-- 첨부(보고서 PDF 등): 저장소 demo-files 버킷의 booth/ 아래 파일(placeholder)
insert into public.demo_visits (id, equipment, maker, round, label, visit_date, place, files, created_by, created_at, updated_by, updated_at) values
  (1, '대형 강의실 AV·화상회의 시스템', '라이트웨이브 시스템즈', 1, '1차 시연', booth.day(-140), '라이트웨이브 서울 데모룸(가상)', '[]', '이서준', booth.ts(-140,'17:30'), '이서준', booth.ts(-140,'17:30')),
  (2, '대형 강의실 AV·화상회의 시스템', '모아비전',             1, '1차 시연', booth.day(-128), '모아비전 판교 체험센터(가상)', '[]', '이서준', booth.ts(-128,'17:10'), '이서준', booth.ts(-128,'17:10')),
  (3, '대형 강의실 AV·화상회의 시스템', 'Norvex AV',            1, '1차 시연', booth.day(-115), 'Norvex AV 쇼룸(가상)',        '[{"name":"AV 데모 시연 보고서(1차).pdf","path":"booth/avconf-report-r1.pdf","type":"application/pdf"}]', '박하은', booth.ts(-115,'18:00'), '박하은', booth.ts(-115,'18:00')),
  (4, '대형 강의실 AV·화상회의 시스템', 'Norvex AV',            2, '재시연(지연 개선 펌웨어)', booth.day(-97), '행정동 2층 대회의실 현장', '[]', '이서준', booth.ts(-97,'16:40'), '이서준', booth.ts(-97,'16:40')),
  (5, '공용 3D 프린터', '페블텍',     1, '1차 시연', booth.day(-25), '페블텍 데모룸(가상)',            '[]', '박하은', booth.ts(-25,'16:30'), '박하은', booth.ts(-25,'16:30')),
  (6, '공용 3D 프린터', '다온메이커', 1, '1차 시연', booth.day(-18), '다온메이커 쇼룸(가상)',          '[]', '박하은', booth.ts(-18,'17:00'), '박하은', booth.ts(-18,'17:00')),
  (7, '공용 3D 프린터', 'Norvex 3D',  1, '1차 시연', booth.day(-11), 'Norvex 3D 어플리케이션랩(가상)', '[]', '최도윤', booth.ts(-11,'16:50'), '최도윤', booth.ts(-11,'16:50'));

-- ───────── 데모 결과(demo_results) — 모델 카드 1건 = 1행, visit_id 로 방문에 소속 ─────────
-- metrics: 문자열(단위는 지표 정의에서) 또는 {v, unit, cond}. photos: {name, path, caption}.
insert into public.demo_results
  (id, visit_id, equipment, maker, model, round, visit_date, place, conditions, sample_info, metrics, photos, files, cover, created_by, created_at, updated_by, updated_at)
overriding system value values
  (1, 1, '대형 강의실 AV·화상회의 시스템', '라이트웨이브 시스템즈', 'LW-C800', 1, booth.day(-140), '라이트웨이브 서울 데모룸(가상)',
   '데모룸 천장고 3m · 잔향 0.8초 · 인원 30명 가정, 에어컨 가동 상태에서 측정',
   '화상 상대방: 본원 서버실 단말(1Gbps 유선), 해상도 1080p30',
   '{"mic_range":{"v":"9","unit":"m","cond":"천장 마이크 어레이 1대, 에어컨 가동"},"latency":"180","zoom":"12","noise_cut":"22","install_days":"14","quote":"118","compat":"타사 SIP 연동은 별도 라이선스"}',
   '[]', '[]', 0, '이서준', booth.ts(-140,'17:40'), '이서준', booth.ts(-140,'17:40')),
  (2, 2, '대형 강의실 AV·화상회의 시스템', '모아비전', 'MV-Room Pro', 1, booth.day(-128), '모아비전 판교 체험센터(가상)',
   '체험센터 대회의실 · 인원 20명 가정 · 외부 소음 약 45dB',
   '화상 상대방: 본원 서버실 단말, 1080p30',
   '{"mic_range":{"v":"12","unit":"m","cond":"빔포밍 마이크 2대 연결"},"latency":"140","zoom":"20","noise_cut":"26","install_days":"10","quote":"135","compat":"SIP·H.323 기본 지원"}',
   '[]', '[]', 0, '이서준', booth.ts(-128,'17:20'), '이서준', booth.ts(-128,'17:20')),
  (3, 2, '대형 강의실 AV·화상회의 시스템', '모아비전', 'MV-Room Lite', 1, booth.day(-128), '모아비전 판교 체험센터(가상)',
   '위와 같은 방에서 이어서 측정(보급형 구성)',
   '카메라 1대 · 마이크 1대 구성',
   '{"mic_range":{"v":"7","unit":"m","cond":"마이크 1대"},"latency":"150","zoom":"8","noise_cut":"18","install_days":"7","quote":"82","compat":"SIP 기본 지원, H.323 미지원"}',
   '[]', '[]', 0, '이서준', booth.ts(-128,'17:25'), '이서준', booth.ts(-128,'17:25')),
  (4, 3, '대형 강의실 AV·화상회의 시스템', 'Norvex AV', 'NX-Hall 9', 1, booth.day(-115), 'Norvex AV 쇼룸(가상)',
   '쇼룸 강의실형 공간 · 인원 40명 가정 · 프로젝터 2대 동시 출력',
   '화상 상대방: 본원 서버실 단말, 1080p30. 발표자 추적 카메라 사용',
   '{"mic_range":{"v":"14","unit":"m","cond":"천장 마이크 어레이 2대"},"latency":"210","zoom":"30","noise_cut":"28","install_days":"21","quote":"142","compat":"주요 화상회의 앱 연동 인증(앱별 확인 필요)"}',
   '[{"name":"Norvex 시연 장면(1차)","path":"booth/avconf-demo-room.jpg","caption":"쇼룸 시연 — 발표자 추적 카메라"}]', '[]', 0, '박하은', booth.ts(-115,'18:10'), '박하은', booth.ts(-115,'18:10')),
  (5, 4, '대형 강의실 AV·화상회의 시스템', 'Norvex AV', 'NX-Hall 9', 2, booth.day(-97), '행정동 2층 대회의실 현장',
   '실제 설치 예정 장소(대회의실)에서 측정 · 인원 25명 · 펌웨어 2.4 적용',
   '1차에서 지적한 영상 지연 개선 확인. 마이크 위치는 천장 중앙 고정',
   '{"mic_range":{"v":"13","unit":"m","cond":"대회의실 실측, 천장 고정"},"latency":"95","zoom":"30","noise_cut":"27","install_days":"21","quote":"142","compat":"주요 화상회의 앱 연동 인증(앱별 확인 필요)"}',
   '[{"name":"대회의실 현장 측정","path":"booth/avconf-mic-test.jpg","caption":"대회의실 현장 — 마이크 수음 거리 측정"}]', '[]', 0, '이서준', booth.ts(-97,'16:50'), '이서준', booth.ts(-97,'16:50')),
  (6, 5, '공용 3D 프린터', '페블텍', 'PT-F300', 1, booth.day(-25), '페블텍 데모룸(가상)',
   'PLA 필라멘트 · 노즐 0.4mm · 층 두께 0.2mm · 실내 24℃',
   '교정 큐브 20mm 3개 · 기어 세트(모듈 1.5) · 얇은 벽 테스트',
   '{"accuracy":{"v":"0.15","cond":"교정 큐브 20mm 평균 편차"},"build":{"v":"300x300x350","unit":"mm"},"speed":"150","noise":"52","materials":"6","post":"서포트 수동 제거, 후처리 간단","quote":"16.5"}',
   '[{"name":"교정 큐브·기어 출력물","path":"booth/3dp-sample-print.jpg","caption":"FDM 샘플 출력물"}]', '[]', 0, '박하은', booth.ts(-25,'16:40'), '박하은', booth.ts(-25,'16:40')),
  (7, 6, '공용 3D 프린터', '다온메이커', 'DM-R200', 1, booth.day(-18), '다온메이커 쇼룸(가상)',
   '표준 레진 · 층 두께 0.05mm · 후경화 30분 포함',
   '치아 모형형 곡면 샘플 · 교정 큐브 20mm 3개',
   '{"accuracy":{"v":"0.05","cond":"교정 큐브 20mm 평균 편차"},"build":{"v":"200x125x210","unit":"mm"},"speed":"35","noise":"44","materials":"4","post":"세척·후경화 장비 필수, 환기 필요","quote":"14.8"}',
   '[{"name":"레진 곡면 샘플","path":"booth/3dp-resin-sample.jpg","caption":"레진(SLA) 샘플 출력물"}]', '[]', 0, '박하은', booth.ts(-18,'17:10'), '박하은', booth.ts(-18,'17:10')),
  (8, 7, '공용 3D 프린터', 'Norvex 3D', 'NX-P400', 1, booth.day(-11), 'Norvex 3D 어플리케이션랩(가상)',
   'PETG·ABS 필라멘트 · 밀폐 챔버 · 듀얼 노즐 · 층 두께 0.2mm',
   '교정 큐브 20mm 3개 · 지그형 부품(PETG) · 서포트 수용성 소재 시험',
   '{"accuracy":{"v":"0.10","cond":"교정 큐브 20mm 평균 편차"},"build":{"v":"400x400x450","unit":"mm"},"speed":"200","noise":"58","materials":"12","post":"수용성 서포트로 후처리 편함","quote":"22.4"}',
   '[]', '[{"name":"NX-P400 사양서.pdf","path":"booth/3dp-spec-sheet.pdf","type":"application/pdf"}]', 0, '최도윤', booth.ts(-11,'17:00'), '최도윤', booth.ts(-11,'17:00'));

-- 값 변경 이력(조작방지) — 입력 실수 정정 예
insert into public.demo_value_history (equipment, maker, model, round, before, after, changed_by, changed_at) values
  ('대형 강의실 AV·화상회의 시스템', 'Norvex AV', 'NX-Hall 9', 1,
   '{"latency":"120","quote":"142"}', '{"latency":"210","quote":"142"}', '박하은', booth.ts(-114,'09:20')),
  ('공용 3D 프린터', '다온메이커', 'DM-R200', 1,
   '{"speed":"350"}', '{"speed":"35"}', '박하은', booth.ts(-17,'09:15'));

-- ───────── 비교 메모(demo_chat) — 장비 이름별 보드. makers 는 구버전 잔존(빈 배열) ─────────
insert into public.demo_chat (id, equipment, makers, body, author, member_uid, created_at, title, sort_order, width) overriding system value values
  (1, '대형 강의실 AV·화상회의 시스템', '{}', '3개사 모두 1080p 지원. 대회의실은 천장고가 4m라 마이크 어레이 설치 높이 확인 필요. 모아비전은 천장고 3m 이하 기준 시연이라 현장 측정이 따로 필요.', '이서준', '00000000-0000-4000-8000-0000000000a1', booth.ts(-125,'10:00'), '시연 총평', 1, 2),
  (2, '대형 강의실 AV·화상회의 시스템', '{}', 'Norvex 1차 때 영상 지연 210ms로 가장 높았음. 펌웨어 개선 후 대회의실 현장에서 95ms까지 줄어 재시연으로 확인함. 평가 때 이 수치 근거로 쓸 것.', '박하은', '00000000-0000-4000-8000-0000000000a2', booth.ts(-96,'11:30'), '지연 이슈 해소', 2, 1),
  (3, '대형 강의실 AV·화상회의 시스템', '{}', '견적: 라이트웨이브 118 · 모아비전 135(Lite 82) · Norvex 142 (백만원). 예산 128백만원이라 Norvex는 협상 여지 확인 필요. 설치 소요도 21일로 가장 김 — 방학 일정과 맞출 것.', '이서준', '00000000-0000-4000-8000-0000000000a1', booth.ts(-94,'15:20'), '예산·일정 검토', 3, 1),
  (4, '공용 3D 프린터', '{}', '수요: 시제품 지그·케이스(FDM)와 미세 부품(레진) 두 갈래. 1대로 합치기 어렵다는 의견이 많아 FDM 1 + 레진 1로 가는 안이 유력.', '박하은', '00000000-0000-4000-8000-0000000000a2', booth.ts(-22,'10:00'), '구성 방향', 1, 2),
  (5, '공용 3D 프린터', '{}', '레진은 세척·후경화 장비와 환기가 필요해서 메이커스페이스 안에 별도 공간이 있는지 시설팀에 확인. 레진 폐기물 처리 절차도 정리해야 함.', '최도윤', '00000000-0000-4000-8000-0000000000a3', booth.ts(-10,'14:00'), '설치 공간·안전', 2, 1),
  (6, '공용 3D 프린터', '{}', '속도는 Norvex가 빠르나 소음 58dB. 메이커스페이스가 열린 공간이라 소음 기준도 사양에 넣을지 논의 예정.', '이서준', '00000000-0000-4000-8000-0000000000a1', booth.ts(-9,'16:10'), '소음 기준', 3, 1);
`,hn=`-- 체험관 가상 데이터 — 장비 ↔ 업무·일정 연결. 장비 id 는 30-equipment.sql, 업무 num 은 10-work.sql, 일정 id 는 20-calendar.sql 기준.
insert into public.work_equipments (work_num, equipment_id, created_at) values
  -- 도입 진행 장비
  (15, 1, booth.ts(-70,'10:00')), (44, 1, booth.ts(-60,'10:00')),       -- 대형 강의실 AV·화상회의 ↔ 회의실 예약 개선·규칙
  (14, 2, booth.ts(-30,'10:00')), (31, 2, booth.ts(-28,'10:00')),       -- 공용 3D 프린터 ↔ 타당성 검토·공용 공간 배정
  (14, 3, booth.ts(-30,'10:00')), (31, 3, booth.ts(-28,'10:00')),
  (49, 4, booth.ts(-20,'10:00')), (20, 4, booth.ts(-18,'10:00')),       -- 공기질 측정 ↔ 소방·전기 합동점검·안전점검의 날
  (49, 5, booth.ts(-20,'10:00')), (20, 5, booth.ts(-18,'10:00')),
  (9, 6, booth.ts(-50,'10:00')),  (20, 6, booth.ts(-18,'10:00')),       -- 시약 캐비닛 ↔ 안전관리 규정 개정·안전점검의 날
  (14, 7, booth.ts(-120,'10:00')),(46, 7, booth.ts(-100,'10:00')), (13, 7, booth.ts(-90,'10:00')), -- XRD
  (21, 8, booth.ts(-60,'10:00')), (46, 8, booth.ts(-150,'10:00')),      -- 복합기 ↔ 복합기 유지보수 계약·구매 요청
  (21, 9, booth.ts(-60,'10:00')), (46, 9, booth.ts(-150,'10:00')),
  (14, 10, booth.ts(-8,'10:00')), (13, 10, booth.ts(-8,'10:00')), (45, 10, booth.ts(-6,'10:00')), -- FT-IR
  -- 운영 장비
  (44, 11, booth.ts(-50,'10:00')), (15, 11, booth.ts(-50,'10:00')),
  (13, 12, booth.ts(-40,'10:00')), (45, 12, booth.ts(-35,'10:00')), (38, 12, booth.ts(-30,'10:00')),
  (38, 14, booth.ts(-30,'10:00')),
  (32, 18, booth.ts(-8,'10:00')),                                        -- 원심분리기 ↔ 수리 견적 확인
  (49, 19, booth.ts(-20,'10:00')),
  (54, 20, booth.ts(-25,'10:00')), (27, 20, booth.ts(-25,'10:00'));

insert into public.event_equipments (event_id, equipment_id, created_at) values
  (1047, 12, booth.ts(-5,'10:00')), (1047, 20, booth.ts(-5,'10:00')),    -- 장비 공동활용 이용 현황 보고
  (1035, 12, booth.ts(-12,'10:00')), (1035, 13, booth.ts(-12,'10:00')),  -- 공동활용 현황 점검
  (1063, 12, booth.ts(-3,'10:00')), (1063, 20, booth.ts(-3,'10:00')),    -- 이용료 정산
  (1037, 11, booth.ts(-6,'10:00')),                                      -- 연구재단 화상회의
  (1038, 4, booth.ts(-5,'10:00')), (1038, 5, booth.ts(-5,'10:00')),      -- 안전 점검 사전 안내
  (1053, 4, booth.ts(-3,'10:00')), (1053, 5, booth.ts(-3,'10:00')), (1053, 6, booth.ts(-3,'10:00')), -- 안전 점검 현장 확인
  (1052, 6, booth.ts(-3,'10:00'));                                       -- 안전관리 교육

-- 연결 시 자동으로 쌓인 연결 기록('방금 연결')은 지운다
delete from public.work_link_log where target_type = 'equipment';
`,fn=`-- 체험관 가상 데이터 — 공지·알림·할 일·메모·자료실·엔젤이 대화 (전부 지어낸 내용)
-- 저장소 파일(booth/ 아래): notice-files = n-settlement-schedule.pdf, n-room-map.png
--                           resource-files = r-expense-form.hwp, r-safety-manual.pdf, r-regulation.pdf

-- ───────── 공지사항 ─────────
insert into public.notices(num, pinned, cat, dept, dept_mgr, title, body, ref, posted_date, posted_time, start_date, end_date, target, created_at, attachments) overriding system value values
(1, false, '일반', '연구지원팀', '이서준', '2026년 연구지원팀 업무 분장 안내',
 E'올해 팀 업무 분장을 아래와 같이 안내드립니다.\\n- 연구비 정산·집행 점검: 박하은\\n- 협약·평가 지원: 최도윤\\n- 세미나·교육, 규정 개정: 김지스트\\n- 총괄: 이서준 팀장\\n\\n변경 사항이 있으면 팀장에게 말씀해 주세요.',
 '', booth.d(-170), '09:10', booth.d(-170), '', '팀 전체', booth.ts(-170,'09:10'), '[]'),
(2, false, '교육', '연구지원팀', '김지스트', '연구윤리 온라인 교육 이수 안내',
 E'연구윤리 온라인 교육을 아래 기간 내에 이수해 주세요.\\n- 대상: 팀 전체\\n- 소요 시간: 약 1시간\\n- 이수증은 PDF로 저장해 팀 공유 폴더에 올려 주세요.',
 'https://www.gist.ac.kr', booth.d(-140), '10:00', booth.d(-140), booth.d(-110), '팀 전체', booth.ts(-140,'10:00'), '[]'),
(3, false, '안전', '연구지원팀', '최도윤', '연구실 안전 정기점검 일정 안내',
 E'상반기 연구실 안전 정기점검을 진행합니다.\\n점검 당일 소화기 위치, 비상구 적치물, 시약장 라벨을 확인해 주세요.\\n점검표는 자료실에서 내려받을 수 있습니다.',
 '', booth.d(-120), '14:20', booth.d(-120), booth.d(-100), '팀 전체', booth.ts(-120,'14:20'), '[]'),
(4, false, '시설', '연구지원팀', '이서준', '3층 공용 회의실 도어락 교체 안내',
 E'3층 공용 회의실 도어락을 교체했습니다. 기존 비밀번호는 더 이상 쓸 수 없습니다.\\n새 비밀번호는 팀 단톡방에서 확인해 주세요.',
 '', booth.d(-95), '11:30', booth.d(-95), booth.d(-80), '팀 전체', booth.ts(-95,'11:30'), '[]'),
(5, false, '일반', '연구지원팀', '박하은', '연구비 카드 사용 시 증빙 첨부 요령',
 E'카드 결제 후 증빙은 결제일 기준 3일 이내에 시스템에 올려 주세요.\\n- 영수증 사진은 금액·가맹점·일자가 모두 보이게 촬영\\n- 회의비는 참석자 명단 필수\\n- 10만원 이상 물품은 견적서 함께 첨부',
 '', booth.d(-80), '09:40', booth.d(-80), '', '팀 전체', booth.ts(-80,'09:40'), '[]'),
(6, false, '보안', '연구지원팀', '김지스트', '업무용 PC 보안 업데이트 및 비밀번호 변경 안내',
 E'분기별 보안 점검에 따라 업무용 PC의 윈도우 업데이트와 비밀번호 변경이 필요합니다.\\n- 비밀번호는 12자 이상, 이전 3회 재사용 불가\\n- 개인 USB 사용은 지양해 주세요.',
 '', booth.d(-62), '10:15', booth.d(-62), booth.d(-45), '팀 전체', booth.ts(-62,'10:15'), '[]'),
(7, false, '교육', '연구지원팀', '김지스트', '연구과제 협약 실무 세미나 개최 (하반기)',
 E'협약 변경·정산 시 자주 나오는 질문을 사례 중심으로 정리해 공유합니다.\\n- 장소: 3층 공용 회의실\\n- 사전 질문은 팀 게시판에 남겨 주세요.',
 '', booth.d(-48), '15:00', booth.d(-48), booth.d(-34), '팀 전체', booth.ts(-48,'15:00'), '[]'),
(8, false, '시설', '연구지원팀', '이서준', '연구장비 공동활용 예약 방식 변경 안내',
 E'장비 예약은 이제 포털 일정에서 장비를 선택해 직접 등록합니다.\\n예약 후 사용 기록을 남겨 주세요. 문의는 최도윤 선생님께 부탁드립니다.',
 '', booth.d(-35), '09:30', booth.d(-35), '', '팀 전체', booth.ts(-35,'09:30'), '[]'),
(9, false, '일반', '연구지원팀', '박하은', '내부 규정 개정(안) 의견 수렴',
 E'연구비 집행 규정 중 출장비 정산 기준 개정(안)에 대한 의견을 받습니다.\\n개정(안)은 자료실의 내부 규정 문서를 참고해 주세요.',
 '', booth.d(-26), '13:50', booth.d(-26), booth.d(-12), '팀 전체', booth.ts(-26,'13:50'), '[]'),
(10, false, '안전', '연구지원팀', '최도윤', '소방 대피 훈련 실시 안내',
 E'소방 대피 훈련을 실시합니다. 훈련 방송이 나오면 가까운 비상계단으로 이동해 1층 광장에 집결해 주세요.',
 '', booth.d(-19), '10:20', booth.d(-19), booth.d(-9), '팀 전체', booth.ts(-19,'10:20'), '[]'),
(11, false, '일반', '연구지원팀', '이서준', '연말 휴가 사용 계획 제출 안내',
 E'연말 연차 사용 계획을 이번 달 말까지 팀장에게 알려 주세요.\\n업무 공백이 없도록 겹치는 기간은 서로 조율 부탁드립니다.',
 '', booth.d(-12), '16:05', booth.d(-12), booth.d(12), '팀 전체', booth.ts(-12,'16:05'), '[]'),
(12, false, '시설', '연구지원팀', '이서준', '3층 공용 회의실 조명 공사 안내',
 E'회의실 LED 조명 교체 공사로 아래 기간 3층 공용 회의실을 쓸 수 없습니다. 이 기간 회의는 2층 소회의실을 이용해 주세요.\\n배치도는 첨부 파일을 참고해 주세요.',
 '', booth.d(-6), '11:00', booth.d(-6), booth.d(5), '팀 전체', booth.ts(-6,'11:00'),
 jsonb_build_array(jsonb_build_object('name','회의실 이용 안내 배치도.png','path','booth/n-room-map.png','size',48200,'type','image/png'))),
(13, false, '교육', '연구지원팀', '김지스트', '연구비 시스템 사용자 교육 신청 (선착순)',
 E'신규 연구비 시스템 사용자 교육을 진행합니다.\\n- 일시: 다음 주 목요일 14:00~16:00\\n- 장소: 2층 교육실\\n- 신청은 김지스트 선생님께 메신저로 알려 주세요.',
 '', booth.d(-4), '09:20', booth.d(-4), booth.d(10), '팀 전체', booth.ts(-4,'09:20'), '[]'),
(14, false, '일반', '연구지원팀', '박하은', '연구비 정산 실적 보고 취합 협조 요청',
 E'각 과제 담당자는 월말 정산 실적을 공유 시트에 입력해 주세요.\\n입력이 끝난 뒤 박하은 선생님께 알려 주시면 일괄 점검하겠습니다.',
 '', booth.d(-2), '14:40', booth.d(-2), booth.d(8), '팀 전체', booth.ts(-2,'14:40'), '[]'),
(15, true, '안전', '연구지원팀', '최도윤', '[필독] 겨울철 연구실 전열기구 사용 주의',
 E'겨울철 전열기구 사용이 늘어나는 시기입니다.\\n- 퇴근 시 전원 플러그를 뽑아 주세요.\\n- 멀티탭 문어발식 연결은 금지입니다.\\n- 이상 발열이 있으면 즉시 최도윤 선생님께 알려 주세요.',
 '', booth.d(-9), '09:00', booth.d(-9), booth.d(30), '팀 전체', booth.ts(-9,'09:00'), '[]'),
(16, true, '일반', '연구지원팀', '박하은', '이번 달 연구비 정산 일정 안내',
 E'이번 달 연구비 정산 일정입니다.\\n- 증빙 제출 마감: 이번 달 25일\\n- 담당자 1차 점검: 26~28일\\n- 최종 확정 및 보고: 말일\\n\\n증빙이 늦어지면 다음 달로 이월되니 기한을 꼭 지켜 주세요. 자세한 일정표는 첨부 파일을 확인해 주세요.',
 'https://www.iris.go.kr', booth.d(-1), '09:30', booth.d(-1), booth.d(14), '팀 전체', booth.ts(-1,'09:30'),
 jsonb_build_array(jsonb_build_object('name','연구비 정산 일정표.pdf','path','booth/n-settlement-schedule.pdf','size',152300,'type','application/pdf')));

update public.notices set author = dept_mgr;

-- ───────── 정기알림 (매월 반복 띠) ─────────
-- 오늘이 기간 안에 들어오도록 오늘 날짜 기준으로 잡는다(체험이 며칠에 열려도 띠가 보이게).
-- 화면 맨 위 띠는 **하나만**(2026-11-19 사용자 '아래 것 지워서 한 개만') — 2번은 오늘과 겹치지 않는 주에 둔다(정기알림 목록에는 그대로 보임),
-- 아래에 뜨던 3번('다음 달 회의실·장비 예약 현황을 미리 점검하세요', 김지스트 개인)은 뺐다
insert into public.recurring_notices(id, message, day_from, day_to, notice_num, enabled, author, author_uid, cycle, recipient_uids, scope, owner_uid) overriding system value values
(1, '월말 연구비 정산 증빙 제출 기한을 확인해 주세요.',
 greatest(1, extract(day from booth.day(0))::int - 3), least(31, extract(day from booth.day(0))::int + 5), 16, true,
 '이서준', '00000000-0000-4000-8000-0000000000a1', 'monthly', null, 'team', null),
(2, '연구실 안전 점검표를 확인하고 이상 사항을 공유해 주세요.',
 case when extract(day from booth.day(0))::int <= 15 then 21 else 1 end,
 case when extract(day from booth.day(0))::int <= 15 then 27 else 7 end, null, true,
 '최도윤', '00000000-0000-4000-8000-0000000000a3', 'monthly', null, 'team', null);

-- ───────── 할 일 (김지스트) ─────────
insert into public.quick_todo_lists(id, owner_uid, name, sort_order, created_at) overriding system value values
(1, '00000000-0000-4000-8000-00000000b007', '이번 주 업무', 1, booth.ts(-14,'09:00')),
(2, '00000000-0000-4000-8000-00000000b007', '정산·행정', 2, booth.ts(-14,'09:05')),
(3, '00000000-0000-4000-8000-00000000b007', '개인 메모', 3, booth.ts(-14,'09:10'));

insert into public.quick_todos(id, owner_uid, title, done_at, created_at, sort_order, list_id, parent_id, notes, due_date, due_time, starred_at) overriding system value values
(1, '00000000-0000-4000-8000-00000000b007', '협약 변경 공문 초안 검토', null, booth.ts(-5,'10:00'), 1, 1, null, '변경 사유와 기간 표기 다시 확인하기', booth.day(0), '16:00', booth.ts(-2,'09:00')),
(2, '00000000-0000-4000-8000-00000000b007', '회의실 공사 안내문 팀 단톡방 공유', booth.ts(-1,'11:00'), booth.ts(-5,'10:05'), 2, 1, null, null, booth.day(-1), null, null),
(3, '00000000-0000-4000-8000-00000000b007', '세미나 발표 자료 최종본 인쇄 요청', null, booth.ts(-4,'15:00'), 3, 1, null, '30부, 단면 컬러', booth.day(1), '10:00', booth.ts(-1,'18:00')),
(4, '00000000-0000-4000-8000-00000000b007', '인쇄소 견적 확인', null, booth.ts(-4,'15:10'), 4, 1, 3, null, booth.day(0), null, null),
(5, '00000000-0000-4000-8000-00000000b007', '교육 참석자 명단 정리', null, booth.ts(-3,'09:30'), 5, 1, null, null, booth.day(3), null, null),
(6, '00000000-0000-4000-8000-00000000b007', '연구비 카드 증빙 누락 건 확인', null, booth.ts(-6,'14:00'), 1, 2, null, '박하은 선생님께 목록 받기', booth.day(1), null, booth.ts(-3,'10:00')),
(7, '00000000-0000-4000-8000-00000000b007', '출장비 정산서 제출', booth.ts(-2,'17:30'), booth.ts(-8,'09:00'), 2, 2, null, null, booth.day(-2), null, null),
(8, '00000000-0000-4000-8000-00000000b007', '내부 규정 개정(안) 의견 취합', null, booth.ts(-7,'13:00'), 3, 2, null, null, booth.day(6), null, null),
(9, '00000000-0000-4000-8000-00000000b007', '월말 정산 실적 시트 입력', null, booth.ts(-2,'09:00'), 4, 2, null, null, booth.day(7), '15:00', null),
(10, '00000000-0000-4000-8000-00000000b007', '사무용품 주문 (A4, 포스트잇)', booth.ts(-3,'13:00'), booth.ts(-9,'10:00'), 1, 3, null, null, null, null, null),
(11, '00000000-0000-4000-8000-00000000b007', '연말 연차 계획 팀장님께 말씀드리기', null, booth.ts(-2,'16:00'), 2, 3, null, null, booth.day(4), null, null),
(12, '00000000-0000-4000-8000-00000000b007', '공용 장비 사용 기록 양식 확인', null, booth.ts(-1,'10:00'), 6, null, null, null, null, null, null);

-- ───────── 메모 (개인 메모는 작성자와 공유받은 사람만 본다) ─────────
insert into public.page_notes(id, path, author, author_uid, content, shared, drawing_id, created_at, updated_at, x, y) overriding system value values
(1, '/', '김지스트', '00000000-0000-4000-8000-00000000b007', E'이번 주 할 일\\n- 협약 변경 공문 검토\\n- 세미나 자료 인쇄', '{}', null, booth.ts(-1,'09:10'), booth.ts(-1,'09:10'), 120, 140),
(2, '/', '이서준', '00000000-0000-4000-8000-0000000000a1', '다음 주 팀 회의 전에 정산 일정표 공유 부탁드립니다.', '{김지스트}', null, booth.ts(-2,'17:40'), booth.ts(-2,'17:40'), 520, 180),
(3, '/calendar', '김지스트', '00000000-0000-4000-8000-00000000b007', '회의실 공사 기간에는 2층 소회의실 예약이 먼저 차니 미리 잡아 둘 것', '{박하은,최도윤}', null, booth.ts(-3,'11:20'), booth.ts(-3,'11:20'), 360, 220),
(4, '/work', '박하은', '00000000-0000-4000-8000-0000000000a2', '월말 정산 업무는 증빙 접수가 25일이라 그 전에 담당자 확인이 필요해요.', '{김지스트,이서준}', null, booth.ts(-2,'10:30'), booth.ts(-2,'10:30'), 460, 120);

insert into public.page_note_replies(id, note_id, author, author_uid, content, created_at) overriding system value values
(1, 2, '김지스트', '00000000-0000-4000-8000-00000000b007', '네, 내일 오전까지 정리해서 올리겠습니다.', booth.ts(-2,'18:05')),
(2, 3, '박하은', '00000000-0000-4000-8000-0000000000a2', '확인했습니다. 저도 같은 날 회의가 있어서 미리 잡아 둘게요.', booth.ts(-3,'13:10')),
(3, 4, '김지스트', '00000000-0000-4000-8000-00000000b007', '감사합니다. 담당자별로 이번 주 안에 확인하겠습니다.', booth.ts(-2,'14:00'));

-- ───────── 자료실 ─────────
insert into public.resources(num, cat, title, url, note, author, created_at, attachments) overriding system value values
(1, '참고', 'GIST 공식 누리집', 'https://www.gist.ac.kr', '학교 공지·학사 일정 확인용', '김지스트', booth.ts(-150,'10:00'), '[]'),
(2, '참고', '국가과학기술지식정보서비스 (NTIS)', 'https://www.ntis.go.kr', '과제 검색, 성과 확인', '박하은', booth.ts(-140,'11:00'), '[]'),
(3, '업무', '범부처 통합연구지원시스템 (IRIS)', 'https://www.iris.go.kr', '협약·정산 등록 시스템 바로가기', '박하은', booth.ts(-135,'11:10'), '[]'),
(4, '업무', '연구비 집행 증빙 서식 모음', '', '카드·계좌이체 증빙, 회의비 참석자 명단 서식이 들어 있습니다.', '박하은', booth.ts(-100,'14:00'),
 jsonb_build_array(jsonb_build_object('name','연구비 집행 증빙 서식 모음.hwp','path','booth/r-expense-form.hwp','size',87500,'type','application/x-hwp'))),
(5, '업무', '연구실 안전 점검표 및 점검 매뉴얼', '', '정기점검 시 출력해서 쓰세요.', '최도윤', booth.ts(-90,'10:30'),
 jsonb_build_array(jsonb_build_object('name','연구실 안전 점검 매뉴얼.pdf','path','booth/r-safety-manual.pdf','size',264000,'type','application/pdf'))),
(6, '업무', '연구비 집행 규정 (내부 규정집)', '', '출장비 정산 기준 개정(안) 포함 최신본입니다.', '김지스트', booth.ts(-26,'13:40'),
 jsonb_build_array(jsonb_build_object('name','연구비 집행 규정(개정안).pdf','path','booth/r-regulation.pdf','size',198400,'type','application/pdf'))),
(7, '교육', '연구윤리 온라인 교육 바로가기', 'https://www.gist.ac.kr', '이수증은 PDF로 저장해 팀 공유 폴더에 올려 주세요.', '김지스트', booth.ts(-140,'10:20'), '[]'),
(8, '기타', '자주 쓰는 연락처', '', E'시설팀 내선 1234 (가상)\\n전산팀 내선 5678 (가상)\\n회의실 예약 문의는 연구지원팀으로', '이서준', booth.ts(-70,'09:00'), '[]');

-- ───────── 엔젤이 예시 대화 (김지스트) ─────────
insert into public.angel_chats(id, uid, who, text, lines, created_at) values
(1, '00000000-0000-4000-8000-00000000b007', 'user', '다음 주 화요일 오후 2시 박하은이랑 협약 회의 잡아줘', null, booth.ts(-6,'10:12')),
(2, '00000000-0000-4000-8000-00000000b007', 'bot', '일정을 등록했어요.', '["제목: 협약 회의","일시: 다음 주 화요일 14:00~15:00","참석: 김지스트, 박하은","장소: 2층 소회의실"]'::jsonb, booth.ts(-6,'10:12') + interval '3 seconds'),
(3, '00000000-0000-4000-8000-00000000b007', 'user', '이번 주 내 일정 알려줘', null, booth.ts(-3,'09:05')),
(4, '00000000-0000-4000-8000-00000000b007', 'bot', '이번 주 일정이 4건 있어요.', '["월 10:00 팀 주간 회의","화 14:00 협약 회의 (박하은)","수 15:00 연구비 시스템 교육 준비","금 11:00 정산 점검"]'::jsonb, booth.ts(-3,'09:05') + interval '3 seconds'),
(5, '00000000-0000-4000-8000-00000000b007', 'user', '연구비 정산 관련 업무 요약해줘', null, booth.ts(-2,'13:30')),
(6, '00000000-0000-4000-8000-00000000b007', 'bot', '연구비 정산 관련 업무 요약이에요. 이번 달 증빙 제출 마감(25일)이 가장 가깝고, 카드 증빙 누락 확인이 남아 있어요.', '["진행중: 월말 정산 실적 시트 입력 (김지스트)","진행중: 카드 증빙 누락 확인 (박하은)","완료: 출장비 정산서 제출"]'::jsonb, booth.ts(-2,'13:30') + interval '3 seconds'),
(7, '00000000-0000-4000-8000-00000000b007', 'user', '다음 달 출장 일정 있어?', null, booth.ts(-1,'16:20')),
(8, '00000000-0000-4000-8000-00000000b007', 'bot', '등록된 출장 일정이 없어요. 출장이 정해지면 "OO 출장 등록해줘"라고 말씀해 주세요. 날짜와 장소를 알려 주시면 일정으로 등록해 드릴게요.', null, booth.ts(-1,'16:20') + interval '3 seconds');

-- ───────── 포털개선 기록 ─────────
insert into public.improvements(num, urgent, type, loc, title, content, author, mgr, proposed_date, status, end_date, reason, created_at) overriding system value values
(1, false, '개선', '공지', '공지 목록에 분류별 필터가 있으면 좋겠어요', '공지가 많아지니 안전·교육 같은 분류만 따로 보고 싶습니다.', '박하은', '이서준', booth.d(-40), '완료', booth.d(-30), '분류 칩으로 필터를 추가했습니다.', booth.ts(-40,'10:00')),
(2, false, '개선', '캘린더', '회의실 일정이 겹칠 때 알려 주세요', '같은 시간에 같은 회의실을 잡으면 경고가 떴으면 합니다.', '최도윤', '이서준', booth.d(-28), '검토중', '', '', booth.ts(-28,'14:00')),
(3, true, '오류', '업무', '월말 업무가 마감일 지나도 진행중으로 남아요', '완료 처리 알림이 없어서 마감 지난 업무가 계속 보입니다.', '김지스트', '이서준', booth.d(-15), '접수', '', '', booth.ts(-15,'09:30')),
(4, false, '개선', '자료실', '자료실 서식을 한 번에 내려받고 싶어요', '여러 서식을 묶어서 받을 수 있으면 편하겠습니다.', '박하은', '이서준', booth.d(-9), '보류', '', '우선순위 낮음, 다음 개편에 검토', booth.ts(-9,'11:00')),
(5, false, '개선', '할 일', '할 일에 반복 기능이 있으면 좋겠어요', '매월 같은 날 해야 하는 일을 자동으로 만들어 주세요.', '김지스트', '이서준', booth.d(-3), '접수', '', '', booth.ts(-3,'16:00'));

`,wn=`-- 행사안내 — 행사 자체는 코드 상수(booth/content.tsx 의 BOOTH_EVENTS, id 'booth-…')이고 DB 에는 참석자 · 신청 목록만 있다.
-- 참석자: 다가오는 행사에 '누가 가는지', 지난 행사에 '누가 다녀왔는지'가 보이게.
insert into public.event_attendees(event_id, name, member_uid, created_by, created_at) values
  ('booth-ethics', '김지스트', '00000000-0000-4000-8000-00000000b007', '김지스트', booth.ts(-3, '10:00')),
  ('booth-ethics', '박하은', '00000000-0000-4000-8000-0000000000a2', '박하은', booth.ts(-2, '14:20')),
  ('booth-forum', '이서준', '00000000-0000-4000-8000-0000000000a1', '이서준', booth.ts(-5, '09:40')),
  ('booth-forum', '김지스트', '00000000-0000-4000-8000-00000000b007', '이서준', booth.ts(-5, '09:41')),
  ('booth-digital', '최도윤', '00000000-0000-4000-8000-0000000000a3', '최도윤', booth.ts(-1, '16:05')),
  ('booth-safety', '최도윤', '00000000-0000-4000-8000-0000000000a3', '최도윤', booth.ts(-4, '11:00')),
  ('booth-past', '김지스트', '00000000-0000-4000-8000-00000000b007', '김지스트', booth.ts(-50, '10:00')),
  ('booth-past', '이서준', '00000000-0000-4000-8000-0000000000a1', '이서준', booth.ts(-50, '10:01')),
  ('booth-past', '박하은', '00000000-0000-4000-8000-0000000000a2', '박하은', booth.ts(-49, '09:00')),
  ('booth-past2', '최도윤', '00000000-0000-4000-8000-0000000000a3', '최도윤', booth.ts(-80, '13:00')),
  ('booth-past2', '박하은', '00000000-0000-4000-8000-0000000000a2', '박하은', booth.ts(-80, '13:02'));

-- 팀원이 '이 행사 올려 주세요'라고 신청한 것 — 관리자(체험자)에게 신청 목록으로 보인다
insert into public.event_submissions(category, title, start_date, end_date, venue, organizer, link, poster, summary, status, submitter, note, created_at) values
  ('교육', '연구행정 실무자 엑셀 · 데이터 정리 특강', booth.d(26), booth.d(26), 'GIST 학사행정동 전산교육실', '교육지원팀(가상)', '', '',
   '[{"label":"대상","value":"행정 직원"},{"label":"내용","value":"피벗 · 함수로 정산 자료 정리"}]', 'pending', '박하은', '', booth.ts(-1, '15:30')),
  ('학술', '대학 연구지원 행정 심포지엄', booth.d(52), booth.d(53), '서울 aT센터', '연구행정협의회(가상)', '', '',
   '[{"label":"사전등록","value":"선착순 200명"},{"label":"주제","value":"연구비 통합관리 사례"}]', 'pending', '최도윤', '', booth.ts(-2, '10:10'));
`,gn=`-- 마무리 — 번호를 직접 넣은 표의 자동 번호(identity · 시퀀스)를 가장 큰 번호 뒤로 옮긴다.
-- 그래야 체험자가 새 업무 · 일정 · 대화를 만들 때 번호가 겹치지 않는다.
-- 두 경우를 다 본다: ① identity · serial(열이 시퀀스를 가짐) ② 기본값이 nextval('따로 만든 시퀀스')
do $$
declare r record; mx bigint; seq text;
begin
  for r in
    select c.relname as t, a.attname as col, pg_get_expr(d.adbin, d.adrelid) as def
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
    where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
      and (a.attidentity in ('a', 'd') or pg_get_expr(d.adbin, d.adrelid) like 'nextval(%')
  loop
    seq := pg_get_serial_sequence(format('public.%I', r.t), r.col);
    if seq is null and r.def like 'nextval(%' then
      seq := substring(r.def from $re$nextval\\('([^']+)'$re$);
    end if;
    if seq is null then continue; end if;
    execute format('select max(%I) from public.%I', r.col, r.t) into mx;
    if mx is not null then
      perform setval(seq::regclass, mx);
    end if;
  end loop;
end $$;
`;async function kn(n){var d;const e=new Map,t=await n.query(`
    select c.relname as t, a.attname as n, format_type(a.atttypid, a.atttypmod) as ty, ty.typcategory as cat, ty.typname as udt
    from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace ns on ns.oid = c.relnamespace
    join pg_type ty on ty.oid = a.atttypid
    where ns.nspname = 'public' and c.relkind in ('r', 'v', 'p') and a.attnum > 0 and not a.attisdropped
    order by c.relname, a.attnum`);for(const r of t.rows){let _=e.get(r.t);_||e.set(r.t,_={cols:new Map,pk:[]}),_.cols.set(r.n,{type:r.ty,isArray:r.cat==="A",isJson:r.udt==="json"||r.udt==="jsonb"})}const l=await n.query(`
    select c.relname as t, a.attname as n from pg_index i join pg_class c on c.oid = i.indrelid
    join pg_namespace ns on ns.oid = c.relnamespace join pg_attribute a on a.attrelid = c.oid and a.attnum = any(i.indkey)
    where i.indisprimary and ns.nspname = 'public' order by c.relname, a.attnum`);for(const r of l.rows)(d=e.get(r.t))==null||d.pk.push(r.n);const o=(await n.query(`
    select k.conname as name, c.relname as t, r.relname as rt,
      array(select a.attname::text from unnest(k.conkey) with ordinality x(n, o) join pg_attribute a on a.attrelid = k.conrelid and a.attnum = x.n order by x.o) as cols,
      array(select a.attname::text from unnest(k.confkey) with ordinality x(n, o) join pg_attribute a on a.attrelid = k.confrelid and a.attnum = x.n order by x.o) as rcols
    from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_class r on r.oid = k.confrelid
    join pg_namespace ns on ns.oid = c.relnamespace join pg_namespace rns on rns.oid = r.relnamespace
    where k.contype = 'f' and ns.nspname = 'public' and rns.nspname = 'public'`)).rows.map(r=>({name:r.name,table:r.t,cols:r.cols,refTable:r.rt,refCols:r.rcols})),a=new Map,s=await n.query(`
    select p.proname as name, p.proretset as retset, format_type(p.prorettype, null) as rettype, t.typtype, t.typname,
      p.proargnames as names, p.proargmodes::text[] as modes,
      array(select format_type(x, null) from unnest(p.proargtypes) x) as argtypes, p.pronargdefaults as ndef
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_type t on t.oid = p.prorettype
    where n.nspname = 'public' and p.prokind = 'f'`);for(const r of s.rows){const _=r.names||[],u=r.modes?_.filter((A,k)=>["i","b","v"].includes(r.modes[k])):_.slice(0,r.argtypes.length),p=r.argtypes.map((A,k)=>({name:u[k]||`$${k+1}`,type:A})),m=r.typname==="void"?"void":r.typtype==="c"||r.rettype==="record"?"composite":"scalar",R=a.get(r.name)||[];R.push({args:p,nDefaults:r.ndef,retSet:r.retset,retType:r.rettype,retKind:m}),a.set(r.name,R)}return{tables:e,rels:o,fns:a}}const b=n=>'"'+n.replace(/"/g,'""')+'"',c=n=>"'"+n.replace(/'/g,"''")+"'";function nn(n){const e=t=>t==null?"NULL":'"'+String(typeof t=="object"?JSON.stringify(t):t).replace(/\\/g,"\\\\").replace(/"/g,'\\"')+'"';return"{"+n.map(e).join(",")+"}"}function X(n,e){return n==null?"NULL":e!=null&&e.isJson?c(JSON.stringify(n))+"::"+(e.type==="json"?"json":"jsonb"):e!=null&&e.isArray?c(Array.isArray(n)?nn(n):String(n))+"::"+e.type:c(typeof n=="object"?JSON.stringify(n):String(n))}function En(n,e){return n==null?"NULL::"+e:e==="json"||e==="jsonb"?c(JSON.stringify(n))+"::"+e:e.endsWith("[]")?c(Array.isArray(n)?nn(n):String(n))+"::"+e:typeof n=="object"?c(JSON.stringify(n))+"::"+e:c(String(n))+"::"+e}function Y(n){const e=[];let t=0,l=!1,i="";for(let o=0;o<n.length;o++){const a=n[o];if(a==='"'&&n[o-1]!=="\\"&&(l=!l),!l){if(a==="(")t++;else if(a===")")t--;else if(a===","&&t===0){e.push(i),i="";continue}}i+=a}return i.trim()!==""&&e.push(i),e.map(o=>o.trim())}function yn(n){const e=n.replace(/^\(/,"").replace(/\)$/,"");return e===""?[]:Y(e).map(t=>t.startsWith('"')&&t.endsWith('"')?t.slice(1,-1).replace(/\\"/g,'"'):t)}function F(n,e){const t=e.split(/(->>|->)/);let l=`${n}.${b(t[0].trim())}`;for(let i=1;i<t.length;i+=2){const o=t[i+1];l+=t[i]+(/^\d+$/.test(o)?o:c(o))}return l}function en(n,e){let t=!1;e.startsWith("not.")&&(t=!0,e=e.slice(4));const l=e.indexOf(".");let i=l<0?e:e.slice(0,l);const o=l<0?"":e.slice(l+1);i=i.replace(/\((any|all)\)$/,"");let a;switch(i){case"eq":a=`${n} = ${c(o)}`;break;case"neq":a=`${n} <> ${c(o)}`;break;case"gt":a=`${n} > ${c(o)}`;break;case"gte":a=`${n} >= ${c(o)}`;break;case"lt":a=`${n} < ${c(o)}`;break;case"lte":a=`${n} <= ${c(o)}`;break;case"like":a=`${n}::text like ${c(o.replace(/\*/g,"%"))}`;break;case"ilike":a=`${n}::text ilike ${c(o.replace(/\*/g,"%"))}`;break;case"match":a=`${n}::text ~ ${c(o)}`;break;case"imatch":a=`${n}::text ~* ${c(o)}`;break;case"is":{const s=o.toLowerCase();a=`${n} is ${s==="null"?"null":s==="true"?"true":s==="false"?"false":"unknown"}`;break}case"isdistinct":a=`${n} is distinct from ${c(o)}`;break;case"in":{const s=yn(o);a=s.length?`${n} in (${s.map(c).join(", ")})`:"false";break}case"cs":a=`${n} @> ${c(o)}`;break;case"cd":a=`${n} <@ ${c(o)}`;break;case"ov":a=`${n} && ${c(o.startsWith("(")?"{"+o.slice(1,-1)+"}":o)}`;break;case"fts":case"plfts":case"phfts":case"wfts":a=`to_tsvector(${n}::text) @@ plainto_tsquery(${c(o)})`;break;default:throw O(400,"PGRST100",`체험관이 모르는 필터: ${i}`)}return t?`not (${a})`:a}function tn(n,e,t,l){const i=Y(t.replace(/^\(/,"").replace(/\)$/,"")).map(a=>{const s=a.match(/^(not\.)?(and|or)(\(.*\))$/);if(s)return tn(n,s[2],s[3],!!s[1]);const d=a.indexOf(".");return en(F(n,a.slice(0,d)),a.slice(d+1))}),o=i.length?"("+i.join(e==="and"?" and ":" or ")+")":"true";return l?`not ${o}`:o}const on=new Set(["select","order","limit","offset","on_conflict","columns"]);function an(n){const e=new Map,t=l=>{let i=e.get(l);return i||e.set(l,i={filters:[]}),i};for(const[l,i]of n.searchParams){if(on.has(l)){l==="order"&&(t("").order=i),l==="limit"&&(t("").limit=i),l==="offset"&&(t("").offset=i);continue}const o=l.split("."),a=o.pop(),s=o.join(".");a==="order"?t(s).order=i:a==="limit"?t(s).limit=i:a==="offset"?t(s).offset=i:t(s).filters.push([a,i])}return e}function q(n,e){return e?e.filters.map(([l,i])=>{const o=l.startsWith("not."),a=o?l.slice(4):l;return a==="or"||a==="and"?tn(n,a,i,o):en(F(n,l),i)}).join(" and "):""}function G(n,e){if(!e)return"";const t=Y(e).map(l=>{const i=l.split("."),o=[];let a=i[0],s=1;for(;s<i.length&&!["asc","desc","nullsfirst","nullslast"].includes(i[s]);)a+="."+i[s++];for(;s<i.length;s++)i[s]==="asc"?o.push("asc"):i[s]==="desc"?o.push("desc"):i[s]==="nullsfirst"?o.push("nulls first"):i[s]==="nullslast"&&o.push("nulls last");return`${F(n,a)} ${o.join(" ")}`.trim()});return t.length?" order by "+t.join(", "):""}function xn(n,e,t,l){const i=a=>!l||a.name===l||a.cols.includes(l)||a.refCols.includes(l);if(n.tables.has(t)){const a=n.rels.find(d=>d.table===e&&d.refTable===t&&i(d));if(a)return{rel:a,many:!1,target:t};const s=n.rels.find(d=>d.table===t&&d.refTable===e&&i(d));if(s)return{rel:s,many:!0,target:t}}const o=n.rels.find(a=>a.table===e&&(a.cols[0]===t||a.name===t));if(o)return{rel:o,many:!1,target:o.refTable};throw O(400,"PGRST200",`'${e}' 와 '${t}' 사이 관계를 찾지 못함`)}function D(n,e,t,l,i){const o=Y(l||"*"),a=[];for(const s of o){if(s==="*"){a.push(`${t}.*`);continue}const d=s.match(/^(?:([\w]+):)?([\w]+)((?:![\w]+)*)\((.*)\)$/s);if(d){const[,A,k,C,j]=d,f=C.split("!").filter(Boolean).filter(I=>I!=="inner"&&I!=="left"),{rel:E,many:y,target:v}=xn(n.cat,e,k,f[0]),x=`"_${++n.n}"`,w=i?`${i}.${A||k}`:A||k,h=n.scopes.get(w),S=y?E.cols.map((I,L)=>`${x}.${b(I)} = ${t}.${b(E.refCols[L])}`):E.refCols.map((I,L)=>`${x}.${b(I)} = ${t}.${b(E.cols[L])}`),N=q(x,h),H=[...S,...N?[N]:[]].join(" and "),M=D(n,v,x,j,w),_n=y?`(select coalesce(json_agg(_x), '[]'::json) from (select ${M} from public.${b(v)} ${x} where ${H}${G(x,h==null?void 0:h.order)}${h!=null&&h.limit?" limit "+Number(h.limit):""}) _x)`:`(select row_to_json(_x) from (select ${M} from public.${b(v)} ${x} where ${H} limit 1) _x)`;a.push(`${_n} as ${b(A||k)}`);continue}const r=s.match(/^(?:([\w]+):)?([^:]+?)(?:::([\w\s[\]]+))?$/);if(!r)throw O(400,"PGRST100",`select 를 읽지 못함: ${s}`);const[,_,u,p]=r,m=u.split(/->>|->/),R=_||m[m.length-1].trim();a.push(`${F(t,u.trim())}${p?"::"+p:""} as ${b(R)}`)}return a.join(", ")}function O(n,e,t,l){return{__rest:!0,status:n,code:e,message:t,details:l}}const T={"Content-Type":"application/json; charset=utf-8"};function $(n,e,t){const l=e.headers.get("Accept")||"",i=n.length?`0-${n.length-1}/${t??"*"}`:`*/${t??"*"}`,o={...T,"Content-Range":i};return l.includes("vnd.pgrst.object")?n.length!==1?{status:406,headers:T,body:JSON.stringify({code:"PGRST116",details:`The result contains ${n.length} rows`,hint:null,message:"JSON object requested, multiple (or no) rows returned"})}:{status:200,headers:o,body:JSON.stringify(n[0])}:{status:200,headers:o,body:JSON.stringify(n)}}function vn(n){const e=n;if(e&&e.__rest)return{status:e.status,headers:T,body:JSON.stringify({code:e.code,message:e.message,details:e.details??null,hint:null})};const t=n,l=(t==null?void 0:t.code)||"XX000";return{status:l==="23505"?409:l==="42501"?403:400,headers:T,body:JSON.stringify({code:l,message:(t==null?void 0:t.message)||String(n),details:(t==null?void 0:t.detail)??null,hint:(t==null?void 0:t.hint)??null})}}const Rn=n=>(n.get("Prefer")||"").split(",").map(e=>e.trim());async function Nn(n,e,t){try{const l=t.url.pathname.replace(/^.*\/rest\/v1\//,"");if(l.startsWith("rpc/"))return await An(n,e,t,l.slice(4));const i=decodeURIComponent(l),o=e.tables.get(i);if(!o)throw O(404,"42P01",`relation "public.${i}" does not exist`);const a=an(t.url),s=a.get(""),d=Rn(t.headers),r=d.some(f=>f.startsWith("count=")),_={cat:e,scopes:a,n:0},u=t.url.searchParams.get("select")||"*",p=t.method.toUpperCase();if(p==="GET"||p==="HEAD"){const f=q('"_0"',s),E=f?" where "+f:"";let y=null;if((r||p==="HEAD")&&(y=(await n.query(`select count(*)::int as n from public.${b(i)} "_0"${E}`)).rows[0].n),p==="HEAD")return{status:200,headers:{...T,"Content-Range":`*/${y}`},body:""};const v=D(_,i,'"_0"',u,""),x=s!=null&&s.limit?" limit "+Number(s.limit):"",w=s!=null&&s.offset?" offset "+Number(s.offset):"",h=`select coalesce(json_agg(_t), '[]'::json) as j from (select ${v} from public.${b(i)} "_0"${E}${G('"_0"',s==null?void 0:s.order)}${x}${w}) _t`,S=await n.query(h);return $(S.rows[0].j,t,y)}let m;if(p==="POST"){const f=Array.isArray(t.body)?t.body:[t.body];if(!f.length)return $([],t,0);const E=t.url.searchParams.get("columns"),y=E?E.split(",").map(w=>w.trim().replace(/^"|"$/g,"")):[...new Set(f.flatMap(w=>Object.keys(w)))],v=f.map(w=>"("+y.map(h=>h in w?X(w[h],o.cols.get(h)):"DEFAULT").join(", ")+")");m=`insert into public.${b(i)} as "_0" (${y.map(b).join(", ")}) values ${v.join(", ")}`;const x=d.find(w=>w.startsWith("resolution="));if(x){const w=t.url.searchParams.get("on_conflict"),h=w?w.split(",").map(N=>N.trim()):o.pk,S=y.filter(N=>!h.includes(N));m+=` on conflict (${h.map(b).join(", ")}) `+(x==="resolution=ignore-duplicates"||!S.length?"do nothing":"do update set "+S.map(N=>`${b(N)} = excluded.${b(N)}`).join(", "))}}else if(p==="PATCH"){const f=t.body||{},E=Object.keys(f).map(v=>`${b(v)} = ${X(f[v],o.cols.get(v))}`);if(!E.length)return $([],t,0);const y=q('"_0"',s);m=`update public.${b(i)} as "_0" set ${E.join(", ")}${y?" where "+y:""}`}else if(p==="DELETE"){const f=q('"_0"',s);m=`delete from public.${b(i)} as "_0"${f?" where "+f:""}`}else throw O(405,"PGRST000",`지원하지 않는 방식: ${p}`);const R=d.includes("return=representation"),A=R?D(_,i,'"_0"',u,""):"1",C=(await n.query(`with _m as (${m} returning *) select coalesce(json_agg(_t), '[]'::json) as j from (select ${A} from _m "_0"${R?G('"_0"',s==null?void 0:s.order):""}) _t`)).rows[0].j;if(!R)return{status:p==="POST"?201:204,headers:{...T,"Content-Range":`*/${C.length}`},body:""};const j=$(C,t,r?C.length:null);return p==="POST"&&j.status===200&&(j.status=201),j}catch(l){return vn(l)}}async function An(n,e,t,l){const i=e.fns.get(l);if(!i)throw O(404,"PGRST202",`Could not find the function public.${l}`);let o={};if(t.method.toUpperCase()==="POST")o=t.body&&typeof t.body=="object"?t.body:{};else for(const[_,u]of t.url.searchParams)on.has(_)||(o[_]=u);const a=Object.keys(o),s=i.find(_=>{const u=_.args.map(m=>m.name),p=_.args.slice(0,_.args.length-_.nDefaults).map(m=>m.name);return a.every(m=>u.includes(m))&&p.every(m=>a.includes(m))})||i[0],d=`public.${b(l)}(${a.map(_=>{var u;return`${b(_)} => ${En(o[_],((u=s.args.find(p=>p.name===_))==null?void 0:u.type)||"text")}`}).join(", ")})`;if(s.retKind==="void")return await n.query(`select ${d}`),{status:204,headers:T,body:""};if(s.retSet||s.retKind==="composite"){const _=an(new URL(t.url.toString())),u=t.method.toUpperCase()==="POST"?_.get(""):void 0,p=t.url.searchParams.get("select")||"*";if(s.retKind==="scalar"){const C=await n.query(`select coalesce(json_agg(_r."v"), '[]'::json) as j from ${d} as _r("v")`);return $(C.rows[0].j,t,null)}const m=q('"_0"',u),R=p==="*"?'"_0".*':D({cat:e,scopes:_,n:0},"",'"_0"',p,""),k=(await n.query(`select coalesce(json_agg(_t), '[]'::json) as j from (select ${R} from ${d} "_0"${m?" where "+m:""}${G('"_0"',u==null?void 0:u.order)}${u!=null&&u.limit?" limit "+Number(u.limit):""}) _t`)).rows[0].j;return s.retSet?$(k,t,null):{status:200,headers:T,body:JSON.stringify(k[0]??null)}}const r=await n.query(`select to_json(${d}) as j`);return{status:200,headers:T,body:JSON.stringify(r.rows[0].j??null)}}const ln=`-- 체험관 가상 창고 — 운영 Supabase 에만 있는 바탕(auth·storage·vault 스키마, 확장)을 흉내 낸다.
-- schema.sql(운영 구조 복사본)보다 먼저 실행한다. 로그인한 사람은 늘 체험관 게스트 한 명이다.
create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists vault;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
set search_path to public, extensions;

create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- 체험관 게스트 uid — booth/people.ts 의 BOOTH_GUEST_UID 와 같은 값
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), '00000000-0000-4000-8000-00000000b007')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select jsonb_build_object('sub', auth.uid()::text, 'role', 'authenticated')
$$;

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text,
  name text,
  metadata jsonb,
  created_at timestamptz default now()
);
create table vault.decrypted_secrets (name text, decrypted_secret text);

-- 운영에선 Supabase 가 만들어 두는 역할 — 함수 정의의 GRANT/SET ROLE 이 찾을 수 있게
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;

set check_function_bodies = off;
`,sn=`-- 자동 생성 파일 — 고치지 말 것. scripts/booth/build-schema.mjs 가 운영 DB 구조(데이터 0줄)에서 만든다.
-- 생성: 2026-11-18 · 항목 369개
-- sequence: angel_chats_id_seq
create sequence if not exists public.angel_chats_id_seq;

-- sequence: work_class_feedback_id_seq
create sequence if not exists public.work_class_feedback_id_seq;

-- function: cal_like_escape(s text)
CREATE OR REPLACE FUNCTION public.cal_like_escape(s text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select replace(replace(replace(s, '\\', '\\\\'), '%', '\\%'), '_', '\\_')
$function$
;

-- function: calendar_events_alive(p_ids bigint[])
CREATE OR REPLACE FUNCTION public.calendar_events_alive(p_ids bigint[])
 RETURNS SETOF bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select id from calendar_events where is_member() and id = any(p_ids)
$function$
;

-- function: calendar_log_delete()
CREATE OR REPLACE FUNCTION public.calendar_log_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- 동기화 자신이 지운 행(GCal에서 이미 사라진 것)은 톰스톤 제외
  if old.gcal_id <> '' and coalesce(current_setting('app.cal_sync_skip_del_log', true), '') <> '1' then
    insert into calendar_del_log (gcal_id) values (old.gcal_id);
  end if;
  return old;
end $function$
;

-- function: calendar_sync(payload jsonb)
CREATE OR REPLACE FUNCTION public.calendar_sync(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_token text; ev jsonb; r record;
  v_from text; v_to text;
  n_new int := 0; n_upd int := 0; n_claim int := 0; n_skip_del int := 0;
  n_events int;
  keys text[]; out_create jsonb; out_update jsonb; out_delete jsonb; out_appdel jsonb;
begin
  select v into v_token from calendar_sync_config where k = 'token';
  if v_token is null or (payload->>'token') is distinct from v_token then
    raise exception 'invalid sync token';
  end if;
  v_from := payload->'window'->>'from';
  v_to   := payload->'window'->>'to';
  if v_from is null or v_to is null then raise exception 'missing window'; end if;

  n_events := coalesce(jsonb_array_length(payload->'events'), 0);
  select coalesce(array_agg(e->>'key'), '{}') into keys from jsonb_array_elements(payload->'events') e;

  -- (a) GCal → 앱 업서트. 삭제 대기(톰스톤) 키는 전부 건너뜀 — 이번 실행에서 GCal 쪽이 지워질 예정(F1)
  for ev in select * from jsonb_array_elements(payload->'events') loop
    if exists (select 1 from calendar_del_log d where d.gcal_id = ev->>'key') then
      n_skip_del := n_skip_del + 1;
      continue;
    end if;
    select * into r from calendar_events where gcal_id = ev->>'key';
    if found then
      if (r.title, r.loc, r.all_day, r.start_at, r.end_at) is distinct from
         (ev->>'title', coalesce(ev->>'loc',''), (ev->>'allDay')::boolean, ev->>'start', ev->>'end') then
        if (ev->>'updated')::timestamptz > r.updated_at then
          update calendar_events set
            title = ev->>'title', loc = coalesce(ev->>'loc',''),
            all_day = (ev->>'allDay')::boolean, start_at = ev->>'start', end_at = ev->>'end',
            updated_at = (ev->>'updated')::timestamptz
          where id = r.id;
          n_upd := n_upd + 1;
        end if;
      end if;
    else
      -- 클레임: 같은 시각·종일 + 제목 일치/접두(빈 제목 제외, LIKE 이스케이프)인 미동기 행에 키 부여(F7)
      select * into r from calendar_events
       where gcal_id = '' and repeat = 'none'
         and start_at = ev->>'start' and end_at = ev->>'end'
         and all_day = (ev->>'allDay')::boolean
         and (trim(title) = trim(ev->>'title')
              or (trim(ev->>'title') <> '' and trim(title) <> '' and
                  (trim(title) like cal_like_escape(trim(ev->>'title')) || '%'
                   or trim(ev->>'title') like cal_like_escape(trim(title)) || '%')))
       order by id limit 1;
      if found then
        -- updated_at=GCal updated 시딩(F2): 클레임 직후 어느 방향도 push/pull 안 함(동률) → 이후 편집한 쪽이 승자
        update calendar_events set gcal_id = ev->>'key', updated_at = (ev->>'updated')::timestamptz
         where id = r.id;
        n_claim := n_claim + 1;
      else
        insert into calendar_events (title, loc, all_day, start_at, end_at, repeat, repeat_until, series_id, created_by, gcal_id, updated_at)
        values (ev->>'title', coalesce(ev->>'loc',''), (ev->>'allDay')::boolean, ev->>'start', ev->>'end',
                'none', '', '', '구글캘린더', ev->>'key', (ev->>'updated')::timestamptz);
        n_new := n_new + 1;
      end if;
    end if;
  end loop;

  -- (b) GCal에서 사라진 후보 — 즉시 삭제하지 않고 후보만 반환(F9/F12). 겹침 기준(진행 중 장기 일정 포함, F11).
  --     GAS가 GCal 실존 여부를 개별 확인한 뒤 ack(appDeleteIds)로 확정. 조회 0건이면 후보도 안 냄. 상한 100.
  if n_events = 0 then
    out_appdel := '[]'::jsonb;
  else
    select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'key', t.gcal_id)), '[]') into out_appdel
      from (
        select id, gcal_id from calendar_events
         where gcal_id <> '' and end_at >= v_from and start_at <= v_to
           and not (gcal_id = any(keys))
         order by id limit 100
      ) t;
  end if;

  -- (c) 앱 → GCal 반영 목록(snap=CAS용 스냅샷, F3)
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'title', title, 'loc', loc, 'allDay', all_day, 'start', start_at, 'end', end_at,
           'snap', updated_at::text)), '[]')
    into out_create
    from calendar_events
   where gcal_id = '' and repeat = 'none' and created_by not like '이관%'
     and start_at >= v_from and start_at <= v_to;

  select coalesce(jsonb_agg(jsonb_build_object(
           'key', c.gcal_id, 'title', c.title, 'loc', c.loc, 'allDay', c.all_day, 'start', c.start_at, 'end', c.end_at,
           'snap', c.updated_at::text)), '[]')
    into out_update
    from calendar_events c
    join jsonb_array_elements(payload->'events') e on e->>'key' = c.gcal_id
   where c.updated_at > (e->>'updated')::timestamptz
     and (c.title, c.loc, c.all_day, c.start_at, c.end_at) is distinct from
         (e->>'title', coalesce(e->>'loc',''), (e->>'allDay')::boolean, e->>'start', e->>'end');

  select coalesce(jsonb_agg(jsonb_build_object('logId', id, 'key', gcal_id)), '[]')
    into out_delete from calendar_del_log;

  return jsonb_build_object(
    'toCreate', out_create, 'toUpdate', out_update, 'toDelete', out_delete, 'toAppDelete', out_appdel,
    'stats', jsonb_build_object('pulledNew', n_new, 'pulledUpdated', n_upd, 'claimed', n_claim,
                                'skippedTombstoned', n_skip_del));
end $function$
;

-- function: calendar_sync_ack(payload jsonb)
CREATE OR REPLACE FUNCTION public.calendar_sync_ack(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_token text; it jsonb; n int; v_ids bigint[];
begin
  select v into v_token from calendar_sync_config where k = 'token';
  if v_token is null or (payload->>'token') is distinct from v_token then
    raise exception 'invalid sync token';
  end if;

  -- 생성 반영: CAS(스냅샷과 같을 때만 GCal 시각 시딩 — 실행 중 앱 편집 보존, F3).
  -- 0행이면(그 사이 앱에서 삭제) GCal 고아를 지우도록 톰스톤 대체 기록(F4). 키 충돌은 항목별 격리(F8).
  for it in select * from jsonb_array_elements(coalesce(payload->'created', '[]'::jsonb)) loop
    begin
      update calendar_events
         set gcal_id = it->>'key',
             updated_at = case when updated_at::text = (it->>'snap') then (it->>'updated')::timestamptz else updated_at end
       where id = (it->>'id')::bigint;
      get diagnostics n = row_count;
      if n = 0 then
        insert into calendar_del_log (gcal_id) values (it->>'key');
      end if;
    exception when unique_violation then null;
    end;
  end loop;

  -- 수정 반영: CAS + 재키(newKey). 키 충돌은 항목별 격리(F8) — 다음 실행에서 자연 수렴.
  for it in select * from jsonb_array_elements(coalesce(payload->'updated', '[]'::jsonb)) loop
    begin
      update calendar_events
         set gcal_id = coalesce(nullif(it->>'newKey',''), gcal_id),
             updated_at = case when updated_at::text = (it->>'snap') then (it->>'updated')::timestamptz else updated_at end
       where gcal_id = it->>'key';
    exception when unique_violation then null;
    end;
  end loop;

  -- GCal에서 사라짐이 '확인된' 행 삭제(2단계 확정, F9) — 톰스톤 남기지 않음
  select coalesce(array_agg((x->>0)::bigint), '{}') into v_ids
    from jsonb_array_elements(coalesce(payload->'appDeleteIds', '[]'::jsonb)) x;
  if array_length(v_ids, 1) > 0 then
    perform set_config('app.cal_sync_skip_del_log', '1', true);
    delete from calendar_events where id = any(v_ids) and gcal_id <> '';
    perform set_config('app.cal_sync_skip_del_log', '', true);
  end if;

  delete from calendar_del_log where id in (
    select (x->>0)::bigint from jsonb_array_elements(coalesce(payload->'clearedLogIds', '[]'::jsonb)) x);
  return jsonb_build_object('ok', true);
end $function$
;

-- function: calendar_sync_rotate(new_token text)
CREATE OR REPLACE FUNCTION public.calendar_sync_rotate(new_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if length(coalesce(new_token,'')) < 32 then
    raise exception 'token too short';
  end if;
  if not exists (select 1 from calendar_sync_config where k = 'bootstrap' and v = '1') then
    raise exception 'rotation not allowed';
  end if;
  update calendar_sync_config set v = new_token where k = 'token';
  delete from calendar_sync_config where k = 'bootstrap';
  return jsonb_build_object('ok', true);
end $function$
;

-- function: calendar_touch_updated_at()
CREATE OR REPLACE FUNCTION public.calendar_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.updated_at is not distinct from old.updated_at then
    if (new.title, new.loc, new.all_day, new.start_at, new.end_at, new.repeat, new.repeat_until)
       is distinct from
       (old.title, old.loc, old.all_day, old.start_at, old.end_at, old.repeat, old.repeat_until) then
      new.updated_at := now();
    end if;
  end if;
  return new;
end $function$
;

-- function: delete_member(p_profile_id uuid)
CREATE OR REPLACE FUNCTION public.delete_member(p_profile_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_auth_user_id uuid;
  v_me uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception '포털 관리자만 회원을 삭제할 수 있습니다.' using errcode = '42501';
  end if;

  select auth_user_id into v_auth_user_id from profiles where id = p_profile_id;
  if not found then
    raise exception '대상을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  -- 자기 자신 삭제 차단 — 관리자가 0명이 되어 사용자 관리에 아무도 못 들어가는 상황 방지.
  -- (화면에서도 막고 있지만, 잠금은 서버에서 한 번 더 건다.)
  if v_auth_user_id is not null and v_auth_user_id = v_me then
    raise exception '본인 계정은 삭제할 수 없습니다.' using errcode = '42501';
  end if;

  delete from profiles where id = p_profile_id;
  -- 사번을 다시 쓸 수 있게 로그인 계정까지 지운다. auth 하위 테이블(identities·sessions·
  -- refresh_tokens)은 auth.users 에 ON DELETE CASCADE 로 걸려 있어 함께 정리된다.
  if v_auth_user_id is not null then
    delete from auth.users where id = v_auth_user_id;
  end if;
end
$function$
;

-- function: demo_chat_reorder(p_ids bigint[])
CREATE OR REPLACE FUNCTION public.demo_chat_reorder(p_ids bigint[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare i int;
begin
  if not is_member() then raise exception '권한이 없습니다'; end if;
  if p_ids is null or array_length(p_ids, 1) is null then return; end if;
  for i in 1..array_length(p_ids, 1) loop
    update demo_chat set sort_order = i where id = p_ids[i];
  end loop;
end $function$
;

-- function: demo_chat_set_width(p_id bigint, p_width smallint)
CREATE OR REPLACE FUNCTION public.demo_chat_set_width(p_id bigint, p_width smallint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_member() then raise exception '권한이 없습니다'; end if;
  if not (p_width between 1 and 3 or p_width between 1050 and 1100 or p_width between 2050 and 2100) then
    raise exception '허용되지 않는 폭 값';
  end if;
  update demo_chat set width = p_width where id = p_id;
end $function$
;

-- function: demo_rename_group(p_level text, p_equipment text, p_maker text,
CREATE OR REPLACE FUNCTION public.demo_rename_group(p_level text, p_equipment text, p_maker text, p_model text, p_to text, p_author text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_to text := btrim(coalesce(p_to, ''));
begin
  if not is_member() then
    raise exception '권한이 없습니다';
  end if;
  if v_to = '' then
    raise exception '이름을 입력하세요';
  end if;

  if p_level = 'equipment' then
    if v_to = p_equipment then return; end if;
    if exists (
      select 1 from demo_visits a join demo_visits b
        on b.equipment = v_to and b.maker = a.maker and b.round = a.round
      where a.equipment = p_equipment
    ) then
      raise exception '같은 제조사·차수가 이미 있어 합칠 수 없어요';
    end if;
    if exists (
      select 1 from demo_metric_defs a join demo_metric_defs b
        on b.equipment = v_to and b.metric_key = a.metric_key
      where a.equipment = p_equipment
    ) then
      raise exception '두 장비군에 같은 표준 지표가 있어 합칠 수 없어요 — 한쪽 지표를 먼저 정리해 주세요';
    end if;
    update demo_visits set equipment = v_to, updated_by = p_author, updated_at = now() where equipment = p_equipment;
    update demo_results set equipment = v_to, updated_by = p_author, updated_at = now() where equipment = p_equipment;
    update demo_metric_defs set equipment = v_to, updated_by = p_author, updated_at = now() where equipment = p_equipment;
    update demo_chat set equipment = v_to where equipment = p_equipment;
    update demo_value_history set equipment = v_to where equipment = p_equipment;
    update demo_metric_def_history set equipment = v_to where equipment = p_equipment;

  elsif p_level = 'maker' then
    if v_to = p_maker then return; end if;
    if exists (
      select 1 from demo_visits a join demo_visits b
        on b.equipment = a.equipment and b.maker = v_to and b.round = a.round
      where a.equipment = p_equipment and a.maker = p_maker
    ) then
      raise exception '같은 차수가 이미 있어 합칠 수 없어요';
    end if;
    update demo_visits set maker = v_to, updated_by = p_author, updated_at = now() where equipment = p_equipment and maker = p_maker;
    update demo_results set maker = v_to, updated_by = p_author, updated_at = now() where equipment = p_equipment and maker = p_maker;
    update demo_value_history set maker = v_to where equipment = p_equipment and maker = p_maker;

  elsif p_level = 'model' then
    if v_to = p_model then return; end if;
    if exists (
      select 1 from demo_results a join demo_results b
        on b.visit_id = a.visit_id and b.model = v_to
      where a.equipment = p_equipment and a.maker = p_maker and a.model = p_model
    ) then
      raise exception '같은 방문에 그 모델이 이미 있어 합칠 수 없어요';
    end if;
    update demo_results set model = v_to, updated_by = p_author, updated_at = now() where equipment = p_equipment and maker = p_maker and model = p_model;
    update demo_value_history set model = v_to where equipment = p_equipment and maker = p_maker and model = p_model;

  else
    raise exception '알 수 없는 단계: %', p_level;
  end if;
end;
$function$
;

-- function: demo_results_drop_empty_visit()
CREATE OR REPLACE FUNCTION public.demo_results_drop_empty_visit()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from demo_results where visit_id = old.visit_id) then
    delete from demo_visits where id = old.visit_id;
  end if;
  return old;
end $function$
;

-- function: demo_results_link_visit()
CREATE OR REPLACE FUNCTION public.demo_results_link_visit()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_id bigint;
begin
  if new.visit_id is not null then
    select equipment, maker, round into new.equipment, new.maker, new.round from demo_visits where id = new.visit_id;
    return new;
  end if;
  select id into v_id from demo_visits where equipment = new.equipment and maker = new.maker and round = new.round;
  if v_id is null then
    insert into demo_visits (equipment, maker, round, label, visit_date, place, files, created_by, updated_by)
    values (new.equipment, new.maker, new.round, coalesce(new.round_label, ''), new.visit_date, coalesce(new.place, ''), coalesce(new.files, '[]'::jsonb), new.created_by, new.updated_by)
    returning id into v_id;
    new.files := '[]'::jsonb;
  end if;
  new.visit_id := v_id;
  return new;
end $function$
;

-- function: drafts_save(p_drafts jsonb)
CREATE OR REPLACE FUNCTION public.drafts_save(p_drafts jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare it jsonb; cnt int := 0; stamp text;
begin
  stamp := to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI:SS');
  for it in select * from jsonb_array_elements(p_drafts) loop
    if coalesce(trim(it->>'title'),'') <> '' or coalesce(trim(it->>'content'),'') <> ''
       or coalesce(trim(it->>'link'),'') <> '' or coalesce(trim(it->>'loc'),'') <> '' then
      cnt := cnt + 1;
    end if;
  end loop;
  if cnt > 0 then
    delete from improvement_drafts where author_uid = auth.uid();
    for it in select * from jsonb_array_elements(p_drafts) loop
      if coalesce(trim(it->>'title'),'') <> '' or coalesce(trim(it->>'content'),'') <> ''
         or coalesce(trim(it->>'link'),'') <> '' or coalesce(trim(it->>'loc'),'') <> '' then
        insert into improvement_drafts (author, author_uid, urgent, title, link, loc, content, saved_at)
        values (my_name(), auth.uid(), coalesce((it->>'urgent')::boolean,false), coalesce(it->>'title',''),
                coalesce(it->>'link',''), coalesce(it->>'loc',''), coalesce(it->>'content',''), stamp);
      end if;
    end loop;
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', d.id::text, 'urgent', d.urgent, 'title', d.title,
    'link', d.link, 'loc', d.loc, 'content', d.content, 'savedAt', d.saved_at) order by d.id)
    from improvement_drafts d where d.author_uid = auth.uid()), '[]'::jsonb);
end $function$
;

-- function: eq_update(p jsonb)
CREATE OR REPLACE FUNCTION public.eq_update(p jsonb)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare cur record; new_state text;
begin
  select * into cur from equipments where code = p->>'code' for update;
  if not found then raise exception '관리번호 %를 찾을 수 없습니다', p->>'code'; end if;
  update equipments set
    mgr = coalesce(p->>'mgr', mgr), maker = coalesce(p->>'maker', maker), model = coalesce(p->>'model', model),
    asset_no = coalesce(p->>'assetNo', asset_no), nfec = coalesce(p->>'nfec', nfec),
    install_loc = coalesce(p->>'installLoc', install_loc), install_date = coalesce(p->>'installDate', install_date),
    vendor = coalesce(p->>'vendor', vendor), mgr2 = coalesce(p->>'mgr2', mgr2),
    contact = coalesce(p->>'contact', contact), note = coalesce(p->>'note', note),
    state = coalesce(p->>'state', state)
  where code = p->>'code';
  new_state := coalesce(p->>'state', cur.state);
  if new_state is distinct from cur.state then
    insert into equipment_history (at, code, name, prev, next, reason, author, work_type, note)
    values (to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI'), cur.code, cur.name,
            cur.state, new_state, coalesce(p->>'reason',''), my_name(), '상태변경', '');
  end if;
end $function$
;

-- function: equipments_stage_stamp()
CREATE OR REPLACE FUNCTION public.equipments_stage_stamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.stage is distinct from old.stage then
    new.stage_at := now();
    new.stage_by := coalesce(my_name(), '');
  end if;
  return new;
end $function$
;

-- function: gemini_spend(p_since timestamp with time zone)
CREATE OR REPLACE FUNCTION public.gemini_spend(p_since timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when not is_admin() then null else (
    select coalesce(jsonb_agg(jsonb_build_object(
      'model', m.model, 'calls', m.calls, 'tokens_in', m.tin, 'tokens_out', m.tout, 'no_tokens', m.nt) order by m.calls desc), '[]'::jsonb)
    from (
      select coalesce(model, '?') as model, count(*) as calls,
        coalesce(sum(tokens_in), 0) as tin, coalesce(sum(tokens_out), 0) as tout,
        count(*) filter (where tokens_in is null) as nt
      from api_usage
      where service = 'gemini' and ok is not false and status = 200 and at >= p_since
      group by model
    ) m
  ) end;
$function$
;

-- function: handle_new_user()
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (auth_user_id, name, emp_no, role)
  select new.id,
         coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), split_part(new.email, '@', 1)),
         split_part(new.email, '@', 1),
         'pending'
  where not exists (select 1 from public.profiles where auth_user_id = new.id);
  return new;
end
$function$
;

-- function: improve_create_batch(items jsonb)
CREATE OR REPLACE FUNCTION public.improve_create_batch(items jsonb)
 RETURNS bigint[]
 LANGUAGE plpgsql
AS $function$
declare it jsonb; nums bigint[] := '{}'; new_num bigint; today text;
begin
  today := to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD');
  for it in select * from jsonb_array_elements(items) loop
    if coalesce(trim(it->>'title'),'') = '' then raise exception '제목이 없는 요청 카드가 있습니다'; end if;
  end loop;
  for it in select * from jsonb_array_elements(items) loop
    insert into improvements (urgent, type, loc, title, content, author, mgr, proposed_date, link, status, memo)
    values (coalesce((it->>'urgent')::boolean,false), '', coalesce(it->>'loc',''), trim(it->>'title'),
            coalesce(it->>'content',''), my_name(), my_name(), today, coalesce(it->>'link',''), '접수', false)
    returning num into new_num;
    nums := nums || new_num;
  end loop;
  return nums;
end $function$
;

-- function: improve_delete(p_num bigint)
CREATE OR REPLACE FUNCTION public.improve_delete(p_num bigint)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare cur record;
begin
  select * into cur from improvements where num = p_num;
  if not found then raise exception '개선요청 %를 찾을 수 없습니다', p_num; end if;
  if cur.mgr <> '' and cur.mgr <> my_name() then
    raise exception '담당자(%)만 삭제할 수 있습니다', cur.mgr;
  end if;
  delete from improvements where num = p_num;
end $function$
;

-- function: improve_update(p jsonb)
CREATE OR REPLACE FUNCTION public.improve_update(p jsonb)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare cur record; new_memo boolean; new_end text; new_reason text; new_status text;
begin
  select * into cur from improvements where num = (p->>'num')::bigint for update;
  if not found then raise exception '개선요청 %를 찾을 수 없습니다', p->>'num'; end if;

  new_status := coalesce(p->>'status', cur.status);
  new_memo := cur.memo;
  new_end := cur.end_date;
  new_reason := cur.reason;

  if p ? 'status' then
    if new_status = '완료' then
      new_end := coalesce(nullif(p->>'end',''), nullif(cur.end_date,''), to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD'));
    else
      new_end := '';
    end if;
    if new_status in ('불가','보류') then new_reason := coalesce(p->>'reason', cur.reason);
    else new_reason := ''; end if;
    if cur.status in ('접수','접수중') and new_status = '검토중' then new_memo := true; end if;
    if new_status in ('보류','완료','불가') then new_memo := false; end if;
  end if;
  if p ? 'memo' then new_memo := (p->>'memo')::boolean; end if;

  update improvements set
    status = new_status, end_date = new_end, reason = new_reason, memo = new_memo,
    title = coalesce(p->>'title', title), content = coalesce(p->>'content', content),
    type = coalesce(p->>'type', type), loc = coalesce(p->>'loc', loc),
    link = coalesce(p->>'link', link),
    urgent = case when p ? 'urgent' then (p->>'urgent')::boolean else urgent end,
    -- 그림: null 을 명시로 보내면 지운다(키가 아예 없으면 유지)
    drawing = case when p ? 'drawing' then
                     case when jsonb_typeof(p->'drawing') = 'null' then null else p->'drawing' end
                   else drawing end
  where num = (p->>'num')::bigint;
end $function$
;

-- function: improvement_to_note(p_num bigint, p_path text)
CREATE OR REPLACE FUNCTION public.improvement_to_note(p_num bigint, p_path text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_imp public.improvements;
  v_id  bigint;
begin
  select * into v_imp from public.improvements where num = p_num;
  if not found then
    raise exception '요청 %를 찾을 수 없습니다', p_num;
  end if;
  -- 게시판 행이 사라지는 동작이라 권한을 삭제(improve_delete)와 같은 규칙으로 잡는다
  if v_imp.mgr <> '' and v_imp.mgr is distinct from public.my_name() then
    raise exception '담당자(%)만 일반메모로 되돌릴 수 있습니다', v_imp.mgr;
  end if;

  insert into public.page_notes (path, author, author_uid, content, origin_num)
  values (p_path, public.my_name(), auth.uid(), v_imp.content, p_num)
  returning id into v_id;

  -- 답글 글쓴이는 이름만 남아 있다(요청 답글에는 계정 id 가 없다). 이름으로 계정을 찾아 붙이고,
  -- 못 찾으면 옮긴 사람 것으로 둔다 — 화면에 보이는 이름(author)은 원래대로 보존된다.
  insert into public.page_note_replies (note_id, author, author_uid, content, created_at)
  select v_id,
         r.author,
         coalesce((select p.auth_user_id from public.profiles p where p.name = r.author limit 1), auth.uid()),
         r.content,
         coalesce((nullif(r.created, '')::timestamp at time zone 'Asia/Seoul'), now())
  from public.improvement_replies r
  where r.req_num = p_num and not r.deleted
  order by r.id;

  delete from public.improvement_replies where req_num = p_num;  -- FK 가 없어 직접 지운다
  delete from public.improvements where num = p_num;
  return v_id;
end;
$function$
;

-- function: is_admin()
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select exists (select 1 from profiles p where p.auth_user_id = auth.uid() and p.role = 'admin' and coalesce(p.status, 'active') = 'active') $function$
;

-- function: is_member()
CREATE OR REPLACE FUNCTION public.is_member()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select exists (select 1 from public.profiles where auth_user_id = auth.uid() and role in ('member','admin') and coalesce(status, 'active') = 'active') $function$
;

-- function: my_name()
CREATE OR REPLACE FUNCTION public.my_name()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select name from profiles where auth_user_id = auth.uid()), '')
$function$
;

-- function: note_to_improvement(p_id bigint, p_loc text, p_title text)
CREATE OR REPLACE FUNCTION public.note_to_improvement(p_id bigint, p_loc text, p_title text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_note public.page_notes;
  v_num  bigint;
  v_keep bigint;
begin
  select * into v_note from public.page_notes where id = p_id;
  if not found then
    raise exception '메모를 찾을 수 없습니다';
  end if;
  if v_note.author_uid is distinct from auth.uid() then
    raise exception '내가 쓴 메모만 요청메모로 바꿀 수 있습니다';
  end if;
  if v_note.drawing_id is not null then
    raise exception '그림이 딸린 메모는 갈래를 바꿀 수 없습니다 — 그림을 먼저 떼어 주세요';
  end if;

  -- 원래 번호가 있고 아직 비어 있으면 그 번호를 되찾는다(없으면 새 번호 — identity 기본값)
  v_keep := v_note.origin_num;
  if v_keep is not null and exists (select 1 from public.improvements where num = v_keep) then
    v_keep := null;
  end if;

  insert into public.improvements (num, urgent, type, loc, title, content, author, mgr, proposed_date, link, status, memo)
  values (coalesce(v_keep, nextval(pg_get_serial_sequence('public.improvements', 'num'))),
          false, '', coalesce(p_loc, ''), coalesce(nullif(btrim(p_title), ''), '(제목 없음)'), v_note.content,
          public.my_name(), public.my_name(),
          to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD'), '', '접수', true)
  returning num into v_num;

  insert into public.improvement_replies (req_num, created, author, content)
  select v_num, to_char(r.created_at at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS'), r.author, r.content
  from public.page_note_replies r
  where r.note_id = p_id
  order by r.id;

  delete from public.page_notes where id = p_id;  -- 답글은 FK CASCADE 로 함께 사라진다
  return v_num;
end;
$function$
;

-- function: recur_notice_ack(p_token text)
CREATE OR REPLACE FUNCTION public.recur_notice_ack(p_token text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  parts text[] := string_to_array(coalesce(p_token, ''), '.');
  k text;
  v_nid bigint;
  v_ym text;
  v_uid uuid;
  v_name text;
  v_key text;
begin
  if coalesce(array_length(parts, 1), 0) <> 4
     or parts[1] !~ '^[0-9]{1,18}$'
     or parts[2] !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
     or parts[3] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or parts[4] !~ '^[0-9a-f]{64}$' then
    return false;
  end if;
  -- 이번 달(한국) 토큰만 받는다 — 새어 나간 토큰도 그 달이 지나면 쓸모가 없다. 지난달 알림을 늦게 누르면 포털이 열린다(sw.js)
  if parts[2] <> to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY-MM') then
    return false;
  end if;

  select decrypted_secret into k from vault.decrypted_secrets where name = 'recur_ack_key';
  if k is null then
    return false;
  end if;
  if encode(extensions.hmac(parts[1] || '.' || parts[2] || '.' || parts[3], k, 'sha256'), 'hex') <> parts[4] then
    return false;
  end if;

  v_nid := parts[1]::bigint;
  v_ym := parts[2];
  v_uid := parts[3]::uuid;
  select name into v_name from public.profiles where auth_user_id = v_uid and role in ('member', 'admin');
  if v_name is null then
    return false;
  end if;

  v_key := 'recurNotice.ack.' || v_nid;
  -- 달은 앞으로만 간다 — 지난달 알림을 늦게 눌러도 이번 달 확인을 되돌리지 않는다
  insert into public.user_settings (user_name, settings, updated_at)
  values (v_name, jsonb_build_object(v_key, v_ym), now())
  on conflict (user_name) do update
     set settings = public.user_settings.settings || excluded.settings,
         updated_at = now()
   where coalesce(public.user_settings.settings ->> v_key, '') < v_ym;

  -- 아직 안 나간 오늘 예약도 지운다(08:55 예약 ~ 09:00 발송 사이에 누른 경우). 위에서 이번 달 토큰만 통과시켰다
  delete from public.push_queue
   where uid = v_uid
     and status = 'pending'
     and dedupe_key like 'recur:' || v_nid || ':%';
  return true;
end
$function$
;

-- function: recur_notice_window(p_from integer, p_to integer, p_day date, O
CREATE OR REPLACE FUNCTION public.recur_notice_window(p_from integer, p_to integer, p_day date, OUT f integer, OUT t integer)
 RETURNS record
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  m0 date := date_trunc('month', p_day)::date;
  last_day int := extract(day from (m0 + interval '1 month - 1 day'))::int;
  start int := least(p_from, last_day);
  w int;
begin
  t := least(p_to, last_day);
  w := extract(isodow from m0 + t - 1)::int; -- 1=월 … 6=토, 7=일
  if w = 6 then t := least(t + 2, last_day);
  elsif w = 7 then t := least(t + 1, last_day);
  end if;
  f := start;
  while f <= t and extract(isodow from m0 + f - 1) >= 6 loop f := f + 1; end loop;
  while t >= f and extract(isodow from m0 + t - 1) >= 6 loop t := t - 1; end loop;
  if f > t then
    f := start - 1;
    while extract(isodow from m0 + f - 1) >= 6 loop f := f - 1; end loop;
    t := f;
  end if;
end
$function$
;

-- function: recurring_notice_check_recipients()
CREATE OR REPLACE FUNCTION public.recurring_notice_check_recipients()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.recipient_uids is not null and exists (
    select 1 from unnest(new.recipient_uids) as selected(uid)
    where not exists (select 1 from public.profiles p where p.auth_user_id = selected.uid
      and p.role in ('member', 'admin') and p.status = 'active')
  ) then
    raise exception '알림 대상은 활성 팀원 중에서 선택해주세요.';
  end if;
  return new;
end;
$function$
;

-- function: recurring_notice_clear_deleted_push()
CREATE OR REPLACE FUNCTION public.recurring_notice_clear_deleted_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  delete from public.push_queue where status = 'pending'
    and dedupe_key like 'recur:' || old.id || ':%';
  return old;
end;
$function$
;

-- function: recurring_notice_clear_excluded_push()
CREATE OR REPLACE FUNCTION public.recurring_notice_clear_excluded_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  delete from public.push_queue q where q.status = 'pending'
    and q.dedupe_key like 'recur:' || new.id || ':%'
    and (not new.enabled or (new.recipient_uids is not null and not (q.uid = any(new.recipient_uids))));
  return new;
end;
$function$
;

-- function: recurring_notice_keep_owner()
CREATE OR REPLACE FUNCTION public.recurring_notice_keep_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.scope is distinct from old.scope or new.owner_uid is distinct from old.owner_uid then
    raise exception '알림의 공개 범위와 소유자는 변경할 수 없습니다.';
  end if;
  return new;
end;
$function$
;

-- function: reply_create(p_req bigint, p_content text)
CREATE OR REPLACE FUNCTION public.reply_create(p_req bigint, p_content text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare new_id bigint; stamp text;
begin
  stamp := to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI:SS');
  insert into improvement_replies (req_num, created, author, content) values (p_req, stamp, my_name(), p_content)
  returning id into new_id;
  return jsonb_build_object('id', new_id::text, 'created', stamp);
end $function$
;

-- function: reply_delete(p_id bigint)
CREATE OR REPLACE FUNCTION public.reply_delete(p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare cur record;
begin
  select * into cur from improvement_replies where id = p_id for update;
  if not found then raise exception '답글을 찾을 수 없습니다'; end if;
  if cur.author <> my_name() then raise exception '본인이 작성한 답글만 삭제할 수 있습니다'; end if;
  update improvement_replies set deleted = true where id = p_id;
end $function$
;

-- function: reply_update(p_id bigint, p_content text)
CREATE OR REPLACE FUNCTION public.reply_update(p_id bigint, p_content text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
declare cur record; stamp text;
begin
  select * into cur from improvement_replies where id = p_id for update;
  if not found then raise exception '답글을 찾을 수 없습니다'; end if;
  if cur.deleted then raise exception '삭제된 답글입니다'; end if;
  if cur.author <> my_name() then raise exception '본인이 작성한 답글만 수정할 수 있습니다'; end if;
  stamp := to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI:SS');
  update improvement_replies set content = p_content, edited = stamp where id = p_id;
  return stamp;
end $function$
;

-- function: sched_create(p jsonb)
CREATE OR REPLACE FUNCTION public.sched_create(p jsonb)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
declare new_seq int; v_code text;
begin
  if coalesce(trim(p->>'code'),'') = '' and coalesce(trim(p->>'name'),'') = '' then
    raise exception '관리번호 또는 장비명을 입력해주세요';
  end if;
  select coalesce(max(nullif(seq,'')::int), 0) + 1 into new_seq from schedules where seq ~ '^[0-9]+$' or seq = '';
  insert into schedules (seq, code, name, mgr, status, start, stage_pre, stage_bid, stage_eval, stage_nego, stage_make, stage_install, duration, cat, method, price)
  values (new_seq::text, coalesce(p->>'code',''), coalesce(p->>'name',''), coalesce(p->>'mgr',''), coalesce(p->>'status',''),
          coalesce(p->>'start',''), coalesce(p->>'사전규격',''), coalesce(p->>'구매공고',''), coalesce(p->>'기술평가',''),
          coalesce(p->>'기술협상',''), coalesce(p->>'장비제작',''), coalesce(p->>'장비설치',''), coalesce(p->>'duration',''),
          coalesce(p->>'cat',''), coalesce(p->>'method',''), coalesce(nullif(p->>'price','')::numeric, 0));
  -- 짝 운영관리 행(도입예정) — code가 있고 아직 없을 때만. 공통정보만 채우고 나머지는 기본값('').
  v_code := coalesce(trim(p->>'code'),'');
  if v_code <> '' and not exists (select 1 from equipments where code = v_code) then
    insert into equipments (num, code, name, eq_type, bid, mgr, start, price, state)
    values (new_seq::text, v_code, coalesce(p->>'name',''), coalesce(p->>'cat',''), coalesce(p->>'method',''), coalesce(p->>'mgr',''),
            coalesce(p->>'start',''), coalesce(nullif(p->>'price','')::numeric, 0), '도입예정');
  end if;
  return coalesce(p->>'code','');
end $function$
;

-- function: sched_delete(p_code text)
CREATE OR REPLACE FUNCTION public.sched_delete(p_code text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  delete from schedules where code = p_code;
  delete from equipments where code = p_code;
end $function$
;

-- function: set_member_active(p_profile_id uuid, p_active boolean)
CREATE OR REPLACE FUNCTION public.set_member_active(p_profile_id uuid, p_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid;
begin
  if not is_admin() then raise exception '관리자만 바꿀 수 있습니다' using errcode = '42501'; end if;
  select auth_user_id into v_uid from profiles where id = p_profile_id;
  if v_uid is not null and v_uid = auth.uid() then raise exception '본인 계정은 바꿀 수 없습니다'; end if;
  update profiles
     set status = case when p_active then 'active' else 'inactive' end,
         deactivated_at = case when p_active then null else now() end
   where id = p_profile_id;
  if not p_active and v_uid is not null then
    delete from push_subscriptions where uid = v_uid;
    delete from push_queue where uid = v_uid and sent_at is null;
  end if;
end $function$
;

-- function: trip_share_new_pin()
CREATE OR REPLACE FUNCTION public.trip_share_new_pin()
 RETURNS text
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$ select lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 10000)::text, 4, '0') $function$
;

-- function: trip_share_open(p_token text, p_pin text, p_device text, p_ip t
CREATE OR REPLACE FUNCTION public.trip_share_open(p_token text, p_pin text, p_device text DEFAULT ''::text, p_ip text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s public.trip_shares%rowtype;
  dkey text;
  nkey text;
  f public.trip_share_fails%rowtype;
  lock_ts timestamptz;
  until_ts timestamptz;
  locked boolean := false;
begin
  select * into s from public.trip_shares where token = p_token;
  if not found or not s.enabled then
    return jsonb_build_object('status', 'off');
  end if;
  if s.pin is null then
    return jsonb_build_object('status', 'ok', 'event_id', s.event_id);
  end if;
  -- 기기 = 받는 쪽이 만든 번호(없으면 인터넷 주소로 대신). 안전망 = 같은 주소에서 15분 안에 30번 틀리면 그 주소만 15분
  dkey := case when coalesce(p_device, '') ~ '^[A-Za-z0-9-]{8,64}$' then 'd:' || p_device else 'ip:' || left(coalesce(nullif(p_ip, ''), '?'), 64) end;
  nkey := case when coalesce(p_ip, '') <> '' then 'net:' || left(p_ip, 64) end;
  select max(locked_until) into lock_ts from public.trip_share_fails
    where event_id = s.event_id and who in (dkey, nkey) and locked_until > now();
  if lock_ts is not null then
    return jsonb_build_object('status', 'locked', 'until', lock_ts);
  end if;
  if coalesce(p_pin, '') = '' then
    return jsonb_build_object('status', 'pin');
  end if;
  if p_pin = s.pin then
    delete from public.trip_share_fails where event_id = s.event_id and who = dkey;
    return jsonb_build_object('status', 'ok', 'event_id', s.event_id);
  end if;
  until_ts := now() + interval '15 minutes';
  -- 그 기기: 5번 틀리면 15분
  insert into public.trip_share_fails as t (event_id, who, fails, updated_at) values (s.event_id, dkey, 1, now())
    on conflict (event_id, who) do update set fails = t.fails + 1, locked_until = null, updated_at = now()
    returning * into f;
  if f.fails >= 5 then
    update public.trip_share_fails set fails = 0, locked_until = until_ts where event_id = s.event_id and who = dkey;
    locked := true;
  end if;
  -- 같은 주소 안전망(기기 번호를 바꿔 가며 맞히기 막기)
  if nkey is not null then
    insert into public.trip_share_fails as t (event_id, who, fails, updated_at) values (s.event_id, nkey, 1, now())
      on conflict (event_id, who) do update
        set fails = case when t.updated_at < now() - interval '15 minutes' then 1 else t.fails + 1 end, locked_until = null, updated_at = now()
      returning * into f;
    if f.fails >= 30 then
      update public.trip_share_fails set fails = 0, locked_until = until_ts where event_id = s.event_id and who = nkey;
      locked := true;
    end if;
  end if;
  if locked then
    return jsonb_build_object('status', 'locked', 'until', until_ts);
  end if;
  select fails into f.fails from public.trip_share_fails where event_id = s.event_id and who = dkey;
  return jsonb_build_object('status', 'wrong', 'left', 5 - f.fails);
end $function$
;

-- function: trip_shares_guard()
CREATE OR REPLACE FUNCTION public.trip_shares_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    new.token := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_');
    new.pin_fails := 0;
    new.pin_locked_until := null;
    new.created_by := my_name();
    new.created_at := now();
  elsif new.token is distinct from old.token or new.event_id is distinct from old.event_id then
    raise exception '공유 토큰·일정은 바꿀 수 없습니다';
  elsif new.pin is distinct from old.pin then
    new.pin_fails := 0;
    new.pin_locked_until := null;
  end if;
  if new.pin is not null and new.pin !~ '^[0-9]{4}$' then
    raise exception '암호는 숫자 4자리여야 합니다';
  end if;
  new.updated_at := now();
  return new;
end $function$
;

-- function: trip_shares_pin_reset()
CREATE OR REPLACE FUNCTION public.trip_shares_pin_reset()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.pin is distinct from old.pin then
    delete from public.trip_share_fails where event_id = new.event_id;
  end if;
  return null;
end $function$
;

-- function: user_settings_merge(p_patch jsonb)
CREATE OR REPLACE FUNCTION public.user_settings_merge(p_patch jsonb)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  insert into public.user_settings (user_name, settings, updated_at)
  values (public.my_name(), coalesce(p_patch, '{}'::jsonb), now())
  on conflict (user_name) do update
    set settings = public.user_settings.settings || excluded.settings,
        updated_at = now();
$function$
;

-- function: work_canon_name(p_kind text, p_name text)
CREATE OR REPLACE FUNCTION public.work_canon_name(p_kind text, p_name text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce((select a.canonical from work_name_aliases a where a.kind = p_kind and lower(a.alias) = lower(btrim(p_name)) limit 1), btrim(p_name)) $function$
;

-- function: work_equipments_log()
CREATE OR REPLACE FUNCTION public.work_equipments_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    insert into work_link_log (work_num, target_type, target_id, action, actor, actor_name)
    values (new.work_num, 'equipment', new.equipment_id, 'link', auth.uid(), my_name());
    return new;
  end if;
  if not exists (select 1 from works where num = old.work_num) then return old; end if;
  insert into work_link_log (work_num, target_type, target_id, action, actor, actor_name)
  values (old.work_num, 'equipment', old.equipment_id,
          case when exists (select 1 from equipments where id = old.equipment_id) then 'unlink' else 'target_deleted' end,
          auth.uid(), my_name());
  return old;
end $function$
;

-- function: work_events_log()
CREATE OR REPLACE FUNCTION public.work_events_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    insert into work_link_log (work_num, target_type, target_id, action, actor, actor_name)
    values (new.work_num, 'event', new.event_id, 'link', auth.uid(), my_name());
    return new;
  end if;
  if not exists (select 1 from works where num = old.work_num) then return old; end if;
  insert into work_link_log (work_num, target_type, target_id, action, actor, actor_name)
  values (old.work_num, 'event', old.event_id,
          case when exists (select 1 from calendar_events where id = old.event_id) then 'unlink' else 'target_deleted' end,
          auth.uid(), my_name());
  return old;
end $function$
;

-- function: work_is_hidden(p_num bigint)
CREATE OR REPLACE FUNCTION public.work_is_hidden(p_num bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.works w
    where w.num = p_num and w.is_private and w.owner_uid is distinct from auth.uid()
  );
$function$
;

-- function: work_log_changes()
CREATE OR REPLACE FUNCTION public.work_log_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  who   text;
  k_old text;
  k_new text;
  invis    constant text := chr(160) || chr(8203) || chr(8204) || chr(8205) || chr(65279);
  p_inline constant text := '(?<=[^ ' || chr(9) || chr(10) || '])[ ' || chr(9) || ']+';
  p_blank  constant text := chr(10) || '[ ' || chr(9) || ']*(?=' || chr(10) || ')';
begin
  if coalesce(current_setting('app.work_skip_history', true), '') = '1' then
    return new;
  end if;

  if coalesce(old.deleted_at, '') is distinct from coalesce(new.deleted_at, '') then
    return new;
  end if;
  if coalesce(new.deleted_at, '') <> '' then
    return new;
  end if;

  who := coalesce(nullif(my_name(), ''), '시스템');

  if coalesce(old.status, '') is distinct from coalesce(new.status, '') then
    insert into work_history (num, field, prev, next, author)
    values (new.num, '상태', coalesce(old.status, ''), coalesce(new.status, ''), who);
  end if;

  if coalesce(old.mgr, '') is distinct from coalesce(new.mgr, '') then
    insert into work_history (num, field, prev, next, author)
    values (new.num, '담당자', coalesce(old.mgr, ''), coalesce(new.mgr, ''), who);
  end if;

  if coalesce(old.plan, '') is distinct from coalesce(new.plan, '') then
    insert into work_history (num, field, prev, next, author)
    values (new.num, '예정일', coalesce(old.plan, ''), coalesce(new.plan, ''), who);
  end if;

  if coalesce(old.remind, false) is distinct from coalesce(new.remind, false) then
    insert into work_history (num, field, prev, next, author)
    values (new.num, 'Remind',
            case when coalesce(old.remind, false) then '켜짐' else '꺼짐' end,
            case when coalesce(new.remind, false) then '켜짐' else '꺼짐' end, who);
  end if;

  -- 대기처·재확인일(업무현황 개편 Phase 1, 2026-09-21)
  if old.waiting_on is distinct from new.waiting_on then
    insert into work_history (num, field, prev, next, author)
    values (new.num, '대기처',
            case old.waiting_on when 'vendor' then '업체' when 'parent_org' then '상위기관' when 'other_dept' then '타부서' when 'internal' then '내부 보류' else '' end,
            case new.waiting_on when 'vendor' then '업체' when 'parent_org' then '상위기관' when 'other_dept' then '타부서' when 'internal' then '내부 보류' else '' end, who);
  end if;

  if old.remind_at is distinct from new.remind_at then
    insert into work_history (num, field, prev, next, author)
    values (new.num, '재확인일', coalesce(old.remind_at::text, ''), coalesce(new.remind_at::text, ''), who);
  end if;

  -- 프로젝트·트랙 이동(Phase 2, 2026-09-21) — 이름으로 남긴다
  if old.project_id is distinct from new.project_id then
    insert into work_history (num, field, prev, next, author)
    values (new.num, '프로젝트',
            coalesce((select name from projects where id = old.project_id), ''),
            coalesce((select name from projects where id = new.project_id), ''), who);
  end if;

  if old.track_id is distinct from new.track_id then
    insert into work_history (num, field, prev, next, author)
    values (new.num, '트랙',
            coalesce((select name from project_tracks where id = old.track_id), ''),
            coalesce((select name from project_tracks where id = new.track_id), ''), who);
  end if;

  -- 긴급도·건강도(2026-10-06 완성도 점검 11) — 화면 이름으로. 없음·미정 = 빈 값
  if coalesce(old.priority, 0) is distinct from coalesce(new.priority, 0) then
    insert into work_history (num, field, prev, next, author)
    values (new.num, '긴급도',
            case coalesce(old.priority, 0) when 1 then '긴급' when 2 then '높음' when 3 then '보통' when 4 then '낮음' else '' end,
            case coalesce(new.priority, 0) when 1 then '긴급' when 2 then '높음' when 3 then '보통' when 4 then '낮음' else '' end, who);
  end if;

  if old.health is distinct from new.health then
    insert into work_history (num, field, prev, next, author)
    values (new.num, '건강도',
            case old.health when 'on_track' then '정상' when 'at_risk' then '주의' when 'off_track' then '위험' else '' end,
            case new.health when 'on_track' then '정상' when 'at_risk' then '주의' when 'off_track' then '위험' else '' end, who);
  end if;

  -- 내용 — 글자가 실제로 더해지거나 빠졌을 때만 남긴다(2026-08-13 사용자 지시).
  k_old := btrim(regexp_replace(regexp_replace(
             translate(replace(coalesce(old.task, ''), chr(13), ''), invis, ' '),
             p_inline, '', 'g'), p_blank, '', 'g'), ' ' || chr(9) || chr(10));
  k_new := btrim(regexp_replace(regexp_replace(
             translate(replace(coalesce(new.task, ''), chr(13), ''), invis, ' '),
             p_inline, '', 'g'), p_blank, '', 'g'), ' ' || chr(9) || chr(10));

  if k_old is distinct from k_new then
    insert into work_history (num, field, prev, next, author)
    values (new.num, '내용', coalesce(old.task, ''), coalesce(new.task, ''), who);
  end if;

  -- 서식(content_fmt)은 기록하지 않는다(2026-08-13 사용자 지시로 제거. 되살리지 말 것)

  if coalesce(old.end_date, '') is distinct from coalesce(new.end_date, '')
     and coalesce(old.status, '') is not distinct from coalesce(new.status, '') then
    insert into work_history (num, field, prev, next, author)
    values (new.num, '완료일', coalesce(old.end_date, ''), coalesce(new.end_date, ''), who);
  end if;

  return new;
end
$function$
;

-- function: work_log_sub_assignees()
CREATE OR REPLACE FUNCTION public.work_log_sub_assignees()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  who text; o text[]; n text[]; added text[] := '{}'; removed text[] := '{}'; x text; y text; nm text; paired boolean;
begin
  if coalesce(current_setting('app.work_skip_history', true), '') = '1' then return new; end if;
  if coalesce(new.deleted_at, '') <> '' then return new; end if;
  o := case when tg_op = 'UPDATE' then work_sub_assignee_set(old.content_fmt) else '{}' end;
  n := work_sub_assignee_set(new.content_fmt);
  foreach x in array n loop if not (x = any(o)) then added := added || x; end if; end loop;
  foreach x in array o loop if not (x = any(n)) then removed := removed || x; end if; end loop;
  if cardinality(added) = 0 and cardinality(removed) = 0 then return new; end if;
  who := coalesce(nullif(my_name(), ''), '시스템');
  -- 같은 사람의 빠짐·생김은 한 줄로 묶는다(맡은 글만 고친 경우: 이전 → 이후)
  foreach x in array added loop
    nm := split_part(x, ' · ', 1); paired := false;
    foreach y in array removed loop
      if split_part(y, ' · ', 1) = nm then
        insert into work_history (num, field, prev, next, author) values (new.num, '세부담당', y, x, who);
        removed := array_remove(removed, y); paired := true; exit;
      end if;
    end loop;
    if not paired then insert into work_history (num, field, prev, next, author) values (new.num, '세부담당', '', x, who); end if;
  end loop;
  foreach y in array removed loop
    insert into work_history (num, field, prev, next, author) values (new.num, '세부담당', y, '', who);
  end loop;
  return new;
end $function$
;

-- function: work_rebuild_links(p_num bigint)
CREATE OR REPLACE FUNCTION public.work_rebuild_links(p_num bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  delete from work_assignees where work_num = p_num;
  insert into work_assignees (work_num, profile_id)
  select distinct p_num, pr.id
    from works w
    cross join lateral unnest(string_to_array(coalesce(w.mgr, ''), ',')) s(n)
    join profiles pr on pr.name = btrim(s.n)
   where w.num = p_num;
end $function$
;

-- function: work_relations_log()
CREATE OR REPLACE FUNCTION public.work_relations_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  a_alive boolean;
  b_alive boolean;
begin
  if tg_op = 'INSERT' then
    insert into work_link_log (work_num, target_type, target_id, action, actor, actor_name)
    values (new.a_num, 'work', new.b_num, 'link', auth.uid(), my_name()),
           (new.b_num, 'work', new.a_num, 'link', auth.uid(), my_name());
    return new;
  end if;
  a_alive := exists (select 1 from works where num = old.a_num);
  b_alive := exists (select 1 from works where num = old.b_num);
  if a_alive then
    insert into work_link_log (work_num, target_type, target_id, action, actor, actor_name)
    values (old.a_num, 'work', old.b_num, case when b_alive then 'unlink' else 'target_deleted' end, auth.uid(), my_name());
  end if;
  if b_alive then
    insert into work_link_log (work_num, target_type, target_id, action, actor, actor_name)
    values (old.b_num, 'work', old.a_num, case when a_alive then 'unlink' else 'target_deleted' end, auth.uid(), my_name());
  end if;
  return old;
end $function$
;

-- function: work_restore(nums bigint[])
CREATE OR REPLACE FUNCTION public.work_restore(nums bigint[])
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare n bigint; base numeric; r record; result jsonb := '{}'::jsonb;
begin
  select coalesce(max(sort_order), 0) into base from works where status = '진행중' and deleted_at = '';
  foreach n in array nums loop
    select * into r from works where num = n for update;
    if not found then continue; end if;
    if r.status = '진행중' then
      base := base + 10;
      update works set deleted_at = '', sort_order = base, updated_at = now() where num = n;
      result := result || jsonb_build_object(n::text, base);
    else
      update works set deleted_at = '', updated_at = now() where num = n;
    end if;
  end loop;
  return result;
end $function$
;

-- function: work_set_tags(p_num bigint, p_tags text[], p_auto text[])
CREATE OR REPLACE FUNCTION public.work_set_tags(p_num bigint, p_tags text[], p_auto text[] DEFAULT '{}'::text[])
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_name text; v_id bigint; v_ids bigint[] := '{}'; v_auto bigint[] := '{}'; v_old text; v_new text;
  v_who text := coalesce(nullif(my_name(), ''), '시스템');
begin
  if not is_member() then raise exception '권한이 없습니다'; end if;
  if work_is_hidden(p_num) then raise exception '볼 수 없는 업무입니다'; end if;
  foreach v_name in array coalesce(p_tags, '{}') loop
    v_name := btrim(v_name);
    continue when v_name = '' or length(v_name) > 30;
    v_id := work_tag_resolve(v_name);
    if v_id is null then
      insert into work_tags (name, sort_order, created_by)
        values (v_name, (select coalesce(max(sort_order), 0) + 1 from work_tags), v_who) returning id into v_id;
    else
      update work_tags set archived_at = null where id = v_id and archived_at is not null;
    end if;
    if not v_id = any(v_ids) then v_ids := v_ids || v_id; end if;
  end loop;
  foreach v_name in array coalesce(p_auto, '{}') loop
    v_id := work_tag_resolve(v_name);
    if v_id is not null then v_auto := v_auto || v_id; end if;
  end loop;
  select coalesce(string_agg(t.name, ', ' order by t.name), '') into v_old from work_tag_links l join work_tags t on t.id = l.tag_id where l.work_num = p_num;
  delete from work_tag_links where work_num = p_num and not (tag_id = any(v_ids));
  insert into work_tag_links (work_num, tag_id, source, created_by)
    select p_num, x, case when x = any(v_auto) then 'auto' else 'user' end, v_who from unnest(v_ids) x
  on conflict (work_num, tag_id) do update
    set source = case when excluded.source = 'user' and work_tag_links.source = 'auto' then 'user' else work_tag_links.source end;
  select coalesce(string_agg(t.name, ', ' order by t.name), '') into v_new from work_tag_links l join work_tags t on t.id = l.tag_id where l.work_num = p_num;
  if v_old is distinct from v_new then
    insert into work_history (num, field, prev, next, author) values (p_num, '태그', v_old, v_new, v_who);
  end if;
  return (select coalesce(array_agg(t.name order by t.name), '{}') from work_tag_links l join work_tags t on t.id = l.tag_id where l.work_num = p_num);
end $function$
;

-- function: work_sub_assignee_set(fmt text)
CREATE OR REPLACE FUNCTION public.work_sub_assignee_set(fmt text)
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare j jsonb; outv text[];
begin
  if coalesce(btrim(fmt), '') = '' then return '{}'; end if;
  begin j := fmt::jsonb; exception when others then return '{}'; end;
  select coalesce(array_agg(distinct item order by item), '{}') into outv from (
    select a.name || ' · ' || left(btrim(regexp_replace(coalesce(nullif(btrim(rng.t), ''), whole.t, ''), '^\\s*[①-⑳•▪◦·●○]\\s*', '')), 60) as item
    from jsonb_path_query(j, 'lax $.**') p
    cross join lateral (
      select distinct c->'attrs'->>'name' as name from jsonb_array_elements(p->'content') c
      where c->>'type' = 'assignee' and coalesce(c->'attrs'->>'name', '') <> ''
    ) a
    cross join lateral (select string_agg(c->>'text', '') as t from jsonb_array_elements(p->'content') c where c->>'type' = 'text') whole
    cross join lateral (
      select string_agg(c->>'text', '') as t from jsonb_array_elements(p->'content') c
      where c->>'type' = 'text' and exists (
        select 1 from jsonb_array_elements(coalesce(c->'marks', '[]'::jsonb)) m
        where m->>'type' = 'assigneeRange' and m->'attrs'->>'name' = a.name)
    ) rng
    where jsonb_typeof(p) = 'object' and p->>'type' = 'paragraph' and jsonb_typeof(p->'content') = 'array'
  ) s;
  return outv;
end $function$
;

-- function: work_tag_archive(p_id bigint, p_archived boolean)
CREATE OR REPLACE FUNCTION public.work_tag_archive(p_id bigint, p_archived boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_member() then raise exception '권한이 없습니다'; end if;
  update work_tags set archived_at = case when p_archived then now() else null end where id = p_id;
end $function$
;

-- function: work_tag_merge(p_from bigint, p_into bigint)
CREATE OR REPLACE FUNCTION public.work_tag_merge(p_from bigint, p_into bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_from text;
begin
  if not is_member() then raise exception '권한이 없습니다'; end if;
  if p_from = p_into then raise exception '같은 태그입니다'; end if;
  select name into v_from from work_tags where id = p_from;
  if v_from is null or not exists (select 1 from work_tags where id = p_into) then raise exception '없는 태그입니다'; end if;
  insert into work_tag_links (work_num, tag_id, source, created_at, created_by)
    select work_num, p_into, source, created_at, created_by from work_tag_links where tag_id = p_from
  on conflict (work_num, tag_id) do update set source = case when excluded.source = 'user' then 'user' else work_tag_links.source end;
  update work_tag_aliases set tag_id = p_into where tag_id = p_from;
  update work_class_feedback set target_id = p_into where kind = 'tag' and target_id = p_from;
  delete from work_tags where id = p_from;
  insert into work_tag_aliases (alias, tag_id, created_by) values (v_from, p_into, coalesce(nullif(my_name(), ''), '시스템')) on conflict do nothing;
end $function$
;

-- function: work_tag_norm(p text)
CREATE OR REPLACE FUNCTION public.work_tag_norm(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$ select lower(regexp_replace(coalesce(p, ''), '[[:space:]·.\\-_/]+', '', 'g')) $function$
;

-- function: work_tag_rename(p_id bigint, p_name text)
CREATE OR REPLACE FUNCTION public.work_tag_rename(p_id bigint, p_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_old text; v_hit bigint; v_name text := btrim(coalesce(p_name, ''));
begin
  if not is_member() then raise exception '권한이 없습니다'; end if;
  if v_name = '' or length(v_name) > 30 then raise exception '태그 이름은 1~30자로 적어주세요'; end if;
  select name into v_old from work_tags where id = p_id;
  if v_old is null then raise exception '없는 태그입니다'; end if;
  v_hit := work_tag_resolve(v_name);
  if v_hit is not null and v_hit <> p_id then raise exception '같은 이름(또는 별칭)의 태그가 이미 있습니다 — 합치기를 써주세요'; end if;
  delete from work_tag_aliases where tag_id = p_id and work_tag_norm(alias) = work_tag_norm(v_name);
  update work_tags set name = v_name where id = p_id;
  if work_tag_norm(v_old) <> work_tag_norm(v_name) then
    insert into work_tag_aliases (alias, tag_id, created_by) values (v_old, p_id, coalesce(nullif(my_name(), ''), '시스템')) on conflict do nothing;
  end if;
end $function$
;

-- function: work_tag_resolve(p_name text)
CREATE OR REPLACE FUNCTION public.work_tag_resolve(p_name text)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce((select id from work_tags where work_tag_norm(name) = work_tag_norm(p_name) limit 1),
    (select tag_id from work_tag_aliases where work_tag_norm(alias) = work_tag_norm(p_name) limit 1)) $function$
;

-- function: work_tag_set_aliases(p_id bigint, p_aliases text[])
CREATE OR REPLACE FUNCTION public.work_tag_set_aliases(p_id bigint, p_aliases text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_a text; v_hit bigint;
begin
  if not is_member() then raise exception '권한이 없습니다'; end if;
  if not exists (select 1 from work_tags where id = p_id) then raise exception '없는 태그입니다'; end if;
  delete from work_tag_aliases where tag_id = p_id;
  foreach v_a in array coalesce(p_aliases, '{}') loop
    v_a := btrim(v_a);
    continue when v_a = '' or work_tag_norm(v_a) = (select work_tag_norm(name) from work_tags where id = p_id);
    v_hit := work_tag_resolve(v_a);
    if v_hit is not null and v_hit <> p_id then raise exception '''%''는 다른 태그의 이름(또는 별칭)입니다', v_a; end if;
    insert into work_tag_aliases (alias, tag_id, created_by) values (v_a, p_id, coalesce(nullif(my_name(), ''), '시스템')) on conflict do nothing;
  end loop;
end $function$
;

-- function: work_update_orders(orders jsonb)
CREATE OR REPLACE FUNCTION public.work_update_orders(orders jsonb)
 RETURNS void
 LANGUAGE sql
AS $function$
  update works w set sort_order = (o->>'order')::numeric, updated_at = now()
  from jsonb_array_elements(orders) o
  where w.num = (o->>'num')::bigint and w.sort_order is distinct from (o->>'order')::numeric
$function$
;

-- function: work_update_statuses(changes jsonb)
CREATE OR REPLACE FUNCTION public.work_update_statuses(changes jsonb)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare c jsonb; cur record; new_end text; new_chief boolean;
begin
  for c in select * from jsonb_array_elements(changes) loop
    select * into cur from works where num = (c->>'num')::bigint for update;
    if not found then raise exception '업무 %를 찾을 수 없습니다', c->>'num'; end if;
    if (c->>'prevStatus') is not null and cur.status is distinct from (c->>'prevStatus') then
      raise exception '다른 곳에서 먼저 변경된 업무가 있습니다 (번호 %). 새로고침 후 다시 시도해주세요', c->>'num';
    end if;
    if c->>'status' = '완료' then
      new_end := coalesce(nullif(c->>'end',''), nullif(cur.end_date,''), to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD'));
      new_chief := false;
    else
      new_end := '';
      new_chief := coalesce((c->>'chief')::boolean, false);
    end if;
    update works set status = c->>'status', remind = coalesce((c->>'remind')::boolean, false),
      chief = new_chief, end_date = new_end, updated_at = now()
    where num = (c->>'num')::bigint;
  end loop;
end $function$
;

-- function: works_check_milestone()
CREATE OR REPLACE FUNCTION public.works_check_milestone()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.milestone_id is not null and not exists (
    select 1 from project_milestones m where m.id = new.milestone_id and m.track_id is not distinct from new.track_id
  ) then
    raise exception '마일스톤이 업무와 같은 트랙이 아닙니다.' using errcode = '23514';
  end if;
  return new;
end $function$
;

-- function: works_check_track()
CREATE OR REPLACE FUNCTION public.works_check_track()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.track_id is not null and not exists (
    select 1 from project_tracks t where t.id = new.track_id and t.project_id is not distinct from new.project_id
  ) then
    raise exception '트랙이 업무의 프로젝트에 속하지 않습니다.' using errcode = '23514';
  end if;
  return new;
end $function$
;

-- function: works_default_start()
CREATE OR REPLACE FUNCTION public.works_default_start()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(new.start, '') = '' then
    new.start := to_char(coalesce(new.created_at, now()) at time zone 'Asia/Seoul', 'YYYY-MM-DD');
  end if;
  return new;
end $function$
;

-- function: works_guard_private()
CREATE OR REPLACE FUNCTION public.works_guard_private()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    -- 출생 신고 — 클라이언트가 보낸 값이 아니라 **지금 상태**에서 파생시킨다
    new.private_origin := coalesce(new.is_private, false);
    if coalesce(new.author, '') = '' then
      new.author := coalesce(my_name(), '');
    end if;
    return new;
  end if;

  -- 아래는 UPDATE — 태생과 소유자는 못 바꾼다(바꿀 수 있으면 아래 검사가 무의미해진다)
  new.private_origin := old.private_origin;
  new.owner_uid := old.owner_uid;
  if coalesce(old.author, '') <> '' then
    new.author := old.author;
  end if;

  if coalesce(new.is_private, false) is distinct from coalesce(old.is_private, false) then
    if not old.private_origin then
      raise exception '공개로 만든 업무는 비공개로 바꿀 수 없습니다.' using errcode = '42501';
    end if;
    if old.owner_uid is null or old.owner_uid is distinct from auth.uid() then
      raise exception '이 업무를 만든 사람만 공개/비공개를 바꿀 수 있습니다.' using errcode = '42501';
    end if;
  end if;

  return new;
end
$function$
;

-- function: works_sync_derived()
CREATE OR REPLACE FUNCTION public.works_sync_derived()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.progress is null then
      new.progress := case coalesce(new.status, '') when '완료' then 'done' when '취소' then 'done' else 'in_progress' end;
    end if;
    if coalesce(new.status, '') = '보류' then
      if new.waiting_on is null then new.waiting_on := 'internal'; end if;
    else
      new.waiting_on := null;
    end if;
  elsif new.status is distinct from old.status then
    if new.progress is not distinct from old.progress then
      new.progress := case coalesce(new.status, '')
        when '완료' then 'done'
        when '취소' then 'done'
        else case when old.progress is null or old.progress = 'done' then 'in_progress' else old.progress end
      end;
    end if;
    if new.waiting_on is not distinct from old.waiting_on then
      if coalesce(new.status, '') = '보류' then
        if new.waiting_on is null then new.waiting_on := 'internal'; end if;
      else
        new.waiting_on := null;
      end if;
    end if;
  end if;
  if new.waiting_on is null then
    new.waiting_since := null;
  elsif tg_op = 'INSERT' or new.waiting_on is distinct from old.waiting_on then
    if new.waiting_since is null or (tg_op = 'UPDATE' and new.waiting_since is not distinct from old.waiting_since) then
      new.waiting_since := current_date;
    end if;
  end if;
  new.is_team := exists (
    select 1 from unnest(string_to_array(coalesce(new.mgr, ''), ',')) s(n) where work_canon_name('person', s.n) = '센터');
  return new;
end $function$
;

-- function: works_sync_links()
CREATE OR REPLACE FUNCTION public.works_sync_links()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' or old.mgr is distinct from new.mgr then
    perform work_rebuild_links(new.num);
  end if;
  return null;
end $function$
;

-- table: _backup_work_tag_aliases_20261101
create table public._backup_work_tag_aliases_20261101 (
  alias text,
  tag_id bigint,
  created_at timestamp with time zone,
  created_by text
);

-- table: _backup_work_tag_links_20261101
create table public._backup_work_tag_links_20261101 (
  work_num bigint,
  tag_id bigint,
  source text,
  created_at timestamp with time zone,
  created_by text
);

-- table: _backup_work_tags_20261101
create table public._backup_work_tags_20261101 (
  id bigint,
  name text,
  tone text,
  sort_order integer,
  archived_at timestamp with time zone,
  created_at timestamp with time zone,
  created_by text
);

-- table: angel_chats
create table public.angel_chats (
  id bigint default nextval('angel_chats_id_seq'::regclass) not null,
  uid uuid default auth.uid() not null,
  who text not null,
  text text not null,
  lines jsonb,
  created_at timestamp with time zone default now() not null
);

-- table: angel_drafts
create table public.angel_drafts (
  uid uuid default auth.uid() not null,
  draft jsonb not null,
  updated_at timestamp with time zone default now() not null
);

-- table: api_usage
create table public.api_usage (
  id bigint generated always as identity not null,
  at timestamp with time zone default now() not null,
  service text not null,
  fn text not null,
  ok boolean default true not null,
  status integer,
  model text,
  tokens_in integer,
  tokens_out integer,
  detail text
);

-- table: backup_work_tags_v2_20261101
create table public.backup_work_tags_v2_20261101 (
  k text not null,
  v jsonb not null,
  at timestamp with time zone default now() not null
);

-- table: calendar_del_log
create table public.calendar_del_log (
  id bigint generated always as identity not null,
  gcal_id text not null,
  deleted_at timestamp with time zone default now() not null
);

-- table: calendar_events
create table public.calendar_events (
  id bigint generated by default as identity not null,
  title text default ''::text not null,
  loc text default ''::text not null,
  all_day boolean default false not null,
  start_at text default ''::text not null,
  end_at text default ''::text not null,
  repeat text default 'none'::text not null,
  repeat_until text default ''::text not null,
  created_by text default ''::text not null,
  created_at timestamp with time zone default now() not null,
  series_id text default ''::text not null,
  gcal_id text default ''::text not null,
  updated_at timestamp with time zone default now() not null,
  note text default ''::text not null,
  travel jsonb,
  private boolean default false not null,
  day_label boolean
);

-- table: calendar_sync_config
create table public.calendar_sync_config (
  k text not null,
  v text not null
);

-- table: demo_chat
create table public.demo_chat (
  id bigint generated always as identity not null,
  equipment text not null,
  makers text[] default '{}'::text[] not null,
  body text not null,
  author text default ''::text not null,
  member_uid uuid,
  created_at timestamp with time zone default now() not null,
  title text default ''::text not null,
  sort_order double precision,
  width smallint default 1 not null
);

-- table: demo_metric_def_history
create table public.demo_metric_def_history (
  id bigint generated always as identity not null,
  equipment text not null,
  metric_key text not null,
  action text not null,
  before jsonb,
  after jsonb,
  changed_by text,
  changed_at timestamp with time zone default now() not null
);

-- table: demo_metric_defs
create table public.demo_metric_defs (
  id bigint generated always as identity not null,
  equipment text not null,
  metric_key text not null,
  label text not null,
  unit text default ''::text not null,
  direction text default 'higher'::text not null,
  sort integer default 0 not null,
  active boolean default true not null,
  created_by text,
  created_at timestamp with time zone default now() not null,
  updated_by text,
  updated_at timestamp with time zone default now() not null
);

-- table: demo_results
create table public.demo_results (
  id bigint generated always as identity not null,
  equipment text not null,
  maker text not null,
  model text default ''::text not null,
  round integer default 1 not null,
  visit_date date,
  place text default ''::text not null,
  conditions text default ''::text not null,
  metrics jsonb default '{}'::jsonb not null,
  photos jsonb default '[]'::jsonb not null,
  files jsonb default '[]'::jsonb not null,
  cover integer default 0 not null,
  created_by text,
  created_at timestamp with time zone default now() not null,
  updated_by text,
  updated_at timestamp with time zone default now() not null,
  sample_info text default ''::text not null,
  round_label text default ''::text not null,
  visit_id bigint not null
);

-- table: demo_value_history
create table public.demo_value_history (
  id bigint generated always as identity not null,
  equipment text not null,
  maker text not null,
  model text default ''::text not null,
  round integer default 1 not null,
  before jsonb,
  after jsonb,
  changed_by text,
  changed_at timestamp with time zone default now() not null
);

-- table: demo_visits
create table public.demo_visits (
  id bigint generated by default as identity not null,
  equipment text not null,
  maker text not null,
  round integer default 1 not null,
  label text default ''::text not null,
  visit_date date,
  place text default ''::text not null,
  files jsonb default '[]'::jsonb not null,
  created_by text,
  created_at timestamp with time zone default now() not null,
  updated_by text,
  updated_at timestamp with time zone default now() not null
);

-- table: equipment_history
create table public.equipment_history (
  id bigint generated by default as identity not null,
  at text default ''::text not null,
  code text default ''::text not null,
  name text default ''::text not null,
  prev text default ''::text not null,
  next text default ''::text not null,
  reason text default ''::text not null,
  author text default ''::text not null,
  work_type text default ''::text not null,
  note text default ''::text not null
);

-- table: equipments
create table public.equipments (
  id bigint generated by default as identity not null,
  num text default ''::text not null,
  code text default ''::text not null,
  name text default ''::text not null,
  cat text default ''::text not null,
  use_type text default ''::text not null,
  eq_type text default ''::text not null,
  bid text default ''::text not null,
  fund text default ''::text not null,
  mgr text default ''::text not null,
  start text default ''::text not null,
  asset_no text default ''::text not null,
  nfec text default ''::text not null,
  maker text default ''::text not null,
  model text default ''::text not null,
  price numeric default 0 not null,
  install_date text default ''::text not null,
  install_loc text default ''::text not null,
  state text default ''::text not null,
  mgr2 text default ''::text not null,
  vendor text default ''::text not null,
  contact text default ''::text not null,
  note text default ''::text not null,
  created_at timestamp with time zone default now() not null,
  stage text default 'review'::text not null,
  stage_at timestamp with time zone,
  stage_by text default ''::text not null
);

-- table: event_attendees
create table public.event_attendees (
  id bigint generated by default as identity not null,
  event_id text not null,
  name text not null,
  member_uid uuid,
  created_by text default ''::text,
  created_at timestamp with time zone default now()
);

-- table: event_equipments
create table public.event_equipments (
  event_id bigint not null,
  equipment_id bigint not null,
  created_by uuid default auth.uid(),
  created_at timestamp with time zone default now() not null
);

-- table: event_submissions
create table public.event_submissions (
  id bigint generated by default as identity not null,
  category text default ''::text,
  title text default ''::text,
  start_date text default ''::text,
  end_date text default ''::text,
  venue text default ''::text,
  organizer text default ''::text,
  link text default ''::text,
  poster text default ''::text,
  summary jsonb default '[]'::jsonb not null,
  status text default 'pending'::text not null,
  submitter text default ''::text,
  note text default ''::text,
  created_at timestamp with time zone default now()
);

-- table: event_timetables
create table public.event_timetables (
  id bigint generated always as identity not null,
  event_id text not null,
  path text not null,
  name text not null,
  uploaded_by text,
  created_at timestamp with time zone default now() not null
);

-- table: improve_locations
create table public.improve_locations (
  name text not null,
  sort integer default 0 not null
);

-- table: improvement_drafts
create table public.improvement_drafts (
  id bigint generated by default as identity not null,
  author text default ''::text not null,
  urgent boolean default false not null,
  title text default ''::text not null,
  link text default ''::text not null,
  loc text default ''::text not null,
  content text default ''::text not null,
  saved_at text default ''::text not null,
  author_uid uuid
);

-- table: improvement_replies
create table public.improvement_replies (
  id bigint generated by default as identity not null,
  req_num bigint not null,
  created text default ''::text not null,
  author text default ''::text not null,
  content text default ''::text not null,
  edited text default ''::text not null,
  deleted boolean default false not null
);

-- table: improvements
create table public.improvements (
  num bigint generated by default as identity not null,
  urgent boolean default false not null,
  type text default ''::text not null,
  loc text default ''::text not null,
  title text default ''::text not null,
  content text default ''::text not null,
  author text default ''::text not null,
  mgr text default ''::text not null,
  proposed_date text default ''::text not null,
  link text default ''::text not null,
  status text default '접수'::text not null,
  end_date text default ''::text not null,
  reason text default ''::text not null,
  memo boolean default false not null,
  created_at timestamp with time zone default now() not null,
  drawing jsonb,
  x double precision,
  y double precision,
  path text
);

-- table: meeting_memos
create table public.meeting_memos (
  id bigint generated always as identity not null,
  num bigint,
  anchor text default ''::text not null,
  content text not null,
  meeting_date date default ((now() AT TIME ZONE 'Asia/Seoul'::text))::date not null,
  author text default my_name() not null,
  author_uid uuid default auth.uid() not null,
  created_at timestamp with time zone default now() not null,
  refs jsonb default '[]'::jsonb not null
);

-- table: milestone_dependency
create table public.milestone_dependency (
  from_milestone_id bigint not null,
  to_milestone_id bigint not null
);

-- table: milestones
create table public.milestones (
  id bigint generated always as identity not null,
  category text not null,
  title text not null,
  content text default ''::text not null,
  start_label text default ''::text not null,
  end_label text default ''::text not null,
  start_q text not null,
  end_q text not null,
  fuzzy boolean default false not null,
  deliverable text default ''::text not null,
  coop text default ''::text not null,
  owner text default ''::text not null,
  status text default '예정'::text not null,
  completed_at date,
  sort integer not null,
  updated_by text default ''::text not null,
  updated_at timestamp with time zone default now() not null
);

-- table: notices
create table public.notices (
  num bigint generated by default as identity not null,
  pinned boolean default false not null,
  cat text default ''::text not null,
  dept text default ''::text not null,
  dept_mgr text default ''::text not null,
  title text default ''::text not null,
  body text default ''::text not null,
  ref text default ''::text not null,
  posted_date text default ''::text not null,
  posted_time text default ''::text not null,
  end_date text default ''::text not null,
  author text default ''::text not null,
  target text default ''::text not null,
  created_at timestamp with time zone default now() not null,
  start_date text default ''::text not null,
  attachments jsonb default '[]'::jsonb not null
);

-- table: page_drawings
create table public.page_drawings (
  id bigint generated by default as identity not null,
  path text not null,
  author text default my_name() not null,
  author_uid uuid default auth.uid() not null,
  strokes jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  req_num bigint
);

-- table: page_note_replies
create table public.page_note_replies (
  id bigint generated by default as identity not null,
  note_id bigint not null,
  author text default my_name() not null,
  author_uid uuid default auth.uid() not null,
  content text not null,
  created_at timestamp with time zone default now() not null
);

-- table: page_notes
create table public.page_notes (
  id bigint generated by default as identity not null,
  path text not null,
  author text default my_name() not null,
  author_uid uuid default auth.uid() not null,
  content text default ''::text not null,
  shared text[] default '{}'::text[] not null,
  drawing_id bigint,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  target text,
  x integer,
  y integer,
  origin_num bigint
);

-- table: place_favorites
create table public.place_favorites (
  id bigint generated always as identity not null,
  name text not null,
  place_name text default ''::text not null,
  addr text default ''::text not null,
  lat double precision not null,
  lng double precision not null,
  created_by uuid default auth.uid(),
  created_at timestamp with time zone default now() not null
);

-- table: profiles
create table public.profiles (
  id uuid default gen_random_uuid() not null,
  auth_user_id uuid,
  name text not null,
  emp_no text,
  role text default 'guest'::text not null,
  created_at timestamp with time zone default now() not null,
  "position" text,
  status text default 'active'::text not null,
  deactivated_at timestamp with time zone
);

-- table: project_milestones
create table public.project_milestones (
  id bigint generated always as identity not null,
  track_id bigint not null,
  name text not null,
  done_criteria text not null,
  target_date date,
  target_precision text,
  reached boolean default false not null,
  reached_at date,
  is_review boolean default false not null,
  note text,
  sort_order integer default 100 not null,
  archived_at timestamp with time zone,
  created_at timestamp with time zone default now() not null
);

-- table: project_tracks
create table public.project_tracks (
  id bigint generated always as identity not null,
  project_id bigint,
  name text not null,
  sort_order integer default 100 not null,
  archived_at timestamp with time zone
);

-- table: projects
create table public.projects (
  id bigint generated always as identity not null,
  name text not null,
  description text,
  sort_order integer default 100 not null,
  archived_at timestamp with time zone
);

-- table: push_queue
create table public.push_queue (
  id bigint generated always as identity not null,
  uid uuid default auth.uid() not null,
  fire_at timestamp with time zone not null,
  title text not null,
  body text default ''::text not null,
  url text default '/#/calendar'::text not null,
  dedupe_key text not null,
  event_id bigint,
  status text default 'pending'::text not null,
  attempts smallint default 0 not null,
  last_error text,
  sent_at timestamp with time zone,
  created_at timestamp with time zone default now() not null
);

-- table: push_subscriptions
create table public.push_subscriptions (
  id bigint generated always as identity not null,
  uid uuid default auth.uid() not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  ua text,
  label text,
  created_at timestamp with time zone default now() not null,
  last_seen_at timestamp with time zone default now() not null
);

-- table: quick_todo_lists
create table public.quick_todo_lists (
  id bigint generated always as identity not null,
  owner_uid uuid default auth.uid() not null,
  name text not null,
  sort_order double precision default (EXTRACT(epoch FROM now()))::double precision not null,
  created_at timestamp with time zone default now() not null
);

-- table: quick_todos
create table public.quick_todos (
  id bigint generated always as identity not null,
  owner_uid uuid default auth.uid() not null,
  title text not null,
  done_at timestamp with time zone,
  work_num bigint,
  event_id bigint,
  created_at timestamp with time zone default now() not null,
  sort_order double precision default (- (EXTRACT(epoch FROM now()))::double precision) not null,
  list_id bigint,
  parent_id bigint,
  notes text,
  due_date date,
  due_time time without time zone,
  starred_at timestamp with time zone
);

-- table: recurring_notices
create table public.recurring_notices (
  id bigint generated always as identity not null,
  message text not null,
  day_from smallint not null,
  day_to smallint not null,
  notice_num bigint,
  enabled boolean default true not null,
  author text default COALESCE(my_name(), ''::text) not null,
  author_uid uuid default auth.uid(),
  created_at timestamp with time zone default now() not null,
  cycle text default 'monthly'::text not null,
  recipient_uids uuid[],
  scope text default 'team'::text not null,
  owner_uid uuid
);

-- table: resources
create table public.resources (
  num bigint generated always as identity not null,
  cat text default ''::text not null,
  title text default ''::text not null,
  url text default ''::text not null,
  note text default ''::text not null,
  author text default ''::text not null,
  created_at timestamp with time zone default now() not null,
  attachments jsonb default '[]'::jsonb not null
);

-- table: schedules
create table public.schedules (
  id bigint generated by default as identity not null,
  seq text default ''::text not null,
  code text default ''::text not null,
  name text default ''::text not null,
  mgr text default ''::text not null,
  status text default ''::text not null,
  start text default ''::text not null,
  stage_pre text default ''::text not null,
  stage_bid text default ''::text not null,
  stage_eval text default ''::text not null,
  stage_nego text default ''::text not null,
  stage_make text default ''::text not null,
  stage_install text default ''::text not null,
  duration text default ''::text not null,
  cat text default ''::text not null,
  method text default ''::text not null,
  price numeric default 0 not null,
  created_at timestamp with time zone default now() not null
);

-- table: trip_personal
create table public.trip_personal (
  uid uuid default auth.uid() not null,
  token text not null,
  k text not null,
  v jsonb not null,
  updated_at timestamp with time zone default now() not null
);

-- table: trip_share_fails
create table public.trip_share_fails (
  event_id bigint not null,
  who text not null,
  fails integer default 0 not null,
  locked_until timestamp with time zone,
  updated_at timestamp with time zone default now() not null
);

-- table: trip_shares
create table public.trip_shares (
  event_id bigint not null,
  token text default translate(encode(gen_random_bytes(24), 'base64'::text), '+/'::text, '-_'::text) not null,
  enabled boolean default true not null,
  created_by text default my_name() not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  pin_fails integer default 0 not null,
  pin text,
  pin_locked_until timestamp with time zone
);

-- table: user_settings
create table public.user_settings (
  user_name text not null,
  settings jsonb default '{}'::jsonb not null,
  updated_at timestamp with time zone default now() not null
);

-- table: work_assignees
create table public.work_assignees (
  work_num bigint not null,
  profile_id uuid not null
);

-- table: work_class_feedback
create table public.work_class_feedback (
  id bigint default nextval('work_class_feedback_id_seq'::regclass) not null,
  work_num bigint,
  kind text not null,
  target_id bigint not null,
  action text not null,
  suggested boolean default false not null,
  context text default ''::text not null,
  source text default 'card'::text not null,
  by_name text default ''::text not null,
  by_uid uuid default auth.uid(),
  created_at timestamp with time zone default now() not null
);

-- table: work_comments
create table public.work_comments (
  id bigint generated by default as identity not null,
  num bigint not null,
  author text default my_name() not null,
  author_uid uuid default auth.uid() not null,
  content text not null,
  created_at timestamp with time zone default now() not null,
  parent_id bigint,
  deleted boolean default false not null
);

-- table: work_equipments
create table public.work_equipments (
  work_num bigint not null,
  equipment_id bigint not null,
  created_by uuid default auth.uid(),
  created_at timestamp with time zone default now() not null
);

-- table: work_events
create table public.work_events (
  work_num bigint not null,
  event_id bigint not null,
  created_by uuid default auth.uid(),
  created_at timestamp with time zone default now() not null
);

-- table: work_history
create table public.work_history (
  id bigint generated always as identity not null,
  num bigint not null,
  field text not null,
  prev text default ''::text not null,
  next text default ''::text not null,
  author text default ''::text not null,
  at timestamp with time zone default now() not null
);

-- table: work_link_log
create table public.work_link_log (
  id bigint generated always as identity not null,
  work_num bigint not null,
  target_type text not null,
  target_id bigint not null,
  action text not null,
  actor uuid,
  actor_name text default ''::text not null,
  at timestamp with time zone default now() not null
);

-- table: work_mentions
create table public.work_mentions (
  id bigint generated always as identity not null,
  work_num bigint not null,
  person text not null,
  line text default ''::text not null,
  by_name text default ''::text not null,
  by_uid uuid default auth.uid(),
  created_at timestamp with time zone default now() not null
);

-- table: work_name_aliases
create table public.work_name_aliases (
  kind text not null,
  alias text not null,
  canonical text not null,
  note text default ''::text not null,
  created_at timestamp with time zone default now() not null,
  created_by text default ''::text not null
);

-- table: work_relations
create table public.work_relations (
  a_num bigint not null,
  b_num bigint not null,
  created_by uuid default auth.uid(),
  created_at timestamp with time zone default now() not null
);

-- table: work_subtasks
create table public.work_subtasks (
  id bigint generated always as identity not null,
  num bigint,
  owner_uid uuid default auth.uid() not null,
  title text default ''::text not null,
  content text default ''::text not null,
  priority text default 'mid'::text not null,
  effort text default 'mid'::text not null,
  status text default 'todo'::text not null,
  due text default ''::text not null,
  sort_order numeric default 0 not null,
  done_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- table: work_tag_aliases
create table public.work_tag_aliases (
  alias text not null,
  tag_id bigint not null,
  created_at timestamp with time zone default now() not null,
  created_by text default ''::text not null
);

-- table: work_tag_links
create table public.work_tag_links (
  work_num bigint not null,
  tag_id bigint not null,
  source text default 'user'::text not null,
  created_at timestamp with time zone default now() not null,
  created_by text default ''::text not null
);

-- table: work_tags
create table public.work_tags (
  id bigint generated always as identity not null,
  name text not null,
  tone text,
  sort_order integer default 100 not null,
  archived_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  created_by text default ''::text not null,
  kind text
);

-- table: works
create table public.works (
  num bigint generated by default as identity not null,
  cat text default ''::text not null,
  task text default ''::text not null,
  dept text default ''::text not null,
  mat text default ''::text not null,
  start text default ''::text not null,
  plan text default ''::text not null,
  plan_time text default ''::text not null,
  loc text default ''::text not null,
  mgr text default ''::text not null,
  status text default '진행중'::text not null,
  end_date text default ''::text not null,
  link text default ''::text not null,
  remind boolean default false not null,
  chief boolean default false not null,
  sort_order numeric,
  content_fmt text default ''::text not null,
  deleted_at text default ''::text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  attachments jsonb default '[]'::jsonb not null,
  is_private boolean default false not null,
  owner_uid uuid default auth.uid(),
  private_origin boolean default false not null,
  author text default COALESCE(my_name(), ''::text) not null,
  progress text,
  waiting_on text,
  waiting_since date,
  last_contact_at date,
  remind_at date,
  is_team boolean default false not null,
  project_id bigint,
  track_id bigint,
  milestone_id bigint,
  priority smallint default 0 not null,
  health text
);

-- constraint: angel_chats.angel_chats_pkey
alter table public.angel_chats add constraint angel_chats_pkey PRIMARY KEY (id);

-- constraint: angel_chats.angel_chats_who_check
alter table public.angel_chats add constraint angel_chats_who_check CHECK ((who = ANY (ARRAY['user'::text, 'bot'::text])));

-- constraint: angel_drafts.angel_drafts_pkey
alter table public.angel_drafts add constraint angel_drafts_pkey PRIMARY KEY (uid);

-- constraint: api_usage.api_usage_pkey
alter table public.api_usage add constraint api_usage_pkey PRIMARY KEY (id);

-- constraint: backup_work_tags_v2_20261101.backup_work_tags_v2_20261101_pkey
alter table public.backup_work_tags_v2_20261101 add constraint backup_work_tags_v2_20261101_pkey PRIMARY KEY (k);

-- constraint: calendar_del_log.calendar_del_log_pkey
alter table public.calendar_del_log add constraint calendar_del_log_pkey PRIMARY KEY (id);

-- constraint: calendar_events.calendar_events_pkey
alter table public.calendar_events add constraint calendar_events_pkey PRIMARY KEY (id);

-- constraint: calendar_events.calendar_events_repeat_check
alter table public.calendar_events add constraint calendar_events_repeat_check CHECK ((repeat = ANY (ARRAY['none'::text, 'daily'::text, 'weekly'::text, 'monthly'::text])));

-- constraint: calendar_sync_config.calendar_sync_config_pkey
alter table public.calendar_sync_config add constraint calendar_sync_config_pkey PRIMARY KEY (k);

-- constraint: demo_chat.demo_chat_pkey
alter table public.demo_chat add constraint demo_chat_pkey PRIMARY KEY (id);

-- constraint: demo_chat.demo_chat_width_chk
alter table public.demo_chat add constraint demo_chat_width_chk CHECK ((((width >= 1) AND (width <= 3)) OR ((width >= 1050) AND (width <= 1100)) OR ((width >= 2050) AND (width <= 2100))));

-- constraint: demo_metric_def_history.demo_metric_def_history_action_check
alter table public.demo_metric_def_history add constraint demo_metric_def_history_action_check CHECK ((action = ANY (ARRAY['create'::text, 'update'::text, 'deactivate'::text, 'reactivate'::text])));

-- constraint: demo_metric_def_history.demo_metric_def_history_pkey
alter table public.demo_metric_def_history add constraint demo_metric_def_history_pkey PRIMARY KEY (id);

-- constraint: demo_metric_defs.demo_metric_defs_direction_check
alter table public.demo_metric_defs add constraint demo_metric_defs_direction_check CHECK ((direction = ANY (ARRAY['higher'::text, 'lower'::text, 'none'::text])));

-- constraint: demo_metric_defs.demo_metric_defs_equipment_metric_key_key
alter table public.demo_metric_defs add constraint demo_metric_defs_equipment_metric_key_key UNIQUE (equipment, metric_key);

-- constraint: demo_metric_defs.demo_metric_defs_pkey
alter table public.demo_metric_defs add constraint demo_metric_defs_pkey PRIMARY KEY (id);

-- constraint: demo_results.demo_results_pkey
alter table public.demo_results add constraint demo_results_pkey PRIMARY KEY (id);

-- constraint: demo_results.demo_results_visit_model_key
alter table public.demo_results add constraint demo_results_visit_model_key UNIQUE (visit_id, model);

-- constraint: demo_value_history.demo_value_history_pkey
alter table public.demo_value_history add constraint demo_value_history_pkey PRIMARY KEY (id);

-- constraint: demo_visits.demo_visits_equipment_maker_round_key
alter table public.demo_visits add constraint demo_visits_equipment_maker_round_key UNIQUE (equipment, maker, round);

-- constraint: demo_visits.demo_visits_pkey
alter table public.demo_visits add constraint demo_visits_pkey PRIMARY KEY (id);

-- constraint: equipment_history.equipment_history_pkey
alter table public.equipment_history add constraint equipment_history_pkey PRIMARY KEY (id);

-- constraint: equipments.equipments_pkey
alter table public.equipments add constraint equipments_pkey PRIMARY KEY (id);

-- constraint: equipments.equipments_stage_check
alter table public.equipments add constraint equipments_stage_check CHECK ((stage = ANY (ARRAY['review'::text, 'quote'::text, 'demo'::text, 'spec'::text, 'pre'::text, 'bid'::text, 'eval'::text, 'nego'::text, 'make'::text, 'install'::text])));

-- constraint: event_attendees.event_attendees_event_id_name_key
alter table public.event_attendees add constraint event_attendees_event_id_name_key UNIQUE (event_id, name);

-- constraint: event_attendees.event_attendees_pkey
alter table public.event_attendees add constraint event_attendees_pkey PRIMARY KEY (id);

-- constraint: event_equipments.event_equipments_pkey
alter table public.event_equipments add constraint event_equipments_pkey PRIMARY KEY (event_id, equipment_id);

-- constraint: event_submissions.event_submissions_pkey
alter table public.event_submissions add constraint event_submissions_pkey PRIMARY KEY (id);

-- constraint: event_timetables.event_timetables_pkey
alter table public.event_timetables add constraint event_timetables_pkey PRIMARY KEY (id);

-- constraint: improve_locations.improve_locations_pkey
alter table public.improve_locations add constraint improve_locations_pkey PRIMARY KEY (name);

-- constraint: improvement_drafts.improvement_drafts_pkey
alter table public.improvement_drafts add constraint improvement_drafts_pkey PRIMARY KEY (id);

-- constraint: improvement_replies.improvement_replies_pkey
alter table public.improvement_replies add constraint improvement_replies_pkey PRIMARY KEY (id);

-- constraint: improvements.improvements_pkey
alter table public.improvements add constraint improvements_pkey PRIMARY KEY (num);

-- constraint: meeting_memos.meeting_memos_num_meeting_date_key
alter table public.meeting_memos add constraint meeting_memos_num_meeting_date_key UNIQUE (num, meeting_date);

-- constraint: meeting_memos.meeting_memos_pkey
alter table public.meeting_memos add constraint meeting_memos_pkey PRIMARY KEY (id);

-- constraint: milestone_dependency.milestone_dependency_check
alter table public.milestone_dependency add constraint milestone_dependency_check CHECK ((from_milestone_id <> to_milestone_id));

-- constraint: milestone_dependency.milestone_dependency_pkey
alter table public.milestone_dependency add constraint milestone_dependency_pkey PRIMARY KEY (from_milestone_id, to_milestone_id);

-- constraint: milestones.milestones_pkey
alter table public.milestones add constraint milestones_pkey PRIMARY KEY (id);

-- constraint: milestones.milestones_status_check
alter table public.milestones add constraint milestones_status_check CHECK ((status = ANY (ARRAY['예정'::text, '진행중'::text, '완료'::text, '보류'::text])));

-- constraint: notices.notices_pkey
alter table public.notices add constraint notices_pkey PRIMARY KEY (num);

-- constraint: page_drawings.page_drawings_pkey
alter table public.page_drawings add constraint page_drawings_pkey PRIMARY KEY (id);

-- constraint: page_note_replies.page_note_replies_pkey
alter table public.page_note_replies add constraint page_note_replies_pkey PRIMARY KEY (id);

-- constraint: page_notes.page_notes_pkey
alter table public.page_notes add constraint page_notes_pkey PRIMARY KEY (id);

-- constraint: place_favorites.place_favorites_name_check
alter table public.place_favorites add constraint place_favorites_name_check CHECK ((length(btrim(name)) > 0));

-- constraint: place_favorites.place_favorites_pkey
alter table public.place_favorites add constraint place_favorites_pkey PRIMARY KEY (id);

-- constraint: profiles.profiles_auth_user_id_key
alter table public.profiles add constraint profiles_auth_user_id_key UNIQUE (auth_user_id);

-- constraint: profiles.profiles_emp_no_key
alter table public.profiles add constraint profiles_emp_no_key UNIQUE (emp_no);

-- constraint: profiles.profiles_name_key
alter table public.profiles add constraint profiles_name_key UNIQUE (name);

-- constraint: profiles.profiles_pkey
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);

-- constraint: profiles.profiles_position_check
alter table public.profiles add constraint profiles_position_check CHECK (("position" = ANY (ARRAY['director'::text, 'lead'::text, 'member'::text])));

-- constraint: profiles.profiles_role_check
alter table public.profiles add constraint profiles_role_check CHECK ((role = ANY (ARRAY['guest'::text, 'associate'::text, 'member'::text, 'admin'::text, 'pending'::text])));

-- constraint: profiles.profiles_status_check
alter table public.profiles add constraint profiles_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text])));

-- constraint: project_milestones.project_milestones_check
alter table public.project_milestones add constraint project_milestones_check CHECK (((reached_at IS NULL) OR reached));

-- constraint: project_milestones.project_milestones_check1
alter table public.project_milestones add constraint project_milestones_check1 CHECK (((target_date IS NULL) = (target_precision IS NULL)));

-- constraint: project_milestones.project_milestones_pkey
alter table public.project_milestones add constraint project_milestones_pkey PRIMARY KEY (id);

-- constraint: project_milestones.project_milestones_target_precision_check
alter table public.project_milestones add constraint project_milestones_target_precision_check CHECK ((target_precision = ANY (ARRAY['day'::text, 'month'::text])));

-- constraint: project_tracks.project_tracks_pkey
alter table public.project_tracks add constraint project_tracks_pkey PRIMARY KEY (id);

-- constraint: project_tracks.project_tracks_project_id_name_key
alter table public.project_tracks add constraint project_tracks_project_id_name_key UNIQUE (project_id, name);

-- constraint: projects.projects_name_key
alter table public.projects add constraint projects_name_key UNIQUE (name);

-- constraint: projects.projects_pkey
alter table public.projects add constraint projects_pkey PRIMARY KEY (id);

-- constraint: push_queue.push_queue_pkey
alter table public.push_queue add constraint push_queue_pkey PRIMARY KEY (id);

-- constraint: push_queue.push_queue_status_check
alter table public.push_queue add constraint push_queue_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text])));

-- constraint: push_queue.push_queue_uid_dedupe_key_key
alter table public.push_queue add constraint push_queue_uid_dedupe_key_key UNIQUE (uid, dedupe_key);

-- constraint: push_subscriptions.push_subscriptions_endpoint_key
alter table public.push_subscriptions add constraint push_subscriptions_endpoint_key UNIQUE (endpoint);

-- constraint: push_subscriptions.push_subscriptions_pkey
alter table public.push_subscriptions add constraint push_subscriptions_pkey PRIMARY KEY (id);

-- constraint: quick_todo_lists.quick_todo_lists_name_check
alter table public.quick_todo_lists add constraint quick_todo_lists_name_check CHECK ((length(btrim(name)) > 0));

-- constraint: quick_todo_lists.quick_todo_lists_pkey
alter table public.quick_todo_lists add constraint quick_todo_lists_pkey PRIMARY KEY (id);

-- constraint: quick_todos.quick_todos_pkey
alter table public.quick_todos add constraint quick_todos_pkey PRIMARY KEY (id);

-- constraint: quick_todos.quick_todos_title_check
alter table public.quick_todos add constraint quick_todos_title_check CHECK ((length(btrim(title)) > 0));

-- constraint: recurring_notices.recurring_notice_personal_owner
alter table public.recurring_notices add constraint recurring_notice_personal_owner CHECK ((((scope = 'team'::text) AND (owner_uid IS NULL)) OR ((scope = 'personal'::text) AND (owner_uid IS NOT NULL) AND (recipient_uids IS NOT NULL) AND (recipient_uids = ARRAY[owner_uid]))));

-- constraint: recurring_notices.recurring_notice_recipients_nonempty
alter table public.recurring_notices add constraint recurring_notice_recipients_nonempty CHECK (((recipient_uids IS NULL) OR ((cardinality(recipient_uids) > 0) AND (array_position(recipient_uids, NULL::uuid) IS NULL))));

-- constraint: recurring_notices.recurring_notices_cycle_check
alter table public.recurring_notices add constraint recurring_notices_cycle_check CHECK ((cycle = 'monthly'::text));

-- constraint: recurring_notices.recurring_notices_day_from_check
alter table public.recurring_notices add constraint recurring_notices_day_from_check CHECK (((day_from >= 1) AND (day_from <= 31)));

-- constraint: recurring_notices.recurring_notices_day_order
alter table public.recurring_notices add constraint recurring_notices_day_order CHECK ((day_from <= day_to));

-- constraint: recurring_notices.recurring_notices_day_to_check
alter table public.recurring_notices add constraint recurring_notices_day_to_check CHECK (((day_to >= 1) AND (day_to <= 31)));

-- constraint: recurring_notices.recurring_notices_message_check
alter table public.recurring_notices add constraint recurring_notices_message_check CHECK (((char_length(btrim(message)) >= 1) AND (char_length(btrim(message)) <= 200)));

-- constraint: recurring_notices.recurring_notices_pkey
alter table public.recurring_notices add constraint recurring_notices_pkey PRIMARY KEY (id);

-- constraint: recurring_notices.recurring_notices_scope_check
alter table public.recurring_notices add constraint recurring_notices_scope_check CHECK ((scope = ANY (ARRAY['team'::text, 'personal'::text])));

-- constraint: resources.resources_pkey
alter table public.resources add constraint resources_pkey PRIMARY KEY (num);

-- constraint: schedules.schedules_pkey
alter table public.schedules add constraint schedules_pkey PRIMARY KEY (id);

-- constraint: trip_personal.trip_personal_k_check
alter table public.trip_personal add constraint trip_personal_k_check CHECK ((k ~ '^(note:\\d{4}-\\d{2}-\\d{2}|mine:\\d{4}-\\d{2}-\\d{2}|myprep|checks|prephide|guideedit|guideorder|memo|myseat)$'::text));

-- constraint: trip_personal.trip_personal_pkey
alter table public.trip_personal add constraint trip_personal_pkey PRIMARY KEY (uid, token, k);

-- constraint: trip_personal.trip_personal_token_check
alter table public.trip_personal add constraint trip_personal_token_check CHECK ((char_length(token) <= 64));

-- constraint: trip_personal.trip_personal_v_check
alter table public.trip_personal add constraint trip_personal_v_check CHECK ((pg_column_size(v) <= 65536));

-- constraint: trip_share_fails.trip_share_fails_pkey
alter table public.trip_share_fails add constraint trip_share_fails_pkey PRIMARY KEY (event_id, who);

-- constraint: trip_shares.trip_shares_pkey
alter table public.trip_shares add constraint trip_shares_pkey PRIMARY KEY (event_id);

-- constraint: trip_shares.trip_shares_token_key
alter table public.trip_shares add constraint trip_shares_token_key UNIQUE (token);

-- constraint: user_settings.user_settings_pkey
alter table public.user_settings add constraint user_settings_pkey PRIMARY KEY (user_name);

-- constraint: work_assignees.work_assignees_pkey
alter table public.work_assignees add constraint work_assignees_pkey PRIMARY KEY (work_num, profile_id);

-- constraint: work_class_feedback.work_class_feedback_action_check
alter table public.work_class_feedback add constraint work_class_feedback_action_check CHECK ((action = ANY (ARRAY['accept'::text, 'pick'::text, 'reject'::text, 'remove'::text, 'create'::text])));

-- constraint: work_class_feedback.work_class_feedback_kind_check
alter table public.work_class_feedback add constraint work_class_feedback_kind_check CHECK ((kind = ANY (ARRAY['track'::text, 'tag'::text])));

-- constraint: work_class_feedback.work_class_feedback_pkey
alter table public.work_class_feedback add constraint work_class_feedback_pkey PRIMARY KEY (id);

-- constraint: work_class_feedback.work_class_feedback_source_check
alter table public.work_class_feedback add constraint work_class_feedback_source_check CHECK ((source = ANY (ARRAY['card'::text, 'angel'::text, 'seed'::text, 'review'::text])));

-- constraint: work_comments.work_comments_pkey
alter table public.work_comments add constraint work_comments_pkey PRIMARY KEY (id);

-- constraint: work_equipments.work_equipments_pkey
alter table public.work_equipments add constraint work_equipments_pkey PRIMARY KEY (work_num, equipment_id);

-- constraint: work_events.work_events_pkey
alter table public.work_events add constraint work_events_pkey PRIMARY KEY (work_num, event_id);

-- constraint: work_history.work_history_pkey
alter table public.work_history add constraint work_history_pkey PRIMARY KEY (id);

-- constraint: work_link_log.work_link_log_action_check
alter table public.work_link_log add constraint work_link_log_action_check CHECK ((action = ANY (ARRAY['link'::text, 'unlink'::text, 'target_deleted'::text])));

-- constraint: work_link_log.work_link_log_pkey
alter table public.work_link_log add constraint work_link_log_pkey PRIMARY KEY (id);

-- constraint: work_link_log.work_link_log_target_type_check
alter table public.work_link_log add constraint work_link_log_target_type_check CHECK ((target_type = ANY (ARRAY['event'::text, 'equipment'::text, 'work'::text])));

-- constraint: work_mentions.work_mentions_pkey
alter table public.work_mentions add constraint work_mentions_pkey PRIMARY KEY (id);

-- constraint: work_name_aliases.work_name_aliases_check
alter table public.work_name_aliases add constraint work_name_aliases_check CHECK (((btrim(alias) <> ''::text) AND (btrim(canonical) <> ''::text) AND (lower(alias) <> lower(canonical))));

-- constraint: work_name_aliases.work_name_aliases_kind_check
alter table public.work_name_aliases add constraint work_name_aliases_kind_check CHECK ((kind = ANY (ARRAY['person'::text, 'dept'::text])));

-- constraint: work_name_aliases.work_name_aliases_pkey
alter table public.work_name_aliases add constraint work_name_aliases_pkey PRIMARY KEY (kind, alias);

-- constraint: work_relations.work_relations_check
alter table public.work_relations add constraint work_relations_check CHECK ((a_num < b_num));

-- constraint: work_relations.work_relations_pkey
alter table public.work_relations add constraint work_relations_pkey PRIMARY KEY (a_num, b_num);

-- constraint: work_subtasks.work_subtasks_effort_check
alter table public.work_subtasks add constraint work_subtasks_effort_check CHECK ((effort = ANY (ARRAY['high'::text, 'mid'::text, 'low'::text])));

-- constraint: work_subtasks.work_subtasks_pkey
alter table public.work_subtasks add constraint work_subtasks_pkey PRIMARY KEY (id);

-- constraint: work_subtasks.work_subtasks_priority_check
alter table public.work_subtasks add constraint work_subtasks_priority_check CHECK ((priority = ANY (ARRAY['urgent'::text, 'high'::text, 'mid'::text, 'low'::text])));

-- constraint: work_subtasks.work_subtasks_status_check
alter table public.work_subtasks add constraint work_subtasks_status_check CHECK ((status = ANY (ARRAY['todo'::text, 'doing'::text, 'done'::text])));

-- constraint: work_tag_aliases.work_tag_aliases_pkey
alter table public.work_tag_aliases add constraint work_tag_aliases_pkey PRIMARY KEY (alias);

-- constraint: work_tag_links.work_tag_links_pkey
alter table public.work_tag_links add constraint work_tag_links_pkey PRIMARY KEY (work_num, tag_id);

-- constraint: work_tag_links.work_tag_links_source_chk
alter table public.work_tag_links add constraint work_tag_links_source_chk CHECK ((source = ANY (ARRAY['user'::text, 'auto'::text, 'import'::text, 'review'::text])));

-- constraint: work_tags.work_tags_kind_check
alter table public.work_tags add constraint work_tags_kind_check CHECK ((kind = ANY (ARRAY['who'::text, 'what'::text, 'how'::text, 'output'::text])));

-- constraint: work_tags.work_tags_name_key
alter table public.work_tags add constraint work_tags_name_key UNIQUE (name);

-- constraint: work_tags.work_tags_pkey
alter table public.work_tags add constraint work_tags_pkey PRIMARY KEY (id);

-- constraint: works.works_health_values
alter table public.works add constraint works_health_values CHECK ((health = ANY (ARRAY['on_track'::text, 'at_risk'::text, 'off_track'::text])));

-- constraint: works.works_pkey
alter table public.works add constraint works_pkey PRIMARY KEY (num);

-- constraint: works.works_priority_range
alter table public.works add constraint works_priority_range CHECK (((priority >= 0) AND (priority <= 4)));

-- constraint: works.works_progress_check
alter table public.works add constraint works_progress_check CHECK ((progress = ANY (ARRAY['planned'::text, 'in_progress'::text, 'done'::text])));

-- constraint: works.works_waiting_on_check
alter table public.works add constraint works_waiting_on_check CHECK ((waiting_on = ANY (ARRAY['vendor'::text, 'parent_org'::text, 'other_dept'::text, 'internal'::text])));

-- constraint: angel_chats.angel_chats_uid_fkey
alter table public.angel_chats add constraint angel_chats_uid_fkey FOREIGN KEY (uid) REFERENCES auth.users(id) ON DELETE CASCADE;

-- constraint: angel_drafts.angel_drafts_uid_fkey
alter table public.angel_drafts add constraint angel_drafts_uid_fkey FOREIGN KEY (uid) REFERENCES auth.users(id) ON DELETE CASCADE;

-- constraint: demo_results.demo_results_visit_id_fkey
alter table public.demo_results add constraint demo_results_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES demo_visits(id) ON DELETE CASCADE;

-- constraint: event_equipments.event_equipments_equipment_id_fkey
alter table public.event_equipments add constraint event_equipments_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES equipments(id) ON DELETE CASCADE;

-- constraint: event_equipments.event_equipments_event_id_fkey
alter table public.event_equipments add constraint event_equipments_event_id_fkey FOREIGN KEY (event_id) REFERENCES calendar_events(id) ON DELETE CASCADE;

-- constraint: meeting_memos.meeting_memos_num_fkey
alter table public.meeting_memos add constraint meeting_memos_num_fkey FOREIGN KEY (num) REFERENCES works(num) ON DELETE CASCADE;

-- constraint: milestone_dependency.milestone_dependency_from_milestone_id_fke
alter table public.milestone_dependency add constraint milestone_dependency_from_milestone_id_fkey FOREIGN KEY (from_milestone_id) REFERENCES project_milestones(id) ON DELETE CASCADE;

-- constraint: milestone_dependency.milestone_dependency_to_milestone_id_fkey
alter table public.milestone_dependency add constraint milestone_dependency_to_milestone_id_fkey FOREIGN KEY (to_milestone_id) REFERENCES project_milestones(id) ON DELETE CASCADE;

-- constraint: page_note_replies.page_note_replies_note_id_fkey
alter table public.page_note_replies add constraint page_note_replies_note_id_fkey FOREIGN KEY (note_id) REFERENCES page_notes(id) ON DELETE CASCADE;

-- constraint: page_notes.page_notes_drawing_id_fkey
alter table public.page_notes add constraint page_notes_drawing_id_fkey FOREIGN KEY (drawing_id) REFERENCES page_drawings(id) ON DELETE SET NULL;

-- constraint: place_favorites.place_favorites_created_by_fkey
alter table public.place_favorites add constraint place_favorites_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- constraint: project_milestones.project_milestones_track_id_fkey
alter table public.project_milestones add constraint project_milestones_track_id_fkey FOREIGN KEY (track_id) REFERENCES project_tracks(id) ON DELETE RESTRICT;

-- constraint: project_tracks.project_tracks_project_id_fkey
alter table public.project_tracks add constraint project_tracks_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- constraint: push_queue.push_queue_uid_fkey
alter table public.push_queue add constraint push_queue_uid_fkey FOREIGN KEY (uid) REFERENCES auth.users(id) ON DELETE CASCADE;

-- constraint: push_subscriptions.push_subscriptions_uid_fkey
alter table public.push_subscriptions add constraint push_subscriptions_uid_fkey FOREIGN KEY (uid) REFERENCES auth.users(id) ON DELETE CASCADE;

-- constraint: quick_todo_lists.quick_todo_lists_owner_uid_fkey
alter table public.quick_todo_lists add constraint quick_todo_lists_owner_uid_fkey FOREIGN KEY (owner_uid) REFERENCES auth.users(id) ON DELETE CASCADE;

-- constraint: quick_todos.quick_todos_event_id_fkey
alter table public.quick_todos add constraint quick_todos_event_id_fkey FOREIGN KEY (event_id) REFERENCES calendar_events(id) ON DELETE SET NULL;

-- constraint: quick_todos.quick_todos_list_id_fkey
alter table public.quick_todos add constraint quick_todos_list_id_fkey FOREIGN KEY (list_id) REFERENCES quick_todo_lists(id) ON DELETE CASCADE;

-- constraint: quick_todos.quick_todos_owner_uid_fkey
alter table public.quick_todos add constraint quick_todos_owner_uid_fkey FOREIGN KEY (owner_uid) REFERENCES auth.users(id) ON DELETE CASCADE;

-- constraint: quick_todos.quick_todos_parent_id_fkey
alter table public.quick_todos add constraint quick_todos_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES quick_todos(id) ON DELETE CASCADE;

-- constraint: quick_todos.quick_todos_work_num_fkey
alter table public.quick_todos add constraint quick_todos_work_num_fkey FOREIGN KEY (work_num) REFERENCES works(num) ON DELETE SET NULL;

-- constraint: recurring_notices.recurring_notices_notice_num_fkey
alter table public.recurring_notices add constraint recurring_notices_notice_num_fkey FOREIGN KEY (notice_num) REFERENCES notices(num) ON DELETE SET NULL;

-- constraint: recurring_notices.recurring_notices_owner_uid_fkey
alter table public.recurring_notices add constraint recurring_notices_owner_uid_fkey FOREIGN KEY (owner_uid) REFERENCES auth.users(id) ON DELETE CASCADE;

-- constraint: trip_personal.trip_personal_uid_fkey
alter table public.trip_personal add constraint trip_personal_uid_fkey FOREIGN KEY (uid) REFERENCES auth.users(id) ON DELETE CASCADE;

-- constraint: trip_share_fails.trip_share_fails_event_id_fkey
alter table public.trip_share_fails add constraint trip_share_fails_event_id_fkey FOREIGN KEY (event_id) REFERENCES trip_shares(event_id) ON DELETE CASCADE;

-- constraint: trip_shares.trip_shares_event_id_fkey
alter table public.trip_shares add constraint trip_shares_event_id_fkey FOREIGN KEY (event_id) REFERENCES calendar_events(id) ON DELETE CASCADE;

-- constraint: work_assignees.work_assignees_profile_id_fkey
alter table public.work_assignees add constraint work_assignees_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE RESTRICT;

-- constraint: work_assignees.work_assignees_work_num_fkey
alter table public.work_assignees add constraint work_assignees_work_num_fkey FOREIGN KEY (work_num) REFERENCES works(num) ON DELETE CASCADE;

-- constraint: work_class_feedback.work_class_feedback_work_num_fkey
alter table public.work_class_feedback add constraint work_class_feedback_work_num_fkey FOREIGN KEY (work_num) REFERENCES works(num) ON DELETE CASCADE;

-- constraint: work_comments.work_comments_num_fkey
alter table public.work_comments add constraint work_comments_num_fkey FOREIGN KEY (num) REFERENCES works(num) ON DELETE CASCADE;

-- constraint: work_comments.work_comments_parent_id_fkey
alter table public.work_comments add constraint work_comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES work_comments(id) ON DELETE CASCADE;

-- constraint: work_equipments.work_equipments_equipment_id_fkey
alter table public.work_equipments add constraint work_equipments_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES equipments(id) ON DELETE CASCADE;

-- constraint: work_equipments.work_equipments_work_num_fkey
alter table public.work_equipments add constraint work_equipments_work_num_fkey FOREIGN KEY (work_num) REFERENCES works(num) ON DELETE CASCADE;

-- constraint: work_events.work_events_event_id_fkey
alter table public.work_events add constraint work_events_event_id_fkey FOREIGN KEY (event_id) REFERENCES calendar_events(id) ON DELETE CASCADE;

-- constraint: work_events.work_events_work_num_fkey
alter table public.work_events add constraint work_events_work_num_fkey FOREIGN KEY (work_num) REFERENCES works(num) ON DELETE CASCADE;

-- constraint: work_link_log.work_link_log_work_num_fkey
alter table public.work_link_log add constraint work_link_log_work_num_fkey FOREIGN KEY (work_num) REFERENCES works(num) ON DELETE CASCADE;

-- constraint: work_mentions.work_mentions_work_num_fkey
alter table public.work_mentions add constraint work_mentions_work_num_fkey FOREIGN KEY (work_num) REFERENCES works(num) ON DELETE CASCADE;

-- constraint: work_relations.work_relations_a_num_fkey
alter table public.work_relations add constraint work_relations_a_num_fkey FOREIGN KEY (a_num) REFERENCES works(num) ON DELETE CASCADE;

-- constraint: work_relations.work_relations_b_num_fkey
alter table public.work_relations add constraint work_relations_b_num_fkey FOREIGN KEY (b_num) REFERENCES works(num) ON DELETE CASCADE;

-- constraint: work_subtasks.work_subtasks_num_fkey
alter table public.work_subtasks add constraint work_subtasks_num_fkey FOREIGN KEY (num) REFERENCES works(num) ON DELETE CASCADE;

-- constraint: work_tag_aliases.work_tag_aliases_tag_id_fkey
alter table public.work_tag_aliases add constraint work_tag_aliases_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES work_tags(id) ON DELETE CASCADE;

-- constraint: work_tag_links.work_tag_links_tag_id_fkey
alter table public.work_tag_links add constraint work_tag_links_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES work_tags(id) ON DELETE CASCADE;

-- constraint: work_tag_links.work_tag_links_work_num_fkey
alter table public.work_tag_links add constraint work_tag_links_work_num_fkey FOREIGN KEY (work_num) REFERENCES works(num) ON DELETE CASCADE;

-- constraint: works.works_milestone_id_fkey
alter table public.works add constraint works_milestone_id_fkey FOREIGN KEY (milestone_id) REFERENCES project_milestones(id) ON DELETE SET NULL;

-- constraint: works.works_project_id_fkey
alter table public.works add constraint works_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;

-- constraint: works.works_track_id_fkey
alter table public.works add constraint works_track_id_fkey FOREIGN KEY (track_id) REFERENCES project_tracks(id) ON DELETE SET NULL;

-- index: angel_chats_uid_created_idx
CREATE INDEX angel_chats_uid_created_idx ON public.angel_chats USING btree (uid, created_at DESC);

-- index: api_usage_service_at
CREATE INDEX api_usage_service_at ON public.api_usage USING btree (service, at DESC);

-- index: calendar_events_gcal_id_uidx
CREATE UNIQUE INDEX calendar_events_gcal_id_uidx ON public.calendar_events USING btree (gcal_id) WHERE (gcal_id <> ''::text);

-- index: demo_chat_eq_idx
CREATE INDEX demo_chat_eq_idx ON public.demo_chat USING btree (equipment, created_at);

-- index: demo_metric_def_history_eq_idx
CREATE INDEX demo_metric_def_history_eq_idx ON public.demo_metric_def_history USING btree (equipment, changed_at DESC);

-- index: demo_results_eq_idx
CREATE INDEX demo_results_eq_idx ON public.demo_results USING btree (equipment, maker, round);

-- index: demo_results_visit_id_idx
CREATE INDEX demo_results_visit_id_idx ON public.demo_results USING btree (visit_id);

-- index: demo_value_history_eq_idx
CREATE INDEX demo_value_history_eq_idx ON public.demo_value_history USING btree (equipment, changed_at DESC);

-- index: event_equipments_eq_idx
CREATE INDEX event_equipments_eq_idx ON public.event_equipments USING btree (equipment_id);

-- index: event_timetables_event_idx
CREATE INDEX event_timetables_event_idx ON public.event_timetables USING btree (event_id);

-- index: idx_calendar_events_series
CREATE INDEX idx_calendar_events_series ON public.calendar_events USING btree (series_id) WHERE (series_id <> ''::text);

-- index: idx_eqhist_code
CREATE INDEX idx_eqhist_code ON public.equipment_history USING btree (code);

-- index: idx_equipments_code
CREATE INDEX idx_equipments_code ON public.equipments USING btree (code);

-- index: idx_replies_req
CREATE INDEX idx_replies_req ON public.improvement_replies USING btree (req_num);

-- index: idx_schedules_code
CREATE INDEX idx_schedules_code ON public.schedules USING btree (code);

-- index: page_drawings_path_idx
CREATE INDEX page_drawings_path_idx ON public.page_drawings USING btree (path);

-- index: page_note_replies_note_idx
CREATE INDEX page_note_replies_note_idx ON public.page_note_replies USING btree (note_id);

-- index: page_notes_drawing_idx
CREATE INDEX page_notes_drawing_idx ON public.page_notes USING btree (drawing_id);

-- index: page_notes_path_idx
CREATE INDEX page_notes_path_idx ON public.page_notes USING btree (path);

-- index: page_notes_target_idx
CREATE INDEX page_notes_target_idx ON public.page_notes USING btree (target);

-- index: project_tracks_name_noproject_key
CREATE UNIQUE INDEX project_tracks_name_noproject_key ON public.project_tracks USING btree (name) WHERE (project_id IS NULL);

-- index: push_queue_due_idx
CREATE INDEX push_queue_due_idx ON public.push_queue USING btree (fire_at) WHERE (status = 'pending'::text);

-- index: push_queue_uid_event_idx
CREATE INDEX push_queue_uid_event_idx ON public.push_queue USING btree (uid, event_id);

-- index: push_subscriptions_uid_idx
CREATE INDEX push_subscriptions_uid_idx ON public.push_subscriptions USING btree (uid);

-- index: quick_todo_lists_owner_idx
CREATE INDEX quick_todo_lists_owner_idx ON public.quick_todo_lists USING btree (owner_uid, sort_order);

-- index: quick_todos_list_idx
CREATE INDEX quick_todos_list_idx ON public.quick_todos USING btree (list_id);

-- index: quick_todos_owner_idx
CREATE INDEX quick_todos_owner_idx ON public.quick_todos USING btree (owner_uid, created_at DESC);

-- index: quick_todos_parent_idx
CREATE INDEX quick_todos_parent_idx ON public.quick_todos USING btree (parent_id);

-- index: work_assignees_profile_idx
CREATE INDEX work_assignees_profile_idx ON public.work_assignees USING btree (profile_id);

-- index: work_class_feedback_work_idx
CREATE INDEX work_class_feedback_work_idx ON public.work_class_feedback USING btree (work_num);

-- index: work_comments_num_id_idx
CREATE INDEX work_comments_num_id_idx ON public.work_comments USING btree (num, id);

-- index: work_equipments_eq_idx
CREATE INDEX work_equipments_eq_idx ON public.work_equipments USING btree (equipment_id);

-- index: work_events_event_idx
CREATE INDEX work_events_event_idx ON public.work_events USING btree (event_id);

-- index: work_history_num_at_idx
CREATE INDEX work_history_num_at_idx ON public.work_history USING btree (num, at DESC);

-- index: work_link_log_work_idx
CREATE INDEX work_link_log_work_idx ON public.work_link_log USING btree (work_num, at);

-- index: work_mentions_person_at
CREATE INDEX work_mentions_person_at ON public.work_mentions USING btree (person, created_at DESC);

-- index: work_name_aliases_lower
CREATE UNIQUE INDEX work_name_aliases_lower ON public.work_name_aliases USING btree (kind, lower(alias));

-- index: work_relations_b_idx
CREATE INDEX work_relations_b_idx ON public.work_relations USING btree (b_num);

-- index: work_subtasks_owner_num_idx
CREATE INDEX work_subtasks_owner_num_idx ON public.work_subtasks USING btree (owner_uid, num, sort_order, id);

-- index: work_tag_aliases_norm_key
CREATE UNIQUE INDEX work_tag_aliases_norm_key ON public.work_tag_aliases USING btree (work_tag_norm(alias));

-- index: work_tag_aliases_tag_idx
CREATE INDEX work_tag_aliases_tag_idx ON public.work_tag_aliases USING btree (tag_id);

-- index: work_tag_links_tag_idx
CREATE INDEX work_tag_links_tag_idx ON public.work_tag_links USING btree (tag_id);

-- index: work_tags_norm_key
CREATE UNIQUE INDEX work_tags_norm_key ON public.work_tags USING btree (work_tag_norm(name));

-- index: works_milestone_idx
CREATE INDEX works_milestone_idx ON public.works USING btree (milestone_id);

-- index: works_project_idx
CREATE INDEX works_project_idx ON public.works USING btree (project_id);

-- index: works_track_idx
CREATE INDEX works_track_idx ON public.works USING btree (track_id);

-- trigger: calendar_events.calendar_events_del_log
CREATE TRIGGER calendar_events_del_log AFTER DELETE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION calendar_log_delete();

-- trigger: calendar_events.calendar_events_touch
CREATE TRIGGER calendar_events_touch BEFORE UPDATE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION calendar_touch_updated_at();

-- trigger: demo_results.demo_results_drop_empty_visit
CREATE TRIGGER demo_results_drop_empty_visit AFTER DELETE ON public.demo_results FOR EACH ROW EXECUTE FUNCTION demo_results_drop_empty_visit();

-- trigger: demo_results.demo_results_link_visit
CREATE TRIGGER demo_results_link_visit BEFORE INSERT ON public.demo_results FOR EACH ROW EXECUTE FUNCTION demo_results_link_visit();

-- trigger: equipments.equipments_stage_stamp
CREATE TRIGGER equipments_stage_stamp BEFORE UPDATE OF stage ON public.equipments FOR EACH ROW EXECUTE FUNCTION equipments_stage_stamp();

-- trigger: recurring_notices.recurring_notice_check_recipients
CREATE TRIGGER recurring_notice_check_recipients BEFORE INSERT OR UPDATE OF recipient_uids ON public.recurring_notices FOR EACH ROW EXECUTE FUNCTION recurring_notice_check_recipients();

-- trigger: recurring_notices.recurring_notice_clear_deleted_push
CREATE TRIGGER recurring_notice_clear_deleted_push AFTER DELETE ON public.recurring_notices FOR EACH ROW EXECUTE FUNCTION recurring_notice_clear_deleted_push();

-- trigger: recurring_notices.recurring_notice_clear_excluded_push
CREATE TRIGGER recurring_notice_clear_excluded_push AFTER UPDATE OF recipient_uids, enabled ON public.recurring_notices FOR EACH ROW EXECUTE FUNCTION recurring_notice_clear_excluded_push();

-- trigger: recurring_notices.recurring_notice_keep_owner
CREATE TRIGGER recurring_notice_keep_owner BEFORE UPDATE ON public.recurring_notices FOR EACH ROW EXECUTE FUNCTION recurring_notice_keep_owner();

-- trigger: trip_shares.trip_shares_guard
CREATE TRIGGER trip_shares_guard BEFORE INSERT OR UPDATE ON public.trip_shares FOR EACH ROW EXECUTE FUNCTION trip_shares_guard();

-- trigger: trip_shares.trip_shares_pin_reset
CREATE TRIGGER trip_shares_pin_reset AFTER UPDATE ON public.trip_shares FOR EACH ROW EXECUTE FUNCTION trip_shares_pin_reset();

-- trigger: work_equipments.work_equipments_log_trg
CREATE TRIGGER work_equipments_log_trg AFTER INSERT OR DELETE ON public.work_equipments FOR EACH ROW EXECUTE FUNCTION work_equipments_log();

-- trigger: work_events.work_events_log_trg
CREATE TRIGGER work_events_log_trg AFTER INSERT OR DELETE ON public.work_events FOR EACH ROW EXECUTE FUNCTION work_events_log();

-- trigger: work_relations.work_relations_log_trg
CREATE TRIGGER work_relations_log_trg AFTER INSERT OR DELETE ON public.work_relations FOR EACH ROW EXECUTE FUNCTION work_relations_log();

-- trigger: works.works_check_milestone
CREATE TRIGGER works_check_milestone BEFORE INSERT OR UPDATE OF milestone_id, track_id ON public.works FOR EACH ROW EXECUTE FUNCTION works_check_milestone();

-- trigger: works.works_check_track
CREATE TRIGGER works_check_track BEFORE INSERT OR UPDATE OF track_id, project_id ON public.works FOR EACH ROW EXECUTE FUNCTION works_check_track();

-- trigger: works.works_default_start
CREATE TRIGGER works_default_start BEFORE INSERT ON public.works FOR EACH ROW EXECUTE FUNCTION works_default_start();

-- trigger: works.works_guard_private
CREATE TRIGGER works_guard_private BEFORE INSERT OR UPDATE ON public.works FOR EACH ROW EXECUTE FUNCTION works_guard_private();

-- trigger: works.works_log_changes
CREATE TRIGGER works_log_changes AFTER UPDATE ON public.works FOR EACH ROW EXECUTE FUNCTION work_log_changes();

-- trigger: works.works_log_sub_assignees
CREATE TRIGGER works_log_sub_assignees AFTER INSERT OR UPDATE OF content_fmt ON public.works FOR EACH ROW EXECUTE FUNCTION work_log_sub_assignees();

-- trigger: works.works_sync_derived
CREATE TRIGGER works_sync_derived BEFORE INSERT OR UPDATE ON public.works FOR EACH ROW EXECUTE FUNCTION works_sync_derived();

-- trigger: works.works_sync_links
CREATE TRIGGER works_sync_links AFTER INSERT OR UPDATE OF mgr, cat ON public.works FOR EACH ROW EXECUTE FUNCTION works_sync_links();
`,B=Object.assign({"./seed/00-people.sql":un,"./seed/01-helpers.sql":cn,"./seed/10-work.sql":pn,"./seed/20-calendar.sql":mn,"./seed/30-equipment.sql":bn,"./seed/35-equipment-links.sql":hn,"./seed/40-misc.sql":fn,"./seed/50-events.sql":wn,"./seed/99-finish.sql":gn}),rn=Object.keys(B).sort().map(n=>`-- ${n}
${B[n]}`).join(`

`),J=`v1:${ln.length}:${sn.length}:${rn.length}`,dn="angels-booth";let Tn=null;function U(n){return Tn??(Tn=Cn(n))}async function V(){const[{PGlite:n},{pgcrypto:e},{uuid_ossp:t}]=await Promise.all([P(()=>import("./index-gkLmUwxL.js").then(l=>l.i),__vite__mapDeps([0,1,2,3])),P(()=>import("./pgcrypto-DvQ-zBrc.js"),__vite__mapDeps([4,1])),P(()=>import("./uuid_ossp-B-isMaqZ.js"),__vite__mapDeps([5,1]))]);return n.create(`idb://${dn}`,{extensions:{pgcrypto:e,uuid_ossp:t}})}async function Cn(n){var o,a,s,d;n==null||n("체험 공간 여는 중");let e=await V();const t=await e.query("select to_regclass('booth.meta')::text as t");if(((o=t.rows[0])!=null&&o.t?(a=(await e.query("select version from booth.meta limit 1")).rows[0])==null?void 0:a.version:void 0)!==J){const r=(s=(await e.query("select to_regclass('public.works')::text as t")).rows[0])==null?void 0:s.t;((d=t.rows[0])!=null&&d.t||r)&&(await e.close(),await new Promise(_=>{const u=indexedDB.deleteDatabase(`/pglite/${dn}`);u.onsuccess=u.onerror=u.onblocked=()=>_()}),e=await V()),n==null||n("가상 부서 만드는 중");try{await e.exec(`begin;
${ln}
${sn}
${rn}
        create schema if not exists booth;
        create table booth.meta(version text, seeded_at timestamptz default now());
        create table booth.files(bucket text, path text, mime text, data bytea, created_at timestamptz default now(), primary key(bucket, path));
        insert into booth.meta(version) values (${K(J)});
        commit;`)}catch(_){throw await e.exec("rollback").catch(()=>{}),_}}await e.exec("set search_path to public, extensions; set time zone 'UTC';"),n==null||n("준비 끝");const i=await kn(e);return{db:e,cat:i}}const K=n=>"'"+n.replace(/'/g,"''")+"'",W=n=>btoa(unescape(encodeURIComponent(JSON.stringify(n)))).replace(/=+$/,"").replace(/\+/g,"-").replace(/\//g,"_");function Q(){const n=Math.floor(Date.now()/1e3),e=n+3600*24*365,t={id:z.uid,aud:"authenticated",role:"authenticated",email:"guest@booth.invalid",user_metadata:{name:z.name},app_metadata:{provider:"email"},created_at:"2026-01-01T00:00:00Z",updated_at:"2026-01-01T00:00:00Z"};return{access_token:`${W({alg:"HS256",typ:"JWT"})}.${W({sub:t.id,role:"authenticated",aud:"authenticated",email:t.email,exp:e,iat:n})}.booth`,token_type:"bearer",expires_in:e-n,expires_at:e,refresh_token:"booth-refresh",user:t}}const g=(n,e=200,t={})=>new Response(e===204?null:JSON.stringify(n),{status:e,headers:{"Content-Type":"application/json",...t}});function Sn(n,e){return e.startsWith("token")?g(Q()):e==="user"&&n==="GET"?g(Q().user):e==="logout"?g(null,204):g({code:422,error_code:"booth_readonly",msg:"체험관에서는 할 수 없는 일이에요."},422)}const Z="체험관에서는 엔젤이가 실제로 답하지 않아요. 위의 예시 대화를 둘러봐 주세요.";async function In(n,e,t){var l,i;if(e==="angel"&&t.mode==="qa"){if(t.stream){const o={candidates:[{content:{parts:[{text:JSON.stringify({answer:Z})}]}}]};return new Response(`data: ${JSON.stringify(o)}

data: [DONE]

`,{headers:{"Content-Type":"text/event-stream"}})}return g({answer:Z})}if(e==="trip-share"&&typeof t.token=="string"){const a=(await n.db.query(`select public.trip_share_open(${K(t.token)}, ${K(String(t.pin||""))}, '', '') as r`)).rows[0].r;if(a.status==="locked")return g({ok:!1,reason:"locked",until:a.until});if(a.status==="pin")return g({ok:!1,reason:"pin",wrong:!1});if(a.status==="wrong")return g({ok:!1,reason:"pin",wrong:!0,left:a.left});if(a.status!=="ok")return g({ok:!1,reason:"off"});const d=(await n.db.query(`select title, loc, all_day, start_at, end_at, note, travel from public.calendar_events where id = ${Number(a.event_id)}`)).rows[0];return g(d?{ok:!0,trip:{title:d.title,loc:d.loc,allDay:d.all_day,start:d.start_at,end:d.end_at,...((l=d.travel)==null?void 0:l.noteShare)===!0&&((i=d.note)!=null&&i.trim())?{note:d.note}:{},travel:d.travel||{}}}:{ok:!1,reason:"off"})}if(e==="fx"){const o=new Date(Date.now()+324e5).toISOString().slice(0,10);return g({krw:1385.5,date:o})}return g(e==="angel"||e==="angel-file"?{ok:!1,reason:"error"}:{ok:!1,reason:"unsupported",error:"체험관에서는 쓸 수 없는 기능이에요."})}async function On(n,e){const t=await U(),l=((e==null?void 0:e.method)||"GET").toUpperCase(),i=n.pathname;let o;if(typeof(e==null?void 0:e.body)=="string"&&e.body!=="")try{o=JSON.parse(e.body)}catch{o=e.body}if(i.startsWith("/rest/v1/")){const a=await Nn(t.db,t.cat,{method:l,url:n,headers:new Headers(e==null?void 0:e.headers),body:o});return new Response(a.body===""||a.status===204?null:a.body,{status:a.status,headers:a.headers})}return i.startsWith("/auth/v1/")?Sn(l,i.slice(9)):i.startsWith("/functions/v1/")?In(t,i.slice(14),o||{}):g({message:"체험관에서는 쓸 수 없는 주소예요."},404)}async function jn(n,e){return(await(await U()).db.query("select mime, data from booth.files where bucket = $1 and path = $2",[n,e])).rows[0]??null}async function qn(n,e,t,l,i){const o=await U(),a="insert into booth.files(bucket, path, mime, data) values ($1, $2, $3, $4)"+(i?" on conflict (bucket, path) do update set mime = excluded.mime, data = excluded.data":" on conflict do nothing")+" returning path";return(await o.db.query(a,[n,e,t,l])).rows.length>0}async function Un(n,e){const t=await U();for(const l of e)await t.db.query("delete from booth.files where bucket = $1 and path = $2",[n,l])}async function Gn(n,e){const t=await U(),l=e?e.replace(/\/?$/,"/"):"";return(await t.db.query("select path, octet_length(data) as size, mime, created_at::text from booth.files where bucket = $1 and path like $2 order by path",[n,l+"%"])).rows.filter(o=>!o.path.slice(l.length).includes("/")).map(o=>({name:o.path.slice(l.length),size:o.size,mime:o.mime,created_at:o.created_at}))}export{U as bootBackend,jn as fileGet,Gn as fileList,qn as filePut,Un as fileRemove,On as handle};
