import { NextRequest, NextResponse } from 'next/server';
import { searchProducts } from '@/app/lib/retrieval';

export async function POST(request: NextRequest) {
  try {
    const { query, topK = 5 } = await request.json();
    
    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }
    
    const results = await searchProducts(query, topK);
    return NextResponse.json({ results });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
