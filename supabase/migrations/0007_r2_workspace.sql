-- R2 workspace: reusable templates, policy layer metadata, and map snapshots.

create table if not exists public.map_templates (
  id uuid primary key default uuid_generate_v4(),
  slug text not null unique,
  title text not null,
  audience text not null default '',
  description text not null default '',
  guidance text not null default '',
  prohibited_columns jsonb not null default '[]'::jsonb,
  columns jsonb not null default '[]'::jsonb,
  example_rows jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists map_templates_active_title_idx on public.map_templates (active, title);

create table if not exists public.policy_layers (
  id uuid primary key default uuid_generate_v4(),
  slug text not null unique,
  title text not null,
  layer_type text not null check (layer_type in ('population_decline', 'population_interest')),
  source_name text not null,
  source_url text,
  data_as_of date not null,
  version text not null,
  region_count int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists policy_layers_active_idx on public.policy_layers (active, layer_type);

create table if not exists public.map_versions (
  id uuid primary key default uuid_generate_v4(),
  map_id uuid not null references public.maps(id) on delete cascade,
  version_number int not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  reason text not null default '',
  change_summary jsonb not null default '{}'::jsonb,
  snapshot jsonb not null default '{}'::jsonb,
  created_by_hash text,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (map_id, version_number)
);

create index if not exists map_versions_map_created_idx on public.map_versions (map_id, created_at desc);

alter table public.maps
  add column if not exists current_version_id uuid references public.map_versions(id) on delete set null;

create index if not exists maps_current_version_idx on public.maps (current_version_id);

alter table public.map_templates enable row level security;
alter table public.policy_layers enable row level security;
alter table public.map_versions enable row level security;

insert into public.map_templates (slug, title, audience, description, guidance, prohibited_columns, columns, example_rows)
values
(
  'welfare-facilities', '복지시설', '복지·돌봄 담당 부서',
  '복지관, 돌봄기관, 상담·지원시설의 위치와 이용 정보를 지도화합니다.',
  '운영시간이나 대표 연락처는 공개 가능 여부를 먼저 확인하세요.',
  '["주민등록번호", "개인 휴대전화", "상세 거주지", "사례관리 메모"]'::jsonb,
  '[{"header":"주소","role":"address","publicByDefault":true},{"header":"시설명","role":"name","publicByDefault":true},{"header":"수용인원","role":"value","publicByDefault":true},{"header":"시설유형","role":"category","publicByDefault":true},{"header":"운영시간","role":"extra","publicByDefault":true},{"header":"문의처","role":"extra","publicByDefault":false}]'::jsonb,
  '[{"주소":"서울특별시 중구 세종대로 110","시설명":"중구 복지센터","수용인원":120,"시설유형":"복지관","운영시간":"평일 09:00~18:00","문의처":"02-0000-0000"}]'::jsonb
),
(
  'living-soc', '생활SOC', '지역·생활 인프라 담당 부서',
  '도서관, 체육관, 문화센터 등 생활SOC 현황을 주민에게 공유합니다.',
  '시설의 위치와 운영 상태를 기준일과 함께 입력하세요.',
  '["담당자 개인 연락처", "출입 비밀번호", "내부 점검 메모"]'::jsonb,
  '[{"header":"주소","role":"address","publicByDefault":true},{"header":"시설명","role":"name","publicByDefault":true},{"header":"좌석수","role":"value","publicByDefault":true},{"header":"시설유형","role":"category","publicByDefault":true},{"header":"운영현황","role":"extra","publicByDefault":true}]'::jsonb,
  '[{"주소":"세종특별자치시 도움6로 11","시설명":"한솔동 도서관","좌석수":180,"시설유형":"도서관","운영현황":"정상 운영"}]'::jsonb
),
(
  'social-economy', '사회적경제기업', '사회적경제·기업지원 담당 부서',
  '사회적기업, 협동조합, 마을기업의 위치와 사업 분야를 정리합니다.',
  '대표자 개인 연락처 대신 기관 대표 연락처와 공개 가능한 사업 정보만 선택하세요.',
  '["대표자 주민등록번호", "대표자 개인 전화", "비공개 투자·매출 정보"]'::jsonb,
  '[{"header":"사업장 주소","role":"address","publicByDefault":true},{"header":"기업명","role":"name","publicByDefault":true},{"header":"고용인원","role":"value","publicByDefault":true},{"header":"기업유형","role":"category","publicByDefault":true},{"header":"주요사업","role":"extra","publicByDefault":true}]'::jsonb,
  '[{"사업장 주소":"전라남도 나주시 빛가람로 719","기업명":"나주마을협동조합","고용인원":14,"기업유형":"사회적기업","주요사업":"로컬푸드 유통"}]'::jsonb
),
(
  'vacant-spaces', '빈집·유휴공간', '도시재생·인구정책 담당 부서',
  '빈집과 공공 유휴공간의 위치, 활용 가능성, 담당 사업을 지도화합니다.',
  '소유자 식별정보와 내부 출입정보는 공개하지 마세요.',
  '["소유자 이름", "소유자 연락처", "열쇠·출입 코드", "내부 보안 메모"]'::jsonb,
  '[{"header":"공간 주소","role":"address","publicByDefault":true},{"header":"공간명","role":"name","publicByDefault":true},{"header":"면적㎡","role":"value","publicByDefault":true},{"header":"활용상태","role":"category","publicByDefault":true},{"header":"사업명","role":"extra","publicByDefault":true}]'::jsonb,
  '[{"공간 주소":"강원특별자치도 태백시 황지로 25","공간명":"황지동 빈집 1","면적㎡":82,"활용상태":"활용 검토","사업명":"청년 정착 공간"}]'::jsonb
),
(
  'safety-inspections', '안전점검', '재난·안전관리 담당 부서',
  '시설물 안전점검 대상과 조치 상태를 주민에게 설명 가능한 범위로 공개합니다.',
  '구체적인 보안 취약점이나 개인 식별정보는 제외하세요.',
  '["보안 취약점 상세", "출입 취약 시간", "담당자 개인 연락처"]'::jsonb,
  '[{"header":"대상 주소","role":"address","publicByDefault":true},{"header":"대상명","role":"name","publicByDefault":true},{"header":"점검점수","role":"value","publicByDefault":true},{"header":"점검등급","role":"category","publicByDefault":true},{"header":"최근점검일","role":"extra","publicByDefault":true}]'::jsonb,
  '[{"대상 주소":"충청북도 제천시 의림대로 120","대상명":"의림교","점검점수":86,"점검등급":"양호","최근점검일":"2026-06-30"}]'::jsonb
),
(
  'tourism-resources', '관광자원', '관광·문화 담당 부서',
  '관광지, 문화공간, 지역축제 거점의 위치와 방문 정보를 공유합니다.',
  '방문객에게 도움이 되는 운영·편의 정보와 기준일을 함께 기록하세요.',
  '["비공개 협상 메모", "개인 예약자 정보", "관리자 개인 연락처"]'::jsonb,
  '[{"header":"관광지 주소","role":"address","publicByDefault":true},{"header":"관광자원명","role":"name","publicByDefault":true},{"header":"연간방문객","role":"value","publicByDefault":true},{"header":"자원유형","role":"category","publicByDefault":true},{"header":"운영정보","role":"extra","publicByDefault":true}]'::jsonb,
  '[{"관광지 주소":"전라남도 강진군 강진읍 영랑생가길 15","관광자원명":"영랑생가","연간방문객":34000,"자원유형":"문화유산","운영정보":"화~일 09:00~18:00"}]'::jsonb
)
on conflict (slug) do update set
  title = excluded.title,
  audience = excluded.audience,
  description = excluded.description,
  guidance = excluded.guidance,
  prohibited_columns = excluded.prohibited_columns,
  columns = excluded.columns,
  example_rows = excluded.example_rows,
  active = true,
  updated_at = now();

insert into public.policy_layers (slug, title, layer_type, source_name, source_url, data_as_of, version, region_count)
values
  ('population-decline-2024', '인구감소지역', 'population_decline', '행정안전부 인구감소지역 지정 변경 고시', 'https://www.law.go.kr/admRulLsInfoP.do?admRulSeq=2100000236722', '2024-02-27', '2024-15', 89),
  ('population-interest-2026', '인구감소관심지역', 'population_interest', '행정안전부 인구감소관심지역 지정 고시', 'https://www.law.go.kr/admRulLsInfoP.do?admRulSeq=2100000270632', '2026-01-01', '2025-78', 18)
on conflict (slug) do update set
  title = excluded.title,
  source_name = excluded.source_name,
  source_url = excluded.source_url,
  data_as_of = excluded.data_as_of,
  version = excluded.version,
  region_count = excluded.region_count,
  active = true,
  updated_at = now();
