import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || '',
});

async function extractRFP(rfpText: string) {
  const response = await fetch("http://localhost:3000/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rfpText })
  });
  const data = await response.json();
  return data;
}

async function searchProducts(query: string) {
  const response = await fetch("http://localhost:3000/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, topK: 8 })
  });
  const data = await response.json();
  return data.results || [];
}

export async function POST(request: NextRequest) {
  try {
    const { rfpText } = await request.json();

    if (!rfpText) {
      return NextResponse.json({ error: "RFP text is required" }, { status: 400 });
    }

    console.log("📋 Extraherar RFP-information...");
    const extracted = await extractRFP(rfpText);
    
    console.log("🔍 Söker efter produkter...");
    const products = await searchProducts(rfpText);
    
    const prompt = `
Du är en planeringsassistent för event-proposals.

Extraherad information från RFP:
${JSON.stringify(extracted, null, 2)}

Tillgängliga produkter (med relevanspoäng):
${JSON.stringify(products, null, 2)}

Uppgift: Skapa en plan för proposal. Välj de mest relevanta produkterna och bestäm ordningen.

Returnera ENDAST JSON i detta format:
{
  "selectedProducts": [
    { "title": "Produktnamn", "reason": "Varför den passar", "order": 1 }
  ],
  "summary": "Kort sammanfattning av planen",
  "totalEstimatedPrice": siffra
}
`;

    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama-3.3-70b-versatile",
      temperature: 0.3,
    });

    const responseText = completion.choices[0]?.message?.content || "{}";
    let cleanJson = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
    const plan = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(cleanJson);

    return NextResponse.json({
      extracted,
      matchedProducts: products,
      plan
    });
  } catch (error) {
    console.error("Plan error:", error);
    return NextResponse.json({ error: "Planning failed" }, { status: 500 });
  }
}
