ALTER SEQUENCE IF EXISTS uploaded_file_seq INCREMENT BY 1;

SELECT setval('public.uploaded_file_seq', COALESCE((SELECT MAX(id) + 1 FROM public.uploaded_file), 1), false);
