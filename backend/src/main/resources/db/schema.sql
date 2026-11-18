-- ============================================================
-- 智慧养老安全用药辅助平台 - MySQL Schema（幂等，可重复执行）
-- 字符集 utf8mb4；由后端 DbBootstrap 启动时自动执行
-- ============================================================

CREATE TABLE IF NOT EXISTS mg_user (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(20) NOT NULL COMMENT '手机号=登录账号',
  password VARCHAR(120) NOT NULL COMMENT 'BCrypt/SHA-256加盐哈希，绝不存明文',
  name VARCHAR(50) NOT NULL,
  role VARCHAR(20) NOT NULL COMMENT 'ELDER老人/FAMILY家属/ADMIN管理员',
  birth_year INT NULL,
  consent_at DATETIME NULL COMMENT '知情同意时间（大字版知情同意书）',
  health_consent_at DATETIME NULL COMMENT '健康信息单独同意时间，可撤回',
  deleted TINYINT NOT NULL DEFAULT 0 COMMENT '软删除标记',
  deleted_at DATETIME NULL COMMENT '注销时间，30天后级联清除',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_phone (phone),
  KEY idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户与三级角色';

CREATE TABLE IF NOT EXISTS mg_family_bind (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  elder_id BIGINT NOT NULL,
  family_id BIGINT NOT NULL,
  scopes VARCHAR(200) NOT NULL DEFAULT 'VIEW_SUMMARY' COMMENT '授权范围CSV: VIEW_SUMMARY/VIEW_ADHERENCE/RECEIVE_ALERTS/MANAGE_PLANS',
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING/APPROVED/REJECTED/REVOKED',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at DATETIME NULL,
  revoked_at DATETIME NULL COMMENT '授权可随时撤销',
  UNIQUE KEY uk_pair (elder_id, family_id),
  KEY idx_family (family_id),
  KEY idx_elder_status (elder_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='家庭绑定与授权矩阵';

CREATE TABLE IF NOT EXISTS mg_medication (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  generic_name VARCHAR(100) NOT NULL COMMENT '通用名',
  brand_name VARCHAR(100) NULL COMMENT '商品名/品牌名',
  ingredients VARCHAR(500) NOT NULL COMMENT '成分CSV（归一化后），冲突校验的基础',
  drug_class VARCHAR(100) NULL COMMENT '药理分类，如NSAIDs/他汀类',
  indications TEXT COMMENT '适应证',
  dosage TEXT COMMENT '用法用量',
  contraindications TEXT COMMENT '禁忌',
  precautions TEXT COMMENT '注意事项',
  adverse_reactions TEXT COMMENT '不良反应',
  storage VARCHAR(200) NULL,
  source VARCHAR(300) COMMENT '知识来源（说明书/药典/权威科普），可追溯',
  version VARCHAR(20) DEFAULT 'v1.0',
  enabled TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_generic (generic_name),
  KEY idx_brand (brand_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='药品知识库';

CREATE TABLE IF NOT EXISTS mg_conflict_rule (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  rule_code VARCHAR(60) NOT NULL COMMENT '规则编码',
  rule_type VARCHAR(30) NOT NULL COMMENT 'DUPLICATE_INGREDIENT成分重复/CLASS_STACKING同类叠加/CONTRAINDICATED禁忌配伍/ELDERLY_CAUTION老年慎用',
  drug_a VARCHAR(100) NULL COMMENT '药品/成分A（单药规则可只有A）',
  drug_b VARCHAR(100) NULL COMMENT '药品/成分B',
  risk_level VARCHAR(10) NOT NULL COMMENT 'HIGH/MEDIUM/LOW',
  explanation VARCHAR(1000) NOT NULL COMMENT '给老人看的解释话术（通俗、可朗读）',
  basis_source VARCHAR(300) NOT NULL COMMENT '依据来源：说明书/中国老年人潜在不适当用药判断标准(2017版)/AGS Beers标准(2023)',
  reviewed_by VARCHAR(50) NULL COMMENT '审核药师，上线前须逐条审核',
  review_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING待审核/APPROVED已审核',
  version INT NOT NULL DEFAULT 1,
  enabled TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_code (rule_code),
  KEY idx_type (rule_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='四类冲突规则库';

CREATE TABLE IF NOT EXISTS mg_med_plan (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  elder_id BIGINT NOT NULL,
  medication_id BIGINT NULL,
  med_name VARCHAR(100) NOT NULL COMMENT '药品名快照',
  dose_text VARCHAR(100) NOT NULL COMMENT '每次剂量，如"1片"',
  times VARCHAR(200) NOT NULL COMMENT '每日服药时间点CSV，如"08:00,20:00"',
  start_date DATE NOT NULL,
  end_date DATE NULL,
  notes VARCHAR(500) NULL,
  active TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_elder (elder_id, active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用药计划';

CREATE TABLE IF NOT EXISTS mg_checkin (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  plan_id BIGINT NOT NULL,
  elder_id BIGINT NOT NULL,
  med_name VARCHAR(100) NOT NULL,
  scheduled_at DATETIME NOT NULL COMMENT '计划服药时间',
  checked_at DATETIME NULL COMMENT '实际打卡时间',
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING/TAKEN已服/LATE迟到服用/MISSED漏服(规则:超时60分钟未打卡)',
  note VARCHAR(200) NULL,
  UNIQUE KEY uk_plan_time (plan_id, scheduled_at),
  KEY idx_elder_day (elder_id, scheduled_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='服药打卡（漏服=可解释规则判定）';

CREATE TABLE IF NOT EXISTS mg_reminder (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  elder_id BIGINT NOT NULL,
  plan_id BIGINT NULL,
  due_at DATETIME NOT NULL,
  title VARCHAR(100) NOT NULL,
  content VARCHAR(500) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING/READ/EXPIRED',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_dedupe (elder_id, plan_id, due_at),
  KEY idx_elder_status (elder_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='应用内提醒（订阅消息未授权时兜底）';

CREATE TABLE IF NOT EXISTS mg_recognize_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  ocr_text TEXT COMMENT 'OCR识别文本（不含原图，原图识别后即删）',
  candidates TEXT COMMENT 'Top-3候选JSON',
  chosen_medication_id BIGINT NULL,
  top_confidence DECIMAL(5,4) NULL,
  latency_ms INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='拍照识药留痕（隐私：不存原图）';

CREATE TABLE IF NOT EXISTS mg_qa_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  question VARCHAR(500) NOT NULL,
  answer TEXT,
  sources TEXT COMMENT '来源片段JSON（引用覆盖率100%的证据）',
  confidence DECIMAL(5,4) NULL,
  refused TINYINT NOT NULL DEFAULT 0 COMMENT '是否触发拒答',
  mode VARCHAR(30) COMMENT 'llm/extractive',
  latency_ms INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RAG问答留痕';

CREATE TABLE IF NOT EXISTS mg_audit_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NULL,
  user_name VARCHAR(50) NULL,
  action VARCHAR(50) NOT NULL,
  target_type VARCHAR(50) NULL,
  target_id VARCHAR(50) NULL,
  detail VARCHAR(1000) NULL,
  ip VARCHAR(50) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_time (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='操作审计（保存6个月）';

CREATE TABLE IF NOT EXISTS mg_family_alert (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  elder_id BIGINT NOT NULL,
  family_id BIGINT NOT NULL,
  type VARCHAR(32) NOT NULL DEFAULT 'CONFLICT',
  level VARCHAR(16) NOT NULL,
  title VARCHAR(160) NOT NULL,
  content VARCHAR(600) NULL,
  dedup_key VARCHAR(191) NOT NULL,
  read_flag TINYINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_dedup (dedup_key, family_id),
  KEY idx_family (family_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='家属风险提醒（冲突检出即时推送+落库补看）';
