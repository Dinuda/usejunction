-- Drop AnalyticsQueryCache; analytics reads always run live SQL.
DROP TABLE IF EXISTS "analytics_query_cache";
