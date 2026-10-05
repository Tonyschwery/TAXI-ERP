import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/\D/g, ''); 
  if (cleaned.startsWith('961') && cleaned.length >= 10) {
    cleaned = cleaned.substring(3);
  } else if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }
  return `+961${cleaned}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const phoneParam = searchParams.get('phone')

  if (!phoneParam) {
    return NextResponse.json({ error: 'Phone number is required' }, { status: 400 })
  }

  const normalizedPhone = normalizePhone(phoneParam)
  const supabase = await createClient()

  const { data: customer, error } = await supabase
    .from('customers')
    .select('*')
    .eq('phone', normalizedPhone)
    .single()

  if (error || !customer) {
    return NextResponse.json({ 
      found: false, 
      normalizedPhone,
      message: 'Customer not found' 
    })
  }

  return NextResponse.json({
    found: true,
    normalizedPhone,
    customer
  })
}
