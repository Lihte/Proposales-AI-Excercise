import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || '',
});

export async function POST(request: NextRequest) {
  try {
    const { rfpText } = await request.json();

    if (!rfpText) {
      return NextResponse.json({ error: "RFP text is required" }, { status: 400 });
    }

    const prompt = `
Du är en assistent som extraherar information från förfrågningar (RFP) för event.

Extrahera följande från texten:
1. dates: datum för eventet (skriv som "start - slut" eller "ett datum")
2. guestCount: antal gäster (siffra)
3. eventType: typ av event (meeting, conference, wedding, etc.)
4. budgetRange: min och max budget (om angivet)
5. specialRequests: lista med specialkrav (t.ex. lunch, projektor, WiFi)

Returnera ENDAST JSON i detta format:
{
  "dates": "sträng eller null",
  "guestCount": siffra eller null,
  "eventType": "sträng",
  "budgetRange": { "min": siffra, "max": siffra } eller null,
  "specialRequests": ["sträng1", "sträng2"]
}

RFP Text:
${rfpText}
`;

    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama-3.3-70b-versatile",
      temperature: 0.1,
    });

    const responseText = completion.choices[0]?.message?.content || "{}";
    let cleanJson = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    let result;
    try {
      result = JSON.parse(cleanJson);
    } catch {
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Kunde inte tolka JSON");
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Extract error:", error);
    return NextResponse.json({ error: "Extraction failed" }, { status: 500 });
  }
}
