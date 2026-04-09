import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { comparePasswords, createSession } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { name, password, loginType } = await request.json();

    if (!name || !password || !loginType) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Find the user by name
    const user = await prisma.user.findUnique({
      where: { name },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid name or password' },
        { status: 401 }
      );
    }

    // Optional: we can verify they are logging in the correct portal (Customer vs Vendor)
    if (user.loginType !== loginType) {
      return NextResponse.json(
        { error: 'Invalid role. Please select the correct login type.' },
        { status: 403 }
      );
    }

    // Verify password
    const isPasswordValid = await comparePasswords(password, user.password);

    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Invalid name or password' },
        { status: 401 }
      );
    }

    // Create a session cookie
    await createSession(user.id, user.name, user.loginType);

    return NextResponse.json({
      message: 'Login successful',
      user: { id: user.id, name: user.name, loginType: user.loginType },
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
