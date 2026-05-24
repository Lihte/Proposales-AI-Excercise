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

function checkDates(rfpDates: string, proposalText: string): number {
  if (!rfpDates) return 100;
  return proposalText.toLowerCase().includes(rfpDates.toLowerCase()) ? 100 : 0;
}

function checkGuestCount(rfpGuestCount: number, proposalText: string): number {
  if (!rfpGuestCount) return 100;
  return proposalText.includes(rfpGuestCount.toString()) ? 100 : 0;
}

function checkBudget(rfpBudget: any, proposalValue: number): number {
  if (!rfpBudget || !rfpBudget.min) return 100;
  if (proposalValue === 0) return 0;
  if (proposalValue >= rfpBudget.min && proposalValue <= rfpBudget.max) return 100;
  if (proposalValue < rfpBudget.min) return 50;
  return 25;
}

export async function POST(request: NextRequest) {
  try {
    const { proposalUuid, rfpText } = await request.json();

    if (!proposalUuid || !rfpText) {
      return NextResponse.json({ error: "proposalUuid and rfpText are required" }, { status: 400 });
    }

    console.log("📦 Hämtar proposal...");
    const proposal = await getProposal(proposalUuid);
    
    console.log("📋 Extraherar RFP...");
    const rfp = await extractRFP(rfpText);
    
    const proposalText = `${proposal?.title || ''} ${proposal?.description_md || ''}`;
    
    const dateScore = checkDates(rfp.dates, proposalText);
    const guestScore = checkGuestCount(rfp.guestCount, proposalText);
    const budgetScore = checkBudget(rfp.budgetRange, proposal?.value_with_tax || 0);
    
    const prompt = `
Du är en utvärderare av event-proposals.

**RFP:** ${rfpText}

**Proposal:**
Titel: ${proposal.title || 'N/A'}
Beskrivning: ${proposal.description_md || 'N/A'}
Produkter: ${proposal.blocks?.map((b: any) => b.title).join(', ') || 'Inga'}
Total värde: ${proposal.value_with_tax || 0} EUR

Returnera JSON:
{
  "completeness": 0-100,
  "productRelevance": 0-100,
  "requirementCoverage": 0-100,
  "justification": "text"
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
    const llmScores = jsonMatch ? JSON.parse(jsonMatch[0]) : { completeness: 0, productRelevance: 0, requirementCoverage: 0, justification: "" };

    const finalScores = {
      completeness: llmScores.completeness || 0,
      productRelevance: llmScores.productRelevance || 0,
      pricingAccuracy: budgetScore,
      requirementCoverage: Math.round((dateScore + guestScore + (llmScores.requirementCoverage || 0)) / 3)
    };
    
    const totalScore = Math.round(
      (finalScores.completeness + finalScores.productRelevance + finalScores.pricingAccuracy + finalScores.requirementCoverage) / 4
    );

    return NextResponse.json({
      proposalUuid,
      scores: finalScores,
      totalScore,
      heuristics: { dateScore, guestScore, budgetScore },
      llmJustification: llmScores.justification || ""
    });

  } catch (error) {
    console.error("Evaluation error:", error);
    return NextResponse.json({ error: "Evaluation failed" }, { status: 500 });
  }
}
