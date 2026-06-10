// lib/anthropic.ts
// Server-side wrapper for Anthropic Claude API. Uses raw fetch to avoid SDK overhead.

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-haiku-4-5-20251001' // Fast + cheap for parsing tasks

export type AnthropicMessage = {
  role: 'user' | 'assistant'
  content: string
}

export async function callClaude({
  system,
  messages,
  maxTokens = 1024,
}: {
  system?:    string
  messages:   AnthropicMessage[]
  maxTokens?: number
}): Promise<{ text: string; error?: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { text: '', error: 'ANTHROPIC_API_KEY not configured' }
  }

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: maxTokens,
        system,
        messages,
      }),
    })

    if (!res.ok) {
      const err = await res.text().catch(() => 'Unknown error')
      console.error('[anthropic]', res.status, err)
      return { text: '', error: `API error ${res.status}` }
    }

    const data = await res.json()
    const text = data?.content?.[0]?.text ?? ''
    return { text }
  } catch (e) {
    console.error('[anthropic] network', e)
    return { text: '', error: 'Network error' }
  }
}

// Strips markdown code fences and other common LLM output noise
export function extractJson(text: string): unknown | null {
  // Try direct parse first
  try { return JSON.parse(text) } catch {}

  // Try removing ```json ... ``` fences
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/)
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1]) } catch {}
  }

  // Try finding first { and last }
  const start = text.indexOf('{')
  const end   = text.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)) } catch {}
  }

  return null
}
