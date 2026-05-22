export type UserRole = 'customer' | 'runner' | 'admin'

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'awaiting_runner'
  | 'runner_assigned'
  | 'preparing'
  | 'picked_up'
  | 'delivered'
  | 'cancelled'
  | 'needs_attention'

export type PaymentStatus = 'pending' | 'success' | 'failed'
export type PaymentChannel = 'transfer' | 'ussd' | 'card'

export interface User {
  id: string
  phone: string
  email?: string
  full_name: string
  role: UserRole
  matric_number?: string
  is_active: boolean
  created_at: string
}

export interface Restaurant {
  id: string
  name: string
  location: string
  image_url?: string
  emoji: string
  is_open: boolean
  avg_prep_time: number
  avg_restaurant_rating?: number
  restaurant_rating_count?: number
  created_at: string
}

export interface MenuItem {
  id: string
  restaurant_id: string
  name: string
  description?: string
  price: number
  image_url?: string
  category: string
  is_available: boolean
  is_featured?:  boolean
  // Portion pricing — only set on applicable items (rice, spaghetti etc)
    has_portions?:       boolean
    portion_min_price?:  number
    portion_first_step?: number
    portion_step?:       number
    portion_max_price?:  number
}

export interface CartItem {
  menu_item_id: string
  name: string
  price: number
  quantity: number
  options?: {
    swallow?: 'garri' | 'fufu'
    portions?: Array<{ price: number; quantity: number }>
    // Items bundled onto this plate (protein, extras chosen during portion flow)
    addons?: Array<{
      menu_item_id: string
      name: string
      price: number            // 0 for portioned addons — use portions instead
      quantity: number         // 0 for portioned addons — use portions instead
      portions?: Array<{ price: number; quantity: number }>  // set when addon has_portions
    }>
  }
}

export interface Order {
  id: string
  order_ref: string
  customer_id: string
  restaurant_id: string
  runner_id?: string
  items: CartItem[]
  delivery_address: string
  food_total: number
  delivery_fee: number
  platform_cut: number
  runner_earnings: number
  status: OrderStatus
  broadcast_at?: string
  broadcast_count: number
  delivery_code?: string
  cancelled_by?: 'customer' | 'runner'
  cancel_reason?: string
  cancelled_at?: string
  order_notes?: string
  created_at: string
  delivered_at?: string
  restaurant?: Restaurant | { name: string; location?: string }
  customer?: User | { full_name: string; phone: string }
  runner?: User | { full_name: string; phone: string }
}

export interface Payment {
  id: string
  order_id: string
  paystack_ref: string
  amount: number
  status: PaymentStatus
  channel: PaymentChannel
  paid_at?: string
}

export interface RunnerProfile {
  user_id: string
  is_available: boolean
  is_featured?:  boolean
  total_deliveries: number
  total_earnings: number
  bank_name?: string
  account_number?: string
  rating: number
  user?: User
}

export interface ApiResponse<T> {
  data?: T
  error?: string
}

export interface PaystackInitResponse {
  authorization_url: string
  access_code: string
  reference: string
}
