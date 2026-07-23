ALTER TABLE public.member_session SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.02,
    autovacuum_vacuum_threshold = 50,
    autovacuum_analyze_threshold = 50
);

ALTER TABLE public.auth_security_event SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.02,
    autovacuum_vacuum_threshold = 50,
    autovacuum_analyze_threshold = 50
);
