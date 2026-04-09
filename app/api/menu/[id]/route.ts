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

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session || session.loginType !== 'VENDOR') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    await prisma.menuItem.delete({
      where: {
        id: params.id,
        vendorId: session.userId
      }
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete menu item:', error);
    return NextResponse.json({ error: 'Failed to delete menu item' }, { status: 500 });
  }
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session || session.loginType !== 'VENDOR') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { isAvailable } = await request.json();
    const updatedItem = await prisma.menuItem.update({
      where: {
        id: params.id,
        vendorId: session.userId
      },
      data: { isAvailable }
    });
    return NextResponse.json(updatedItem);
  } catch (error) {
    console.error('Failed to update menu item:', error);
    return NextResponse.json({ error: 'Failed to update menu item' }, { status: 500 });
  }
}
