// lib/order-parser.ts
// Keyword-based order parser. No external API calls, no ongoing costs.
// Returns a confidence score so callers can decide whether to auto-confirm or escalate to a human.

export type ParsedItem = {
  menu_item_id:    string
  name:            string
  price:           number
  quantity:        number
  restaurant_id:   string
  restaurant_name: string
}

export type ParseResult = {
  ok:              boolean
  items:           ParsedItem[]
  message:         string
  confidence:      'high' | 'medium' | 'low' | 'none'
  suggestions?:    string[]
}

type Restaurant = { id: string; name: string; is_open: boolean }
type MenuItem   = { id: string; name: string; price: number; restaurant_id: string }

/**
 * Normalize text for matching: lowercase, strip punctuation, collapse whitespace.
 * Handles apostrophes ("amanam's" → "amanams"), curly quotes, em dashes, etc.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, '')  // smart single quotes
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '')  // smart double quotes
    .replace(/[^a-z0-9\s]/g, ' ')                            // punctuation → space
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Generate aliases for a name. "Amanam's Restaurant" → ["amanam restaurant", "amanams restaurant", "amanam"]
 */
function aliasesFor(name: string): string[] {
  const norm = normalize(name)
  const tokens = norm.split(' ').filter(t => t.length > 1)
  const set = new Set<string>()
  set.add(norm)
  // Each token alone if it's distinctive enough (length >= 4)
  for (const t of tokens) {
    if (t.length >= 4 && !COMMON_WORDS.has(t)) set.add(t)
  }
  // First two tokens together for multi-word names
  if (tokens.length >= 2) set.add(tokens.slice(0, 2).join(' '))
  return Array.from(set)
}

const COMMON_WORDS = new Set([
  'the', 'and', 'with', 'from', 'for', 'restaurant', 'kitchen', 'place',
  'food', 'foods', 'eatery', 'spot', 'bistro', 'cafe', 'rice', 'special',
])

// English number words for quantity extraction
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10,
  a: 1, an: 1, // "a coke", "an egg"
}

/**
 * Extract quantity that precedes an item match in the text.
 * Looks at the word(s) immediately before the match position.
 */
function extractQuantity(text: string, matchStart: number): number {
  // Get up to 3 words before the match
  const before = text.slice(0, matchStart).trim().split(/\s+/).slice(-3)
  // Walk backwards looking for a number
  for (let i = before.length - 1; i >= 0; i--) {
    const word = before[i]
    if (/^\d+$/.test(word)) {
      const n = parseInt(word)
      if (n >= 1 && n <= 20) return n
    }
    if (NUMBER_WORDS[word]) return NUMBER_WORDS[word]
  }
  return 1 // default
}

/**
 * Main parser. Returns structured items with confidence score.
 */
export function parseOrder(
  rawText: string,
  restaurants: Restaurant[],
  menuItems:   MenuItem[],
): ParseResult {
  const text  = normalize(rawText)
  const items: ParsedItem[] = []
  const matchedRestaurantIds = new Set<string>()
  const matchedItemPositions: Array<{ position: number; item: MenuItem }> = []

  // ── Pass 1: detect restaurants mentioned ───────────────────────────────
  const restaurantMatches = new Map<string, number>() // restaurant_id → first match position
  for (const r of restaurants) {
    if (!r.is_open) continue
    const aliases = aliasesFor(r.name)
    for (const alias of aliases) {
      const idx = text.indexOf(alias)
      if (idx >= 0) {
        if (!restaurantMatches.has(r.id) || (restaurantMatches.get(r.id) ?? Infinity) > idx) {
          restaurantMatches.set(r.id, idx)
        }
      }
    }
  }

  // ── Pass 2: detect menu items ──────────────────────────────────────────
  // Search for each menu item by name, longest names first to avoid "rice" matching before "jollof rice"
  const sortedItems = [...menuItems].sort((a, b) => b.name.length - a.name.length)
  const claimedRanges: Array<[number, number]> = []

  for (const m of sortedItems) {
    const aliases = aliasesFor(m.name)
    for (const alias of aliases) {
      let from = 0
      while (true) {
        const idx = text.indexOf(alias, from)
        if (idx < 0) break
        // Make sure this range isn't already claimed by a longer match
        const overlaps = claimedRanges.some(([s, e]) => idx < e && idx + alias.length > s)
        if (!overlaps) {
          matchedItemPositions.push({ position: idx, item: m })
          claimedRanges.push([idx, idx + alias.length])
          break // only match each item once per restaurant
        }
        from = idx + 1
      }
    }
  }

  // ── Pass 3: filter by restaurant context ───────────────────────────────
  // If user explicitly named a restaurant, only count items from that restaurant
  let targetRestaurantId: string | null = null
  if (restaurantMatches.size === 1) {
    targetRestaurantId = Array.from(restaurantMatches.keys())[0]
  } else if (restaurantMatches.size > 1) {
    // Multiple restaurants mentioned — ambiguous, low confidence
    return {
      ok: false,
      items: [],
      message: 'You mentioned more than one restaurant. For now, please order from one place at a time.',
      confidence: 'low',
      suggestions: Array.from(restaurantMatches.keys())
        .map(id => restaurants.find(r => r.id === id)?.name)
        .filter((n): n is string => !!n)
        .map(name => `Just from ${name}?`),
    }
  }

  // ── Pass 4: build the item list ────────────────────────────────────────
  for (const match of matchedItemPositions) {
    if (targetRestaurantId && match.item.restaurant_id !== targetRestaurantId) continue

    // If no restaurant was named, pick the cheapest matching item across all open restaurants
    const r = restaurants.find(r => r.id === match.item.restaurant_id)
    if (!r || !r.is_open) continue

    const quantity = extractQuantity(text, match.position)

    items.push({
      menu_item_id:    match.item.id,
      name:            match.item.name,
      price:           match.item.price,
      quantity,
      restaurant_id:   match.item.restaurant_id,
      restaurant_name: r.name,
    })
    matchedRestaurantIds.add(match.item.restaurant_id)
  }

  // ── If no restaurant specified, items might span multiple. Pick the one with the most items.
  if (!targetRestaurantId && matchedRestaurantIds.size > 1) {
    const counts: Record<string, number> = {}
    for (const item of items) counts[item.restaurant_id] = (counts[item.restaurant_id] ?? 0) + 1
    const winner = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
    // Drop items not from the winning restaurant
    const filtered = items.filter(i => i.restaurant_id === winner)
    items.length = 0
    items.push(...filtered)
  }

  // ── Determine confidence ───────────────────────────────────────────────
  if (items.length === 0) {
    return {
      ok: false,
      items: [],
      message: 'Hmm, I couldn\'t match anything from the menu. Want me to send this to our team instead?',
      confidence: 'none',
    }
  }

  // Items present but no restaurant explicitly named → medium confidence
  const restaurantWasNamed = targetRestaurantId !== null
  const allItemsMatched   = matchedItemPositions.length === items.length
  let confidence: ParseResult['confidence'] = 'low'

  if (restaurantWasNamed && items.length >= 1) confidence = 'high'
  else if (items.length >= 1) confidence = 'medium'

  const totalQty = items.reduce((s, i) => s + i.quantity, 0)
  const message = items.length === 1
    ? `Got it — ${items[0].quantity}× ${items[0].name} from ${items[0].restaurant_name}?`
    : `Got it — ${totalQty} items from ${items[0].restaurant_name}?`

  return {
    ok: true,
    items,
    message,
    confidence,
  }
}
