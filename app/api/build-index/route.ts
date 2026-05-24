import { NextResponse } from 'next/server';
import { buildIndex } from '@/app/lib/retrieval';

export async function POST() {
  try {
    await buildIndex();
    return NextResponse.json({ message: "Index built successfully" });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to build index" }, { status: 500 });
  }
}
