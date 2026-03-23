export async function onRequest(context) {
  const { request, env } = context

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Content-Type': 'application/json'
  }

  if (request.method === 'OPTIONS') {
    return new Response('', { status: 200, headers })
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers })
  }

  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers })
  }

  const SUPABASE_URL = env.SUPABASE_URL
  const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
  const STRIPE_SECRET_KEY = env.STRIPE_SECRET_KEY

  try {
    // JWTからユーザー情報取得
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': SERVICE_KEY
      }
    })
    const user = await userRes.json()
    if (!user?.id) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers })
    }

    // stripe_customer_idを取得
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?select=stripe_customer_id&id=eq.${user.id}&limit=1`,
      {
        headers: {
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`
        }
      }
    )
    const profiles = await profileRes.json()
    const stripeCustomerId = profiles?.[0]?.stripe_customer_id

    if (!stripeCustomerId) {
      return new Response(JSON.stringify({ error: 'No subscription found' }), { status: 404, headers })
    }

    // Billing Portal Sessionを作成
    const portalRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        customer: stripeCustomerId,
        return_url: 'https://shadowcast.app/'
      })
    })
    const portal = await portalRes.json()

    if (!portal.url) {
      return new Response(JSON.stringify({ error: 'Failed to create portal session' }), { status: 500, headers })
    }

    return new Response(JSON.stringify({ url: portal.url }), { status: 200, headers })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers })
  }
}
