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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const vendorIdParam = searchParams.get('vendorId');

    // If vendorId is provided in URL, return that vendor's menu items
    if (vendorIdParam) {
      const items = await prisma.menuItem.findMany({
        where: { vendorId: vendorIdParam, isAvailable: true },
        orderBy: { createdAt: 'desc' }
      });
      return NextResponse.json(items);
    }

    // Otherwise, must be authenticated to view own menu items
    const session = await getSession();
    if (!session || session.loginType !== 'VENDOR') {
      return NextResponse.json({ error: 'Unauthorized to view private menu.' }, { status: 401 });
    }

    const items = await prisma.menuItem.findMany({
      where: { vendorId: session.userId },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(items);
  } catch (error) {
    console.error('Failed to fetch menu items:', error);
    return NextResponse.json({ error: 'Failed to fetch menu items' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session || session.loginType !== 'VENDOR') {
      return NextResponse.json({ error: 'Unauthorized. Only vendors can manage their menus.' }, { status: 403 });
    }

    const { name, price, imageUrl } = await request.json();

    if (!name || price === undefined) {
      return NextResponse.json({ error: 'Missing name or price' }, { status: 400 });
    }

    const newItem = await prisma.menuItem.create({
      data: {
        name,
        price: parseFloat(price),
        isAvailable: true,
        imageUrl: imageUrl || null,
        vendorId: session.userId,
      },
    });

    return NextResponse.json({ message: 'Menu item created successfully', item: newItem }, { status: 201 });
  } catch (error) {
    console.error('Failed to create menu item:', error);
    return NextResponse.json({ error: 'Failed to create menu item' }, { status: 500 });
  }
}
