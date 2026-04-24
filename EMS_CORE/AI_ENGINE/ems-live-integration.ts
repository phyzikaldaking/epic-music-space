// EMS LIVE DATA + SOCIAL API INTEGRATION

import { createClient } from '@supabase/supabase-js'
import axios from 'axios'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// =============================
// FETCH REAL PLATFORM DATA
// =============================

export async function getEMSPlatformData() {
  const { data: users } = await supabase.from('users').select('*')
  const { data: transactions } = await supabase.from('transactions').select('*')
  const { data: sessions } = await supabase.from('sessions').select('*')

  return {
    totalUsers: users?.length || 0,
    totalRevenue: transactions?.reduce((a, b) => a + (b.amount || 0), 0) || 0,
    engagementRate: (sessions?.length || 0) / (users?.length || 1)
  }
}

// =============================
// TWITTER POSTING
// =============================

export async function postToTwitter(content: any) {
  await axios.post('https://api.twitter.com/2/tweets', {
    text: content.caption
  }, {
    headers: {
      Authorization: `Bearer ${process.env.TWITTER_BEARER_TOKEN}`
    }
  })
}

// =============================
// INSTAGRAM POSTING
// =============================

export async function postToInstagram(content: any) {
  await axios.post(`https://graph.facebook.com/v18.0/${process.env.IG_USER_ID}/media`, {
    caption: content.caption,
    image_url: content.image || 'https://your-default-image.com'
  }, {
    params: {
      access_token: process.env.IG_ACCESS_TOKEN
    }
  })
}

// =============================
// CONNECT AI → LIVE DATA
// =============================

import { EMS_AI_COUNCIL, GENERATE_MARKETING_CONTENT } from './ems-multi-agent-system'

export async function EMS_LIVE_AUTONOMY() {
  const state = await getEMSPlatformData()

  const decisions = await EMS_AI_COUNCIL(state)

  const content = await GENERATE_MARKETING_CONTENT(state)

  await postToTwitter(content)
  await postToInstagram(content)

  return {
    state,
    decisions,
    content
  }
}
