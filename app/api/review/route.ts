import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || '',
});

const PROPOSALES_API_KEY = process.env.PROPOSALES_API_KEY || '';

async function getProposal(uuid: string) {
  const response = await fetch(`https://api.proposales.com/v3/proposals/${uuid}`, {
    headers: { "Authorization": `Bearer ${PROPOSALES_API_KEY}` }
  });
  const data = await response.json();
  return data.data;
}

async function extractRFP(rfpText: string) {
  const response = await fetch("http://localhost:3000/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rfpText })
  });
  return await response.json();
}

export async function POST(request: NextRequest) {
  try {
    const { proposalUuid, rfpText } = await request.json();

    if (!proposalUuid || !rfpText) {
      return NextResponse.json({ error: "proposalUuid and rfpText are required" }, { status: 400 });
    }

    console.log("📦 Hämtar proposal från Proposales...");
    const proposal = await getProposal(proposalUuid);
    
    console.log("📋 Extraherar RFP-information...");
    const rfpStructure = await extractRFP(rfpText);

    const prompt = `
Du är en kvalitetsgranskare för event-proposals.

**Original RFP:**
${rfpText}

**Extraherad RFP-struktur:**
${JSON.stringify(rfpStructure, null, 2)}

**Skapad proposal:**
Titel: ${proposal.title || 'N/A'}
Beskrivning: ${proposal.description_md || 'N/A'}
Antal blocks: ${proposal.blocks?.length || 0}
Total värde: ${proposal.value_with_tax || 0} EUR

**Uppgift:** Jämför proposal med RFP och flagga brister.

Returnera ENDAST JSON:
{
  "gaps": [
    { "type": "missing_requirement | price_mismatch | missing_product", "description": "...", "severity": "high|medium|low" }
  ],
  "summary": "Kort sammanfattning",
  "overallScore": 75
}
`;

    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama-3.3-70b-versatile",
      temperature: 0.2,
    });

    const responseText = completion.choices[0]?.message?.content || "{}";
    let cleanJson = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
    const review = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(cleanJson);

    return NextResponse.json({
      proposalUuid,
      rfpExtracted: rfpStructure,
      review,
      mode: "online"
    });

  } catch (error) {
    console.error("Review error:", error);
    return NextResponse.json({ error: "Review failed" }, { status: 500 });
  }
}
