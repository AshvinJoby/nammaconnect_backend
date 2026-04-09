import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const vendors = await prisma.user.findMany({
      where: { loginType: 'VENDOR' },
      select: {
        id: true,
        name: true,
        lat: true,
        lng: true,
        imageUrl: true,
        createdAt: true,
      },
    });

    const vendorIds = vendors.map(v => v.id);
    const menuItems = await prisma.menuItem.findMany({
      where: { vendorId: { in: vendorIds }, isAvailable: true }
    });

    const vendorsWithMenus = vendors.map(v => ({
      ...v,
      menuItems: menuItems.filter(m => m.vendorId === v.id)
    }));

    return NextResponse.json(vendorsWithMenus);
  } catch (error) {
    console.error('Failed to fetch vendors:', error);
    return NextResponse.json({ error: 'Failed to Fetch Vendors' }, { status: 500 });
  }
}
