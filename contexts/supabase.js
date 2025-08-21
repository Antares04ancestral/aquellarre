import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://czvsmndotmafwmvrnwyb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6dnNtbmRvdG1hZndtdnJud3liIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg1MzQ1MTYsImV4cCI6MjA2NDExMDUxNn0.c0gFeLEnzI5KbAjh3ze97oSdxGUvbOtpLFVJCX6qfSw';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);