import { createClient } from '@supabase/supabase-js'
const URL  = 'https://wlgbhrmycequuiabpwqf.supabase.co'
const KEY  = 'sb_publishable_1I_V4RUqeSpzu7d0NXlhVg_z4rs0UbZ'
export const supabase = createClient(URL, KEY)
