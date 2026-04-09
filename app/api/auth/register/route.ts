import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, createSession } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { name, password, loginType, lat, lng } = await request.json();

    if (!name || !password || !loginType || lat === undefined || lng === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields, including location coordinates' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { name },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this name already exists' },
        { status: 409 }
      );
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        password: hashedPassword,
        loginType, // "CUSTOMER" or "VENDOR"
        lat: parseFloat(lat),
        lng: parseFloat(lng),
      },
    });

    // Automatically log in the user after successful registration
    await createSession(user.id, user.name, user.loginType);

    return NextResponse.json(
      { message: 'Registration successful', user: { id: user.id, name: user.name, loginType: user.loginType } },
      { status: 201 }
    );
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
