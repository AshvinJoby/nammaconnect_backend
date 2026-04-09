import { NextResponse } from 'next/server';
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    if (!process.env.IMGBB_API_KEY) {
      return NextResponse.json({ error: 'System architecture improperly scaled! Missing Image API Key.' }, { status: 500 });
    }

    // Pass the natively uploaded boundaries directly onto IMGBB Form
    const imgbbFormData = new FormData();
    imgbbFormData.append("image", file);

    const imgbbRes = await fetch(`https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API_KEY}`, {
      method: "POST",
      body: imgbbFormData
    });

    const imgData = await imgbbRes.json();

    if (!imgData.success) {
      return NextResponse.json({ error: 'Blob rejection from external image server.' }, { status: 500 });
    }

    // IMGBB dynamically pipes out the fully persistent URL!
    return NextResponse.json({ url: imgData.data.url }, { status: 200 });
  } catch (error) {
    console.error('File Upload error:', error);
    return NextResponse.json({ error: 'Internal File Cloud Relay failed' }, { status: 500 });
  }
}

