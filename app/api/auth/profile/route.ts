import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/auth';
import { cookies } from 'next/headers';

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

export async function PATCH(request: Request) {
  try {
    const session = await getSession();
    if (!session || !session.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = await request.json();
    const updateData: any = {};

    if (payload.lat !== undefined && payload.lng !== undefined) {
      updateData.lat = parseFloat(payload.lat);
      updateData.lng = parseFloat(payload.lng);
    }
    
    if (payload.imageUrl !== undefined) {
      updateData.imageUrl = payload.imageUrl;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No fields to update provided." }, { status: 400 });
    }

    const updatedUser = await prisma.user.update({
      where: { id: session.userId },
      data: updateData
    });

    return NextResponse.json({ message: "Profile updated successfully natively", user: updatedUser });
  } catch (error) {
    console.error("Profile mutation error", error);
    return NextResponse.json({ error: "Failed to update profile globally" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getSession();
    if (!session || !session.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (session.loginType === 'VENDOR') {
      await prisma.menuItem.deleteMany({ where: { vendorId: session.userId } });
      await prisma.order.deleteMany({ where: { vendorId: session.userId } });
    } else if (session.loginType === 'CUSTOMER') {
      await prisma.order.deleteMany({ where: { customerId: session.userId } });
    } else if (session.loginType === 'DELIVERY') {
      // Revert active jobs to open pool
      await prisma.order.updateMany({ 
         where: { deliveryPartnerId: session.userId, status: 'DELIVERING' }, 
         data: { deliveryPartnerId: null, status: 'READY' } 
      });
    }

    await prisma.user.delete({ where: { id: session.userId } });
    
    return NextResponse.json({ message: "Account wiped completely." });
  } catch(error) {
    console.error("Deletion error:", error);
    return NextResponse.json({ error: "Internal deletion failure." }, { status: 500 });
  }
}
