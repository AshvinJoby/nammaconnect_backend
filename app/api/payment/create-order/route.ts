import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/auth';
import { cookies } from 'next/headers';
import Razorpay from 'razorpay';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'dummy_key',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'dummy_secret'
});

async function getSession() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session')?.value;
  if (!sessionToken) return null;
  
  try {
    return await decrypt(sessionToken);
  } catch (err) {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session || session.loginType !== 'CUSTOMER') {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
    }

    const { vendorId, items } = await request.json();
    if (!vendorId || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Missing vendorId or items array' }, { status: 400 });
    }

    let grandTotal = 0;

    for (const cartItem of items) {
      const requestedQty = parseInt(cartItem.quantity, 10);
      if (requestedQty <= 0) return NextResponse.json({ error: 'Invalid quantity' }, { status: 400 });
      
      const menuItem = await prisma.menuItem.findFirst({
        where: { id: cartItem.id, vendorId, isAvailable: true }
      });

      if (!menuItem) {
        return NextResponse.json({ error: `Item ${cartItem.name} not available` }, { status: 404 });
      }

      grandTotal += menuItem.price * requestedQty;
    }

    // Razorpay amount is in minimum currency unit (paisa). ₹1 = 100 paisa.
    const amountInPaisa = Math.round(grandTotal * 100);

    const paymentOrder = await razorpay.orders.create({
      amount: amountInPaisa,
      currency: "INR",
      receipt: `receipt_${Date.now()}`
    });

    return NextResponse.json({ 
      orderId: paymentOrder.id, 
      amount: paymentOrder.amount,
      currency: paymentOrder.currency 
    });

  } catch (error) {
    console.error('Failed to create Razorpay order:', error);
    return NextResponse.json({ error: 'Failed to create payment' }, { status: 500 });
  }
}
