import { NextResponse } from 'next/server';

const API_KEY = "ps.fdacb984511b4c0191c358d7024a4db4.a9dd2e614bf0427e85b34954499d1686c888b39c58e44928ad00984a2595e2c1";

export async function GET() {
  try {
    const response = await fetch("https://api.proposales.com/v3/content", {
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      }
    });
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}
