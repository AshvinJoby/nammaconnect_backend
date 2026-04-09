import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import { decrypt } from '@/lib/auth';
import { cookies } from 'next/headers';
import Razorpay from 'razorpay';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!
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

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { userId, loginType } = session;

    let orders;
    if (loginType === 'VENDOR') {
      orders = await prisma.order.findMany({
        where: { vendorId: userId },
        orderBy: { createdAt: 'desc' },
      });
    } else if (loginType === 'DELIVERY') {
      orders = await prisma.order.findMany({
        where: {
          OR: [
            { status: 'READY', deliveryPartnerId: null },
            { deliveryPartnerId: userId }
          ]
        },
        orderBy: { createdAt: 'desc' },
      });
    } else {
      orders = await prisma.order.findMany({
        where: { customerId: userId },
        orderBy: { createdAt: 'desc' },
      });
    }

    return NextResponse.json(orders);
  } catch (error) {
    console.error('Failed to fetch orders:', error);
    return NextResponse.json({ error: 'Failed to Fetch Orders' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session || session.loginType !== 'CUSTOMER') {
      return NextResponse.json({ error: 'Unauthorized. Only customers can place orders.' }, { status: 403 });
    }

    const { vendorId, items, razorpay_payment_id, razorpay_order_id, razorpay_signature, paymentMethod = 'COD' } = await request.json();
    if (!vendorId || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Missing vendorId or items array' }, { status: 400 });
    }

    if (paymentMethod === 'RAZORPAY') {
      if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
         return NextResponse.json({ error: 'Missing payment signature. Please complete payment.' }, { status: 400 });
      }

      // Verify signature
      const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!);
      hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
      const generatedSignature = hmac.digest('hex');

      if (generatedSignature !== razorpay_signature) {
         return NextResponse.json({ error: 'Invalid payment signature. Payment spoofing detected.' }, { status: 400 });
      }
    }

    let grandTotal = 0;
    const itemNames = [];

    for (const cartItem of items) {
      const requestedQty = parseInt(cartItem.quantity, 10);
      if (requestedQty <= 0) return NextResponse.json({ error: 'Invalid quantity for ' + cartItem.name }, { status: 400 });
      
      const menuItem = await prisma.menuItem.findFirst({
        where: { id: cartItem.id, vendorId, isAvailable: true }
      });

      if (!menuItem) {
        return NextResponse.json({ error: `Item ${cartItem.name} not found or unavailable` }, { status: 404 });
      }

      grandTotal += menuItem.price * requestedQty;
      itemNames.push(`${requestedQty}x ${menuItem.name}`);
    }

    const orderString = itemNames.join(', ');

    const customerInfo = await prisma.user.findUnique({ where: { id: session.userId } });
    const vendorInfo = await prisma.user.findUnique({ where: { id: vendorId } });

    const newOrder = await prisma.order.create({
      data: {
        item: orderString,
        status: 'PENDING',
        vendorId,
        customerId: session.userId,
        customerName: session.name,
        quantity: 1,
        price: grandTotal,
        paymentMethod: paymentMethod,
        paymentId: paymentMethod === 'RAZORPAY' ? razorpay_payment_id : null,
        vLat: vendorInfo?.lat,
        vLng: vendorInfo?.lng,
        cLat: customerInfo?.lat,
        cLng: customerInfo?.lng,
      },
    });

    return NextResponse.json({ message: 'Order placed successfully', order: newOrder }, { status: 201 });
  } catch (error) {
    console.error('Failed to place order:', error);
    return NextResponse.json({ error: 'Failed to Place Order' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
    }

    const { orderId, newStatus } = await request.json();
    if (!orderId || !newStatus) return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });

    const existingOrder = await prisma.order.findUnique({ where: { id: orderId } });
    if (!existingOrder) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    if (session.loginType === 'VENDOR' && existingOrder.vendorId !== session.userId) {
       return NextResponse.json({ error: 'Unauthorized vendor.' }, { status: 403 });
    }
    if (session.loginType === 'CUSTOMER') {
       if (existingOrder.customerId !== session.userId) return NextResponse.json({ error: 'Unauthorized customer.' }, { status: 403 });
       if (newStatus !== 'DECLINED') return NextResponse.json({ error: 'Customers can only cancel orders.' }, { status: 403 });
       if (existingOrder.status !== 'PENDING') return NextResponse.json({ error: 'Order is already being processed and cannot be cancelled.' }, { status: 400 });
    }
    if (session.loginType === 'DELIVERY') {
       if (newStatus === 'DELIVERING') {
          if (existingOrder.status !== 'READY' || existingOrder.deliveryPartnerId) {
             return NextResponse.json({ error: 'Order is no longer available.' }, { status: 400 });
          }
          const order = await prisma.order.update({
            where: { id: orderId },
            data: { status: 'DELIVERING', deliveryPartnerId: session.userId }
          });
          return NextResponse.json({ message: 'Order Accepted!', order });
       }
       if (newStatus === 'FINISHED') {
          if (existingOrder.deliveryPartnerId !== session.userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
          const order = await prisma.order.update({
            where: { id: orderId },
            data: { status: 'FINISHED' }
          });
          return NextResponse.json({ message: 'Delivery Complete!', order });
       }
       return NextResponse.json({ error: 'Invalid delivery operation.' }, { status: 400 });
    }

    if (existingOrder.status === 'DECLINED') return NextResponse.json({ error: 'Already declined' }, { status: 400 });

    if (newStatus === 'DECLINED') {
      if (existingOrder.paymentMethod === 'RAZORPAY' && existingOrder.paymentId) {
         try {
            // @ts-ignore
            await razorpay.payments.refund(existingOrder.paymentId);
         } catch(err) {
            console.error("Razorpay refund failed:", err);
         }
      }

      const order = await prisma.order.update({
        where: { id: orderId },
        data: { status: newStatus }
      });
      return NextResponse.json({ message: 'Order declined and refunded', order });
    } else {
       const order = await prisma.order.update({
         where: { id: orderId },
         data: { status: newStatus }
       });
       return NextResponse.json({ message: 'Status updated', order });
    }
  } catch(error) {
    console.error('Failed to update status', error);
    return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
  }
}
