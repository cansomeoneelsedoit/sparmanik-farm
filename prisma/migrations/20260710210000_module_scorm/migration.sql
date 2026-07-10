-- SCORM 1.2 support: a module can carry an extracted SCORM package
-- ("<dir>|<launchHref>" under uploads/scorm/). Null = not a SCORM module.
ALTER TABLE "lessons" ADD COLUMN "scorm_path" TEXT;
