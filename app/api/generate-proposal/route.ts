import { NextRequest, NextResponse } from 'next/server';

const PROPOSALES_API_KEY = process.env.PROPOSALES_API_KEY || '';
const COMPANY_ID = parseInt(process.env.PROPOSALES_COMPANY_ID || '5262');

async function callPlan(rfpText: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rfpText })
  });
  return res.json();
}

async function getAllProducts() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/products`);
  const data = await res.json();
  return data;
}

export async function POST(request: NextRequest) {
  try {
    const { rfpText } = await request.json();

    if (!rfpText) {
      return NextResponse.json({ error: "RFP text is required" }, { status: 400 });
    }

    console.log("📋 Hämtar plan...");
    const planData = await callPlan(rfpText);
    const selectedProducts = planData.plan?.selectedProducts || [];
    
    const allProducts = await getAllProducts();

    const blocks = [];
    for (const product of selectedProducts) {
      const found = allProducts.data.find((p: any) => p.title.en === product.title);
      if (found) {
        blocks.push({ content_id: found.id, type: "product-block" });
        console.log(`  ✅ ${product.title} (ID: ${found.id})`);
      } else {
        console.log(`  ❌ Hittade inte: ${product.title}`);
      }
    }

    if (blocks.length === 0) {
      return NextResponse.json({ error: "No valid products found" }, { status: 400 });
    }

    console.log("📝 Skapar proposal i Proposales...");
    
    const proposalBody = {
      company_id: COMPANY_ID,
      language: "en",
      title_md: `Proposal for: ${rfpText.substring(0, 50)}`,
      description_md: `## Event Proposal\n\n${planData.plan?.summary || ""}\n\n**Estimated total:** ${planData.plan?.totalEstimatedPrice || 0} EUR`,
      blocks: blocks,
      recipient: {
        email: "customer@example.com",
        company_name: "Event Customer"
      },
      invoicing_enabled: false
    };

    const proposalResponse = await fetch("https://api.proposales.com/v3/proposals", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${PROPOSALES_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(proposalBody)
    });

    if (!proposalResponse.ok) {
      const error = await proposalResponse.text();
      console.error("Proposales error:", error);
      return NextResponse.json({ error: "Failed to create proposal" }, { status: 500 });
    }

    const proposalData = await proposalResponse.json();
    
    return NextResponse.json({
      success: true,
      proposalUrl: proposalData.proposal?.url,
      proposalUuid: proposalData.proposal?.uuid,
      plan: planData.plan,
      blocksUsed: blocks.length
    });

  } catch (error) {
    console.error("Generate error:", error);
    return NextResponse.json({ error: "Failed to generate proposal" }, { status: 500 });
  }
}
