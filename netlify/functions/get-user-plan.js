const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// 管理者メールアドレスリスト（環境変数から取得）
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim())

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Content-Type': 'application/json'
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  const token = event.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  try {
    // JWTを検証してユーザー情報取得
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) }
    }

    // 管理者チェック
    const isAdmin = ADMIN_EMAILS.includes(user.email)
    if (isAdmin) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ plan: 'pro', isAdmin: true })
      }
    }

    // 通常ユーザー: profilesテーブルからplan取得
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .single()

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ plan: profile?.plan || 'free', isAdmin: false })
    }
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error' }) }
  }
}
