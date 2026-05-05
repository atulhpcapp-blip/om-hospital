import { createClient } from '@supabase/supabase-js'
const URL  = 'https://wlgbhrmycequuiabpwqf.supabase.co'
const KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Jocm15Y2VxdXVpYWJwd3FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxODIwMjAsImV4cCI6MjA5Mjc1ODAyMH0.9cDZdZufK0EcWWjIpqp3gLPlwfKVvs5LEOLnw8wM4dw'
export const supabase = createClient(URL, KEY)
