-- 📒 공개/비공개 전환 로그(2026-09-22, CEO 지시) — 코드 경로가 몇 개든 빠짐없이 남도록 DB 트리거로 기록한다(추가 비용 0: 전환 행에만 1 INSERT).
CREATE TABLE IF NOT EXISTS cafe_publish_log (
  id bigserial PRIMARY KEY,
  cafe_id int NOT NULL,
  published boolean NOT NULL,           -- 전환 후 상태
  pipeline_status text,
  exclude_reason text,
  synth_grade text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cafe_publish_log_created ON cafe_publish_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cafe_publish_log_cafe ON cafe_publish_log (cafe_id, created_at DESC);
CREATE OR REPLACE FUNCTION trg_cafe_publish_log() RETURNS trigger AS $$
BEGIN
  INSERT INTO cafe_publish_log (cafe_id, published, pipeline_status, exclude_reason, synth_grade, source)
  VALUES (NEW.id, NEW.published, NEW.pipeline_status, NEW.exclude_reason, NEW.synth_grade, NEW.source);
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS cafe_publish_log_trg ON cafes;
CREATE TRIGGER cafe_publish_log_trg
  AFTER UPDATE OF published ON cafes
  FOR EACH ROW WHEN (OLD.published IS DISTINCT FROM NEW.published)
  EXECUTE FUNCTION trg_cafe_publish_log();
