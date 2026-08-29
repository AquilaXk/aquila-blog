ALTER TABLE public.task
    ALTER COLUMN id SET DEFAULT nextval('public.task_seq'::regclass);
