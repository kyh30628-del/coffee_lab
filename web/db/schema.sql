-- 동네 커피 노트 — 데이터베이스 스키마 (구조만, 데이터 없음)
-- 자동 생성: scripts/schema-dump.mjs · 2026-10-18 12:21 KST
-- ⚠️ 손으로 고치지 말 것 — 스크립트를 다시 돌려 갱신한다.
-- 새 환경 세우는 순서: ① 이 파일 실행 ② .env.example 보고 환경변수 채움 ③ lib/criteria.ts DEFAULTS가 폴백이므로 criteria 테이블은 비어도 동작
-- 테이블 99개 · 컬럼 835개 · 인덱스 151개 · 제약 112개

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS agent_runs (
  job text NOT NULL,
  ran_at timestamptz DEFAULT now(),
  ok boolean DEFAULT true,
  detail text,
  processed integer DEFAULT 0,
  CONSTRAINT agent_runs_pkey PRIMARY KEY (job)
);

CREATE TABLE IF NOT EXISTS audit_flags (
  id integer DEFAULT nextval('audit_flags_id_seq'::regclass) NOT NULL,
  cafe_id integer,
  cafe_name text,
  issue text,
  detail text,
  flagged_at timestamptz DEFAULT now(),
  resolved boolean DEFAULT false,
  CONSTRAINT audit_flags_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS audit_triggers (
  id integer DEFAULT nextval('audit_triggers_id_seq'::regclass) NOT NULL,
  kind text,
  ref text,
  detail text,
  severity text DEFAULT 'HIGH'::text,
  status text DEFAULT 'pending'::text,
  created_at timestamptz DEFAULT now(),
  consumed_at timestamptz,
  retries integer DEFAULT 0,
  CONSTRAINT audit_triggers_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS bookmarks (
  id integer DEFAULT nextval('bookmarks_id_seq'::regclass) NOT NULL,
  device_id text NOT NULL,
  cafe_id integer,
  created_at timestamptz DEFAULT now(),
  anon_id text,
  CONSTRAINT bookmarks_pkey PRIMARY KEY (id),
  CONSTRAINT bookmarks_device_id_cafe_id_key UNIQUE (device_id, cafe_id)
);

CREATE TABLE IF NOT EXISTS bot_anon_cache (
  anon_id text NOT NULL,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT bot_anon_cache_pkey PRIMARY KEY (anon_id)
);

CREATE TABLE IF NOT EXISTS cache_inval_queue (
  path text NOT NULL,
  tier smallint NOT NULL,
  enqueued_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT cache_inval_queue_pkey PRIMARY KEY (path)
);

CREATE TABLE IF NOT EXISTS cache_purge_state (
  k text NOT NULL,
  at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT cache_purge_state_pkey PRIMARY KEY (k)
);

CREATE TABLE IF NOT EXISTS cafe_cache_pages (
  id bigint NOT NULL,
  pages text[] NOT NULL,
  at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT cafe_cache_pages_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS cafe_permits (
  cafe_id integer NOT NULL,
  mng_no text,
  permit_nm text,
  status_cd text,
  status_nm text,
  closed_ymd text,
  tel text,
  opened_ymd text,
  sim real,
  way text,
  matched_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT cafe_permits_pkey PRIMARY KEY (cafe_id)
);
CREATE INDEX IF NOT EXISTS idx_cafe_permits_status ON public.cafe_permits USING btree (status_cd);

CREATE TABLE IF NOT EXISTS cafe_promos (
  cafe_id integer NOT NULL,
  intro text,
  photos jsonb,
  ai_headline text,
  ai_tagline text,
  ai_points jsonb,
  published boolean DEFAULT false,
  updated_at timestamptz DEFAULT now(),
  ai_pending boolean DEFAULT false,
  approved boolean DEFAULT false,
  style integer DEFAULT 1,
  video_url text,
  featured boolean,
  views integer,
  clicks integer,
  plays integer,
  featured_until timestamptz,
  coupon text,
  trial_used boolean DEFAULT false,
  CONSTRAINT cafe_promos_pkey PRIMARY KEY (cafe_id)
);

CREATE TABLE IF NOT EXISTS cafe_publish_log (
  id bigint DEFAULT nextval('cafe_publish_log_id_seq'::regclass) NOT NULL,
  cafe_id integer NOT NULL,
  published boolean NOT NULL,
  pipeline_status text,
  exclude_reason text,
  synth_grade text,
  source text,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT cafe_publish_log_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_cafe_publish_log_cafe ON public.cafe_publish_log USING btree (cafe_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cafe_publish_log_created ON public.cafe_publish_log USING btree (created_at DESC);

CREATE TABLE IF NOT EXISTS cafe_reports (
  id bigint DEFAULT nextval('cafe_reports_id_seq'::regclass) NOT NULL,
  cafe_id integer NOT NULL,
  kind text NOT NULL,
  anon text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT cafe_reports_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_cafe_reports_cafe ON public.cafe_reports USING btree (cafe_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cafe_scan_state (
  cafe_id bigint NOT NULL,
  noncafe_scan_at timestamptz,
  offconcept_scan_at timestamptz,
  CONSTRAINT cafe_scan_state_pkey PRIMARY KEY (cafe_id)
);

CREATE TABLE IF NOT EXISTS cafe_snapshots (
  id integer DEFAULT nextval('cafe_snapshots_id_seq'::regclass) NOT NULL,
  cafe_id integer NOT NULL,
  snap_date date DEFAULT CURRENT_DATE NOT NULL,
  rating real,
  rating_count integer,
  created_at timestamptz DEFAULT now(),
  recent_count integer,
  CONSTRAINT cafe_snapshots_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_snap_cafe ON public.cafe_snapshots USING btree (cafe_id, snap_date);

CREATE TABLE IF NOT EXISTS cafes (
  id bigint DEFAULT nextval('cafes_id_seq'::regclass) NOT NULL,
  place_id text,
  name text NOT NULL,
  area text,
  address text,
  lat double precision,
  lng double precision,
  hours text,
  phone text,
  rating real,
  rating_count integer,
  roasts_own boolean DEFAULT false,
  beans text,
  signature text,
  uses text,
  vibe text,
  note text,
  price_hint text,
  source text DEFAULT 'auto'::text,
  published boolean DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  acidity real,
  body real,
  sweet real,
  taste_pick text,
  tone text,
  photo_url text,
  synth_grade text,
  synth_identity text,
  synth_basis text,
  synth_count integer,
  synth_acidity real,
  synth_body real,
  synth_sweet real,
  synth_updated timestamptz,
  synth_reviews jsonb,
  char_scores jsonb,
  synth_quality jsonb,
  embedding vector,
  embed_updated timestamptz,
  review_dates jsonb,
  raw_reviews jsonb,
  raw_collected_at timestamptz,
  llm_judged_at timestamptz,
  yt_checked_at timestamptz,
  judge_decisions jsonb,
  naver_category text,
  synth_reviews_all jsonb,
  naver_place_url text,
  pipeline_status text,
  dong text,
  needs_category boolean DEFAULT false,
  raw_checked_at timestamptz,
  audit_checked_at timestamptz,
  synth_coherence real,
  offctx_rate real,
  offctx_ok boolean DEFAULT false,
  needs_llm boolean,
  borderline_count integer,
  closure_checked_at timestamptz,
  closure_misses integer DEFAULT 0,
  synth_menu jsonb,
  recent_ratio real,
  reputation_note text,
  enriched_at timestamptz,
  instagram_url text,
  synth_checked_at timestamptz,
  needs_llm_priority text,
  visitor_n integer,
  visitor_trip real,
  visitor_local real,
  work_facts jsonb,
  area_rank integer,
  area_total integer,
  exclude_reason text,
  exclude_at timestamptz,
  rules_fp text,
  synth_ev_n integer,
  synth_bad_fields boolean,
  synth_pii_leak boolean,
  synth_bad_link boolean,
  synth_dup_link boolean,
  synth_no_source boolean,
  synth_ad_evidence boolean,
  synth_quote_hashes text[],
  synth_ev_flags jsonb,
  sq_raw integer,
  sq_rejected integer,
  facets text[],
  cautions jsonb,
  CONSTRAINT cafes_pkey PRIMARY KEY (id),
  CONSTRAINT cafes_place_id_key UNIQUE (place_id)
);
CREATE INDEX IF NOT EXISTS cafes_embedding_hnsw ON public.cafes USING hnsw (embedding vector_cosine_ops) WHERE published;
CREATE INDEX IF NOT EXISTS cafes_geo_dong ON public.cafes USING btree (dong, area) WHERE (published AND (dong IS NOT NULL) AND (area IS NOT NULL));
CREATE INDEX IF NOT EXISTS cafes_pub_area ON public.cafes USING btree (area) WHERE published;
CREATE INDEX IF NOT EXISTS idx_cafes_address_eq ON public.cafes USING btree (address) WHERE (address IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_cafes_adflag ON public.cafes USING btree ((((synth_ev_flags ->> 'adflag_n'::text))::integer)) WHERE published;
CREATE INDEX IF NOT EXISTS idx_cafes_axis_pos ON public.cafes USING gin (jsonb_path_query_array(char_scores, '$.keyvalue()?(@."value" > 0)."key"'::jsonpath)) WHERE ((published = true) AND (embedding IS NOT NULL));
CREATE INDEX IF NOT EXISTS idx_cafes_collect_queue ON public.cafes USING btree (id) WHERE ((raw_reviews IS NULL) AND (pipeline_status = 'new'::text));
CREATE INDEX IF NOT EXISTS idx_cafes_facets ON public.cafes USING gin (facets) WHERE (published = true);
CREATE INDEX IF NOT EXISTS idx_cafes_geo ON public.cafes USING btree (lat, lng) WHERE (published AND (lat IS NOT NULL));
CREATE INDEX IF NOT EXISTS idx_cafes_latlng_all ON public.cafes USING btree (lat, lng) WHERE (lat IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_cafes_name_eq ON public.cafes USING btree (name);
CREATE INDEX IF NOT EXISTS idx_cafes_name_norm_trgm ON public.cafes USING gin (replace(lower(name), ' '::text, ''::text) gin_trgm_ops) WHERE published;
CREATE INDEX IF NOT EXISTS idx_cafes_nearmiss_requeue ON public.cafes USING btree (synth_count DESC, raw_checked_at, id) WHERE ((published = false) AND (raw_reviews IS NOT NULL) AND (exclude_at IS NULL));
CREATE INDEX IF NOT EXISTS idx_cafes_pub_freshness ON public.cafes USING btree (published) INCLUDE (updated_at, synth_updated) WHERE (published = true);
CREATE INDEX IF NOT EXISTS idx_cafes_pub_integrity ON public.cafes USING btree (published) INCLUDE (dong, area, naver_category, lat, lng, synth_identity, address) WHERE (published = true);
CREATE INDEX IF NOT EXISTS idx_cafes_pub_rawnull ON public.cafes USING btree (synth_checked_at NULLS FIRST) WHERE ((published = true) AND (raw_reviews IS NULL));
CREATE INDEX IF NOT EXISTS idx_cafes_pub_ver ON public.cafes USING btree (updated_at DESC, synth_updated) WHERE published;
CREATE INDEX IF NOT EXISTS idx_cafes_scan_candidates ON public.cafes USING btree (synth_updated DESC NULLS LAST) WHERE ((published = true) AND (synth_reviews IS NOT NULL));
CREATE INDEX IF NOT EXISTS idx_cafes_sq_cols ON public.cafes USING btree (sq_raw, sq_rejected) WHERE (sq_raw IS NOT NULL);

CREATE TABLE IF NOT EXISTS category_candidates (
  id integer DEFAULT nextval('category_candidates_id_seq'::regclass) NOT NULL,
  found_at timestamptz DEFAULT now(),
  candidates jsonb,
  applied boolean DEFAULT false,
  CONSTRAINT category_candidates_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS chat_archive (
  id integer DEFAULT nextval('chat_archive_id_seq'::regclass) NOT NULL,
  question text,
  answer text,
  mode text,
  created_at timestamptz,
  CONSTRAINT chat_archive_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS chat_queue (
  id integer DEFAULT nextval('chat_queue_id_seq'::regclass) NOT NULL,
  question text,
  history jsonb,
  status text DEFAULT 'pending'::text,
  answer text,
  mode text,
  created_at timestamptz DEFAULT now(),
  answered_at timestamptz,
  llm_model text,
  CONSTRAINT chat_queue_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS console_key_state (
  id integer DEFAULT 1 NOT NULL,
  probed_at timestamptz DEFAULT now(),
  ok boolean,
  signal text,
  detail text,
  alerted_at timestamptz,
  CONSTRAINT console_key_state_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS contam_census (
  id integer DEFAULT nextval('contam_census_id_seq'::regclass) NOT NULL,
  ran_at timestamptz DEFAULT now(),
  cats integer,
  total bigint,
  top jsonb,
  CONSTRAINT contam_census_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS coordination (
  id integer DEFAULT nextval('coordination_id_seq'::regclass) NOT NULL,
  created_at timestamptz DEFAULT now(),
  from_team text,
  to_team text,
  type text,
  topic text,
  detail text,
  status text DEFAULT 'open'::text,
  resolved_at timestamptz,
  resolution text,
  stage text,
  due_at timestamptz,
  accepted_at timestamptz,
  escalated_at timestamptz,
  CONSTRAINT coordination_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS cost_baseline (
  period text NOT NULL,
  transfer_gb numeric,
  days integer,
  transfer_usd numeric,
  compute_usd numeric,
  total_usd numeric,
  note text,
  updated_at timestamptz DEFAULT now(),
  compute_cuh numeric,
  CONSTRAINT cost_baseline_pkey PRIMARY KEY (period)
);

CREATE TABLE IF NOT EXISTS cost_guard (
  id integer DEFAULT 1 NOT NULL,
  halted boolean DEFAULT false,
  reason text,
  set_at timestamptz DEFAULT now(),
  CONSTRAINT cost_guard_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS cost_guard_jobs (
  job text NOT NULL,
  halted boolean DEFAULT false,
  reason text,
  set_at timestamptz DEFAULT now(),
  CONSTRAINT cost_guard_jobs_pkey PRIMARY KEY (job)
);

CREATE TABLE IF NOT EXISTS cost_watch_snapshot (
  queryid bigint NOT NULL,
  query_sample text,
  blks_read bigint NOT NULL,
  calls bigint NOT NULL,
  snapshot_at timestamptz DEFAULT now(),
  exec_ms double precision DEFAULT 0,
  CONSTRAINT cost_watch_snapshot_pkey PRIMARY KEY (queryid)
);

CREATE TABLE IF NOT EXISTS criteria (
  key text NOT NULL,
  category text,
  label text,
  value double precision NOT NULL,
  default_value double precision NOT NULL,
  min_value double precision,
  max_value double precision,
  unit text,
  updated_by text,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT criteria_pkey PRIMARY KEY (key)
);

CREATE TABLE IF NOT EXISTS criteria_history (
  id bigint DEFAULT nextval('criteria_history_id_seq'::regclass) NOT NULL,
  key text NOT NULL,
  old_value double precision,
  new_value double precision,
  changed_by text,
  changed_at timestamptz DEFAULT now(),
  impact_note text,
  CONSTRAINT criteria_history_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS criteria_list_history (
  id bigint DEFAULT nextval('criteria_list_history_id_seq'::regclass) NOT NULL,
  key text NOT NULL,
  item text,
  action text NOT NULL,
  actor text,
  note text,
  at timestamptz DEFAULT now(),
  CONSTRAINT criteria_list_history_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS criteria_lists (
  key text NOT NULL,
  item text NOT NULL,
  op text DEFAULT 'add'::text NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  source text DEFAULT 'manual'::text,
  note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT criteria_lists_pkey PRIMARY KEY (key, item)
);

CREATE TABLE IF NOT EXISTS criteria_verify_reports (
  id bigint DEFAULT nextval('criteria_verify_reports_id_seq'::regclass) NOT NULL,
  ran_at timestamptz DEFAULT now(),
  status text,
  fails integer,
  warns integer,
  dead_knobs text,
  checks jsonb,
  CONSTRAINT criteria_verify_reports_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS cron_gate (
  path text NOT NULL,
  enabled boolean DEFAULT false NOT NULL,
  note text,
  at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT cron_gate_pkey PRIMARY KEY (path)
);

CREATE TABLE IF NOT EXISTS cross_cafe_link_exclusions (
  cafe_id bigint NOT NULL,
  link text NOT NULL,
  reason text,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT cross_cafe_link_exclusions_pkey PRIMARY KEY (cafe_id, link)
);

CREATE TABLE IF NOT EXISTS decisions (
  id integer DEFAULT nextval('decisions_id_seq'::regclass) NOT NULL,
  created_at timestamptz DEFAULT now(),
  title text,
  detail text,
  team text,
  severity text,
  action_type text,
  action_params jsonb,
  status text DEFAULT 'pending'::text,
  decided_at timestamptz,
  result text,
  tier text,
  decided_by text,
  recommendation text,
  CONSTRAINT decisions_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS deep_log (
  cafe_id bigint NOT NULL,
  at timestamptz DEFAULT now() NOT NULL,
  raw_before integer,
  raw_after integer,
  count_before integer,
  count_after integer,
  calls integer,
  CONSTRAINT deep_log_pkey PRIMARY KEY (cafe_id)
);

CREATE TABLE IF NOT EXISTS demand_gaps (
  id bigint DEFAULT nextval('demand_gaps_id_seq'::regclass) NOT NULL,
  kind text,
  term text,
  region text,
  searches integer,
  avg_results real,
  detected_at timestamptz DEFAULT now(),
  CONSTRAINT demand_gaps_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS device_pins (
  device_id text NOT NULL,
  pin_hash text NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT device_pins_pkey PRIMARY KEY (device_id)
);

CREATE TABLE IF NOT EXISTS discovery_state (
  region text NOT NULL,
  area_label text,
  last_run timestamptz,
  last_found integer,
  last_inserted integer,
  last_mined timestamptz,
  last_skipped integer,
  last_oob integer,
  CONSTRAINT discovery_state_pkey PRIMARY KEY (region)
);

CREATE TABLE IF NOT EXISTS discovery_targets (
  id integer DEFAULT nextval('discovery_targets_id_seq'::regclass) NOT NULL,
  region text,
  area_label text,
  keywords jsonb,
  reason text,
  priority integer DEFAULT 0,
  status text DEFAULT 'pending'::text,
  created_at timestamptz DEFAULT now(),
  consumed_at timestamptz,
  found integer,
  inserted integer,
  CONSTRAINT discovery_targets_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS dong_tourism (
  area text NOT NULL,
  dong text NOT NULL,
  sampled integer,
  touristic integer,
  residential integer,
  rate real,
  is_tourist boolean,
  judged_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT dong_tourism_pkey PRIMARY KEY (area, dong)
);

CREATE TABLE IF NOT EXISTS grounding_checks (
  cafe_id integer NOT NULL,
  grounded boolean,
  issue text,
  checked_at timestamptz DEFAULT now(),
  CONSTRAINT grounding_checks_pkey PRIMARY KEY (cafe_id)
);

CREATE TABLE IF NOT EXISTS heal_attempts (
  job text NOT NULL,
  target_id integer NOT NULL,
  attempts integer DEFAULT 0,
  no_effect integer DEFAULT 0,
  last_effect boolean,
  last_at timestamptz DEFAULT now(),
  frozen_until timestamptz,
  note text,
  CONSTRAINT heal_attempts_pkey PRIMARY KEY (job, target_id)
);

CREATE TABLE IF NOT EXISTS heal_dict_state (
  k text NOT NULL,
  v text,
  CONSTRAINT heal_dict_state_pkey PRIMARY KEY (k)
);

CREATE TABLE IF NOT EXISTS heal_leases (
  target_id integer NOT NULL,
  holder text NOT NULL,
  acquired_at timestamptz DEFAULT now(),
  lease_until timestamptz NOT NULL,
  CONSTRAINT heal_leases_pkey PRIMARY KEY (target_id)
);

CREATE TABLE IF NOT EXISTS indexnow_log (
  url text NOT NULL,
  submitted_at timestamptz DEFAULT now() NOT NULL,
  engine text,
  CONSTRAINT indexnow_log_pkey PRIMARY KEY (url)
);

CREATE TABLE IF NOT EXISTS issues (
  id integer DEFAULT nextval('issues_id_seq'::regclass) NOT NULL,
  ikey text,
  source text,
  severity text,
  type text,
  title text,
  detail text,
  team text,
  status text DEFAULT 'open'::text,
  first_seen timestamptz DEFAULT now(),
  last_seen timestamptz DEFAULT now(),
  resolved_at timestamptz,
  state text,
  note text,
  CONSTRAINT issues_pkey PRIMARY KEY (id),
  CONSTRAINT issues_ikey_key UNIQUE (ikey)
);

CREATE TABLE IF NOT EXISTS judge_batches (
  batch_id text NOT NULL,
  manifest jsonb,
  applied boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT judge_batches_pkey PRIMARY KEY (batch_id)
);

CREATE TABLE IF NOT EXISTS landing_debug (
  id bigint DEFAULT nextval('landing_debug_id_seq'::regclass) NOT NULL,
  load_id text,
  mount_id text,
  anon text,
  memo_hash text,
  nav_type text,
  standalone boolean,
  visible text,
  ua text,
  t_since_load integer,
  note text,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT landing_debug_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_landing_debug_created ON public.landing_debug USING btree (created_at DESC);

CREATE TABLE IF NOT EXISTS learned_terms (
  term text NOT NULL,
  kind text NOT NULL,
  evidence_count integer DEFAULT 0,
  sample_cafes jsonb,
  status text DEFAULT 'active'::text,
  source text DEFAULT 'auto'::text,
  note text,
  created_at timestamptz DEFAULT now(),
  applied_at timestamptz DEFAULT now(),
  CONSTRAINT learned_terms_pkey PRIMARY KEY (term, kind)
);

CREATE TABLE IF NOT EXISTS lounge_comments (
  id integer DEFAULT nextval('lounge_comments_id_seq'::regclass) NOT NULL,
  target text NOT NULL,
  author text DEFAULT 'CEO'::text,
  body text NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT lounge_comments_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS naver_budget (
  day text NOT NULL,
  used integer DEFAULT 0 NOT NULL,
  exhausted boolean DEFAULT false,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT naver_budget_pkey PRIMARY KEY (day)
);

CREATE TABLE IF NOT EXISTS neon_billing (
  id bigint DEFAULT nextval('neon_billing_id_seq'::regclass) NOT NULL,
  period_start timestamptz,
  egress_gb real,
  compute_h real,
  days real,
  egress_per_day real,
  compute_per_day real,
  taken_at timestamptz DEFAULT now() NOT NULL,
  project text DEFAULT 'coffee-db'::text NOT NULL,
  CONSTRAINT neon_billing_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_neon_billing_project_taken ON public.neon_billing USING btree (project, taken_at DESC);
CREATE INDEX IF NOT EXISTS idx_neon_billing_taken ON public.neon_billing USING btree (taken_at DESC);

CREATE TABLE IF NOT EXISTS newsletter_optout (
  email text NOT NULL,
  sub_id integer,
  opted_out_at timestamptz DEFAULT now(),
  CONSTRAINT newsletter_optout_pkey PRIMARY KEY (email)
);

CREATE TABLE IF NOT EXISTS newsletter_sends (
  id integer DEFAULT nextval('newsletter_sends_id_seq'::regclass) NOT NULL,
  newsletter_id integer,
  sub_id integer,
  email text,
  status text,
  sent_at timestamptz DEFAULT now(),
  opened_at timestamptz,
  CONSTRAINT newsletter_sends_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS newsletters (
  id integer DEFAULT nextval('newsletters_id_seq'::regclass) NOT NULL,
  issue_no integer,
  week_of date,
  status text DEFAULT 'draft'::text,
  title text,
  sections jsonb,
  flags jsonb,
  model text,
  cost real,
  sent_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  approved_at timestamptz,
  sent_at timestamptz,
  CONSTRAINT newsletters_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS notice_dismissals (
  id bigint DEFAULT nextval('notice_dismissals_id_seq'::regclass) NOT NULL,
  notice_id text NOT NULL,
  anon_id text,
  ts timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT notice_dismissals_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_notice_dismissals_nid ON public.notice_dismissals USING btree (notice_id);

CREATE TABLE IF NOT EXISTS notices (
  id text NOT NULL,
  emoji text DEFAULT '📣'::text NOT NULL,
  title text NOT NULL,
  title_past text NOT NULL,
  highlight text,
  body text NOT NULL,
  body_past text NOT NULL,
  sub text DEFAULT ''::text NOT NULL,
  sub_past text DEFAULT ''::text NOT NULL,
  cta text DEFAULT '확인'::text NOT NULL,
  cta_past text DEFAULT '확인'::text NOT NULL,
  from_at timestamptz NOT NULL,
  past_from_at timestamptz NOT NULL,
  until_at timestamptz NOT NULL,
  enabled boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  cta_href text,
  CONSTRAINT notices_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS orchestrator_state (
  id integer DEFAULT 1 NOT NULL,
  health jsonb,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT orchestrator_state_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS org_briefings (
  id integer DEFAULT nextval('org_briefings_id_seq'::regclass) NOT NULL,
  created_at timestamptz DEFAULT now(),
  executive_md text,
  approvals jsonb,
  token_today jsonb,
  crons jsonb,
  metrics jsonb,
  delegated jsonb,
  work_order text,
  meeting text,
  CONSTRAINT org_briefings_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS org_reports (
  kind text NOT NULL,
  title text,
  md text,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT org_reports_pkey PRIMARY KEY (kind)
);

CREATE TABLE IF NOT EXISTS outbound_clicks (
  id bigint DEFAULT nextval('outbound_clicks_id_seq'::regclass) NOT NULL,
  anon_id text,
  cafe_id integer,
  target text,
  source text,
  path text,
  ts timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT outbound_clicks_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_outbound_clicks_cafe ON public.outbound_clicks USING btree (cafe_id);
CREATE INDEX IF NOT EXISTS idx_outbound_clicks_ts ON public.outbound_clicks USING btree (ts);

CREATE TABLE IF NOT EXISTS outreach_log (
  cafe_id integer NOT NULL,
  channel text,
  sent_at timestamptz DEFAULT now(),
  note text,
  CONSTRAINT outreach_log_pkey PRIMARY KEY (cafe_id)
);

CREATE TABLE IF NOT EXISTS owner_content (
  cafe_id integer NOT NULL,
  photos jsonb DEFAULT '[]'::jsonb NOT NULL,
  note text,
  note_at timestamptz,
  hidden boolean DEFAULT false NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT owner_content_pkey PRIMARY KEY (cafe_id)
);

CREATE TABLE IF NOT EXISTS owner_events (
  id integer DEFAULT nextval('owner_events_id_seq'::regclass) NOT NULL,
  cafe_id integer,
  event text,
  at timestamptz DEFAULT now(),
  meta jsonb,
  CONSTRAINT owner_events_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_owner_events_cafe ON public.owner_events USING btree (cafe_id, at DESC);

CREATE TABLE IF NOT EXISTS owner_funnel_events (
  id bigint DEFAULT nextval('owner_funnel_events_id_seq'::regclass) NOT NULL,
  anon_id text,
  event text,
  source text,
  cafe_id integer,
  path text,
  meta jsonb,
  ts timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT owner_funnel_events_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_owner_funnel_events_ts ON public.owner_funnel_events USING btree (ts);

CREATE TABLE IF NOT EXISTS owner_leads (
  id bigint DEFAULT nextval('owner_leads_id_seq'::regclass) NOT NULL,
  cafe_id integer NOT NULL,
  email text NOT NULL,
  email_hash text NOT NULL,
  anon_id text,
  created_at timestamptz DEFAULT now() NOT NULL,
  last_sent_at timestamptz,
  CONSTRAINT owner_leads_pkey PRIMARY KEY (id),
  CONSTRAINT owner_leads_cafe_id_email_hash_key UNIQUE (cafe_id, email_hash)
);

CREATE TABLE IF NOT EXISTS owner_watch_state (
  cafe_id integer NOT NULL,
  synth_count integer,
  rank integer,
  hood_n integer,
  checked_at timestamptz DEFAULT now() NOT NULL,
  notified_at timestamptz,
  CONSTRAINT owner_watch_state_pkey PRIMARY KEY (cafe_id)
);

CREATE TABLE IF NOT EXISTS payments (
  id integer DEFAULT nextval('payments_id_seq'::regclass) NOT NULL,
  order_id text,
  cafe_id integer,
  subscription_id integer,
  payment_key text,
  amount integer,
  status text DEFAULT 'pending'::text,
  method text,
  fail_code text,
  fail_reason text,
  raw jsonb,
  requested_at timestamptz DEFAULT now(),
  paid_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT payments_pkey PRIMARY KEY (id),
  CONSTRAINT payments_order_id_key UNIQUE (order_id)
);
CREATE INDEX IF NOT EXISTS idx_payments_cafe ON public.payments USING btree (cafe_id, created_at DESC);

CREATE TABLE IF NOT EXISTS peer_reviews (
  id integer DEFAULT nextval('peer_reviews_id_seq'::regclass) NOT NULL,
  reviewer text,
  target text,
  note text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT peer_reviews_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS pg_stat_statements (
  userid oid,
  dbid oid,
  toplevel boolean,
  queryid bigint,
  query text,
  plans bigint,
  total_plan_time double precision,
  min_plan_time double precision,
  max_plan_time double precision,
  mean_plan_time double precision,
  stddev_plan_time double precision,
  calls bigint,
  total_exec_time double precision,
  min_exec_time double precision,
  max_exec_time double precision,
  mean_exec_time double precision,
  stddev_exec_time double precision,
  rows bigint,
  shared_blks_hit bigint,
  shared_blks_read bigint,
  shared_blks_dirtied bigint,
  shared_blks_written bigint,
  local_blks_hit bigint,
  local_blks_read bigint,
  local_blks_dirtied bigint,
  local_blks_written bigint,
  temp_blks_read bigint,
  temp_blks_written bigint,
  shared_blk_read_time double precision,
  shared_blk_write_time double precision,
  local_blk_read_time double precision,
  local_blk_write_time double precision,
  temp_blk_read_time double precision,
  temp_blk_write_time double precision,
  wal_records bigint,
  wal_fpi bigint,
  wal_bytes numeric,
  jit_functions bigint,
  jit_generation_time double precision,
  jit_inlining_count bigint,
  jit_inlining_time double precision,
  jit_optimization_count bigint,
  jit_optimization_time double precision,
  jit_emission_count bigint,
  jit_emission_time double precision,
  jit_deform_count bigint,
  jit_deform_time double precision,
  stats_since timestamptz,
  minmax_stats_since timestamptz
);

CREATE TABLE IF NOT EXISTS pg_stat_statements_info (
  dealloc bigint,
  stats_reset timestamptz
);

CREATE TABLE IF NOT EXISTS promo_daily (
  cafe_id integer NOT NULL,
  day date NOT NULL,
  views integer DEFAULT 0,
  clicks integer DEFAULT 0,
  plays integer DEFAULT 0,
  CONSTRAINT promo_daily_pkey PRIMARY KEY (cafe_id, day)
);

CREATE TABLE IF NOT EXISTS purge_log (
  id integer DEFAULT nextval('purge_log_id_seq'::regclass) NOT NULL,
  n integer,
  deleted_at timestamptz DEFAULT now(),
  CONSTRAINT purge_log_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  key text NOT NULL,
  count integer NOT NULL,
  reset_at timestamptz NOT NULL,
  CONSTRAINT rate_limit_buckets_pkey PRIMARY KEY (key)
);

CREATE TABLE IF NOT EXISTS recheck_queue (
  id bigint DEFAULT nextval('recheck_queue_id_seq'::regclass) NOT NULL,
  cafe_id integer NOT NULL,
  reason text,
  policy_ref text,
  queued_at timestamptz DEFAULT now(),
  reviewed_at timestamptz,
  verdict text,
  note text,
  reviewed_by text,
  CONSTRAINT recheck_queue_pkey PRIMARY KEY (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS recheck_queue_open ON public.recheck_queue USING btree (cafe_id) WHERE (reviewed_at IS NULL);

CREATE TABLE IF NOT EXISTS recovery_codes (
  code text NOT NULL,
  device_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT recovery_codes_pkey PRIMARY KEY (code)
);

CREATE TABLE IF NOT EXISTS refresh_log (
  cafe_id bigint NOT NULL,
  at timestamptz DEFAULT now() NOT NULL,
  before_count integer,
  after_count integer,
  grade_changed boolean DEFAULT false,
  CONSTRAINT refresh_log_pkey PRIMARY KEY (cafe_id)
);

CREATE TABLE IF NOT EXISTS review_quotes (
  cafe_id bigint NOT NULL,
  quote_hash text NOT NULL,
  CONSTRAINT review_quotes_pkey PRIMARY KEY (cafe_id, quote_hash)
);
CREATE INDEX IF NOT EXISTS review_quotes_hash_idx ON public.review_quotes USING btree (quote_hash);

CREATE TABLE IF NOT EXISTS reviewer_cafes (
  rid text NOT NULL,
  cafe_id bigint NOT NULL,
  accepted integer DEFAULT 0 NOT NULL,
  rejected_ad integer DEFAULT 0 NOT NULL,
  first_dt date,
  last_dt date,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT reviewer_cafes_pkey PRIMARY KEY (rid, cafe_id)
);
CREATE INDEX IF NOT EXISTS reviewer_cafes_rid ON public.reviewer_cafes USING btree (rid);

CREATE TABLE IF NOT EXISTS rulegap_runs (
  id integer DEFAULT nextval('rulegap_runs_id_seq'::regclass) NOT NULL,
  ran_at timestamptz DEFAULT now(),
  published_before integer,
  learned jsonb,
  pending jsonb,
  CONSTRAINT rulegap_runs_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS run_ledger (
  id bigint DEFAULT nextval('run_ledger_id_seq'::regclass) NOT NULL,
  job text NOT NULL,
  started_at timestamptz DEFAULT now() NOT NULL,
  ended_at timestamptz DEFAULT now(),
  ok boolean,
  effect_ok boolean,
  fingerprint text,
  metrics jsonb,
  detail text,
  CONSTRAINT run_ledger_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS run_ledger_job_time ON public.run_ledger USING btree (job, started_at DESC);

CREATE TABLE IF NOT EXISTS schema_state (
  key text NOT NULL,
  tag text NOT NULL,
  at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT schema_state_pkey PRIMARY KEY (key)
);

CREATE TABLE IF NOT EXISTS search_cache (
  qkey text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT search_cache_pkey PRIMARY KEY (qkey)
);

CREATE TABLE IF NOT EXISTS search_log (
  id bigint DEFAULT nextval('search_log_id_seq'::regclass) NOT NULL,
  q text,
  region text,
  results integer,
  mode text,
  ts timestamptz DEFAULT now(),
  ai_err text,
  top_ids int4[],
  CONSTRAINT search_log_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_search_log_top_ids ON public.search_log USING gin (top_ids);

CREATE TABLE IF NOT EXISTS seed_candidates (
  id integer DEFAULT nextval('seed_candidates_id_seq'::regclass) NOT NULL,
  biz_no text,
  name text,
  branch text,
  area text,
  address text,
  lat double precision,
  lng double precision,
  scls text,
  matched_cafe_id integer,
  status text DEFAULT 'candidate'::text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT seed_candidates_pkey PRIMARY KEY (id),
  CONSTRAINT seed_candidates_biz_no_key UNIQUE (biz_no)
);

CREATE TABLE IF NOT EXISTS selfaudit_runs (
  id integer DEFAULT nextval('selfaudit_runs_id_seq'::regclass) NOT NULL,
  ran_at timestamptz DEFAULT now(),
  ok boolean,
  findings jsonb,
  fixed jsonb,
  escalated jsonb,
  CONSTRAINT selfaudit_runs_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS sentinel_reports (
  id integer DEFAULT nextval('sentinel_reports_id_seq'::regclass) NOT NULL,
  ran_at timestamptz DEFAULT now(),
  clean boolean,
  report jsonb,
  CONSTRAINT sentinel_reports_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS seo_counts (
  kind text NOT NULL,
  key text NOT NULL,
  n integer NOT NULL,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT seo_counts_pkey PRIMARY KEY (kind, key)
);
CREATE INDEX IF NOT EXISTS idx_seo_counts_kind ON public.seo_counts USING btree (kind);

CREATE TABLE IF NOT EXISTS share_events (
  id bigint DEFAULT nextval('share_events_id_seq'::regclass) NOT NULL,
  anon_id text,
  path text,
  cafe_id integer,
  channel text,
  ts timestamptz DEFAULT now() NOT NULL,
  source text,
  kakao_failed boolean,
  note text,
  CONSTRAINT share_events_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_share_events_ts ON public.share_events USING btree (ts);

CREATE TABLE IF NOT EXISTS silent_failures (
  scope text NOT NULL,
  day date DEFAULT ((now() AT TIME ZONE 'Asia/Seoul'::text))::date NOT NULL,
  n integer DEFAULT 0 NOT NULL,
  last_error text,
  last_at timestamptz DEFAULT now(),
  CONSTRAINT silent_failures_pkey PRIMARY KEY (scope, day)
);

CREATE TABLE IF NOT EXISTS startup_report_orders (
  id bigint DEFAULT nextval('startup_report_orders_id_seq'::regclass) NOT NULL,
  slug text NOT NULL,
  email text NOT NULL,
  name text,
  code text NOT NULL,
  paid_at timestamptz,
  opened_at timestamptz,
  opens integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT startup_report_orders_pkey PRIMARY KEY (id),
  CONSTRAINT startup_report_orders_code_key UNIQUE (code)
);
CREATE INDEX IF NOT EXISTS idx_startup_orders_slug ON public.startup_report_orders USING btree (slug, created_at DESC);

CREATE TABLE IF NOT EXISTS sub_requests (
  id integer DEFAULT nextval('sub_requests_id_seq'::regclass) NOT NULL,
  cafe_name text,
  contact text,
  plan text,
  status text DEFAULT 'new'::text,
  created_at timestamptz DEFAULT now(),
  consent boolean DEFAULT false,
  consent_at timestamptz,
  CONSTRAINT sub_requests_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id integer DEFAULT nextval('subscriptions_id_seq'::regclass) NOT NULL,
  cafe_id integer,
  cafe_name text,
  owner_name text,
  contact text,
  email text,
  plan text DEFAULT '홍보팩'::text,
  price integer DEFAULT 9900,
  status text DEFAULT 'pending'::text,
  started_at timestamptz,
  expires_at timestamptz,
  consent boolean DEFAULT false,
  consent_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  pin text,
  biz_reg_url text,
  biz_no text,
  attested boolean DEFAULT false,
  attested_at timestamptz,
  signup_ip text,
  signup_ua text,
  verified boolean DEFAULT false,
  suspend_reason text,
  suspended_at timestamptz,
  newsletter_opt_in boolean DEFAULT true,
  pin_emailed_at timestamptz,
  last_seen_at timestamptz,
  first_login_at timestamptz,
  login_count integer DEFAULT 0,
  duration_days integer,
  billing_key text,
  billing_customer_key text,
  card_last4 text,
  card_company text,
  card_registered_at timestamptz,
  billing_status text DEFAULT 'none'::text,
  next_billing_at timestamptz,
  last_payment_status text,
  last_payment_at timestamptz,
  dunning_count integer DEFAULT 0,
  autopay boolean DEFAULT false,
  conversion_requested_at timestamptz,
  CONSTRAINT subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT subscriptions_cafe_id_key UNIQUE (cafe_id)
);

CREATE TABLE IF NOT EXISTS taste_logs (
  id bigint DEFAULT nextval('taste_logs_id_seq'::regclass) NOT NULL,
  acidity real NOT NULL,
  body real NOT NULL,
  sweetness real NOT NULL,
  flavors text,
  top_origin text,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT taste_logs_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS team_kpis (
  id integer DEFAULT nextval('team_kpis_id_seq'::regclass) NOT NULL,
  scope text,
  week_start date,
  goal text,
  updated_by text,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT team_kpis_pkey PRIMARY KEY (id),
  CONSTRAINT team_kpis_scope_week_start_key UNIQUE (scope, week_start)
);

CREATE TABLE IF NOT EXISTS traffic_events (
  id bigint DEFAULT nextval('traffic_events_id_seq'::regclass) NOT NULL,
  anon_id text,
  path text,
  src text,
  ts timestamptz DEFAULT now() NOT NULL,
  duration_ms integer,
  CONSTRAINT traffic_events_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_traffic_events_ts ON public.traffic_events USING btree (ts);

CREATE TABLE IF NOT EXISTS user_consents (
  id bigint DEFAULT nextval('user_consents_id_seq'::regclass) NOT NULL,
  anon_id text NOT NULL,
  agreed boolean,
  consent_version text,
  region text,
  lat real,
  lng real,
  user_agent text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  visit_count integer DEFAULT 1,
  last_seen timestamptz,
  src text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  landing text,
  internal boolean DEFAULT false,
  sessions integer DEFAULT 1,
  pwa_standalone boolean DEFAULT false,
  CONSTRAINT user_consents_pkey PRIMARY KEY (id),
  CONSTRAINT user_consents_anon_id_key UNIQUE (anon_id)
);

CREATE TABLE IF NOT EXISTS user_visits (
  id integer DEFAULT nextval('user_visits_id_seq'::regclass) NOT NULL,
  cafe_id integer,
  device_id text NOT NULL,
  photo_url text,
  verified boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  memory text,
  favorite boolean DEFAULT false,
  finalized boolean DEFAULT true,
  photos jsonb,
  is_public boolean DEFAULT false,
  anon_id text,
  photo_approved boolean DEFAULT false,
  photo_reviewed_at timestamptz,
  CONSTRAINT user_visits_pkey PRIMARY KEY (id),
  CONSTRAINT user_visits_cafe_id_device_id_key UNIQUE (cafe_id, device_id)
);
CREATE INDEX IF NOT EXISTS idx_user_visits_device ON public.user_visits USING btree (device_id);

CREATE TABLE IF NOT EXISTS verify_reports (
  id integer DEFAULT nextval('verify_reports_id_seq'::regclass) NOT NULL,
  ran_at timestamptz DEFAULT now(),
  status text,
  fails integer,
  warns integer,
  checks jsonb,
  CONSTRAINT verify_reports_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS work_orders (
  id integer DEFAULT nextval('work_orders_id_seq'::regclass) NOT NULL,
  command text,
  action text,
  tier text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT work_orders_pkey PRIMARY KEY (id)
);

-- 외래키는 테이블 생성 뒤에 붙인다(순서 의존 제거)
ALTER TABLE audit_flags ADD CONSTRAINT audit_flags_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES cafes(id) ON DELETE CASCADE;
ALTER TABLE bookmarks ADD CONSTRAINT bookmarks_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES cafes(id) ON DELETE CASCADE;
ALTER TABLE cafe_scan_state ADD CONSTRAINT cafe_scan_state_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES cafes(id) ON DELETE CASCADE;
ALTER TABLE user_visits ADD CONSTRAINT user_visits_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES cafes(id) ON DELETE CASCADE;
