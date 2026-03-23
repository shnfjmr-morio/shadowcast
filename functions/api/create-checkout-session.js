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
  const STRIPE_PRICE_ID = env.STRIPE_PRICE_ID

  try {
    // JWTからユーザー情報取得
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': SERVICE_KEY
      }
    })
    if (!userRes.ok) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers })
    }
    const user = await userRes.json()
    if (!user?.id) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers })
    }

    // 既存のstripe_customer_idを取得
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
    let stripeCustomerId = profiles?.[0]?.stripe_customer_id

    // Stripeカスタマーが未作成なら作成
    if (!stripeCustomerId) {
      const customerRes = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          email: user.email,
          'metadata[supabase_id]': user.id
        })
      })
      const customer = await customerRes.json()
      stripeCustomerId = customer.id

      // stripe_customer_idをSupabaseに保存
      await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SERVICE_KEY,
            'Authorization': `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({ stripe_customer_id: stripeCustomerId })
        }
      )
    }

    // Checkout Sessionを作成
    const sessionRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        customer: stripeCustomerId,
        'line_items[0][price]': STRIPE_PRICE_ID,
        'line_items[0][quantity]': '1',
        mode: 'subscription',
        success_url: 'https://shadowcast.app/?payment=success',
        cancel_url: 'https://shadowcast.app/?payment=cancelled',
        'metadata[supabase_id]': user.id
      })
    })
    const session = await sessionRes.json()

    if (!session.url) {
      return new Response(JSON.stringify({ error: 'Failed to create session' }), { status: 500, headers })
    }

    return new Response(JSON.stringify({ url: session.url }), { status: 200, headers })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers })
  }
}
