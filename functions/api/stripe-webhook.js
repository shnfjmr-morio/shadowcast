async function verifyStripeSignature(body, signature, secret) {
  const elements = signature.split(',')
  const timestamp = elements.find(e => e.startsWith('t=')).slice(2)
  const v1 = elements.find(e => e.startsWith('v1=')).slice(3)

  const signedPayload = `${timestamp}.${body}`
  const encoder = new TextEncoder()

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload))
  const expected = Array.from(new Uint8Array(sigBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  if (expected !== v1) throw new Error('Invalid signature')

  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - parseInt(timestamp)) > 300) throw new Error('Timestamp too old')
}

export async function onRequest(context) {
  const { request, env } = context

  const headers = { 'Content-Type': 'application/json' }

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return new Response(JSON.stringify({ error: 'Missing signature' }), { status: 400, headers })
  }

  const STRIPE_WEBHOOK_SECRET = env.STRIPE_WEBHOOK_SECRET
  const SUPABASE_URL = env.SUPABASE_URL
  const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY

  const body = await request.text()

  try {
    await verifyStripeSignature(body, signature, STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 400, headers })
  }

  const event = JSON.parse(body)

  try {
    // 決済完了 → planをproに更新
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      const supabaseId = session.metadata?.supabase_id
      if (supabaseId) {
        await fetch(
          `${SUPABASE_URL}/rest/v1/profiles?id=eq.${supabaseId}`,
          {
            method: 'PATCH',
            headers: {
              'apikey': SERVICE_KEY,
              'Authorization': `Bearer ${SERVICE_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ plan: 'pro' })
          }
        )
      }
    }

    // サブスクリプションキャンセル → planをfreeに戻す
    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object
      const stripeCustomerId = subscription.customer

      // stripe_customer_idからsupabaseユーザーを検索
      const profileRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?select=id&stripe_customer_id=eq.${stripeCustomerId}&limit=1`,
        {
          headers: {
            'apikey': SERVICE_KEY,
            'Authorization': `Bearer ${SERVICE_KEY}`
          }
        }
      )
      const profiles = await profileRes.json()
      const supabaseId = profiles?.[0]?.id

      if (supabaseId) {
        await fetch(
          `${SUPABASE_URL}/rest/v1/profiles?id=eq.${supabaseId}`,
          {
            method: 'PATCH',
            headers: {
              'apikey': SERVICE_KEY,
              'Authorization': `Bearer ${SERVICE_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ plan: 'free' })
          }
        )
      }
    }

    return new Response(JSON.stringify({ received: true }), { status: 200, headers })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Handler error' }), { status: 500, headers })
  }
}
