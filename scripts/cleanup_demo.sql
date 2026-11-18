-- 演示库清理：修复PS编码污染的doseText、删除垃圾测试用户、清除乱码问答日志
USE medguard;
UPDATE mg_med_plan SET dose_text='1粒(0.3g)' WHERE id=5;
DELETE FROM mg_checkin WHERE elder_id=4;
DELETE FROM mg_med_plan WHERE elder_id=4;
DELETE FROM mg_reminder WHERE elder_id=4;
DELETE FROM mg_family_bind WHERE elder_id=4 OR family_id=4;
DELETE FROM mg_recognize_log WHERE user_id=4;
DELETE FROM mg_qa_log WHERE user_id=4;
DELETE FROM mg_audit_log WHERE user_id=4;
DELETE FROM mg_user WHERE id=4;
DELETE FROM mg_qa_log WHERE question LIKE '%?%';
DELETE FROM mg_audit_log WHERE action='QA' AND detail LIKE '%?%';
SELECT (SELECT COUNT(*) FROM mg_user) AS users, (SELECT COUNT(*) FROM mg_qa_log) AS qa_logs, (SELECT COUNT(*) FROM mg_med_plan WHERE active=1) AS active_plans;
