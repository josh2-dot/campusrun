import { Suspense } from 'react'
import SignupForm from './SignupForm'

export default function SignupPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#FF6B2B', fontSize: 40 }}>🚀</div>}>
      <SignupForm />
    </Suspense>
  )
}
