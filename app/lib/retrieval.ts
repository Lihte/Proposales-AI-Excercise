import { LocalIndex } from 'vectra';
import { pipeline } from '@huggingface/transformers';
import path from 'path';

let embeddingModel: any = null;
let index: LocalIndex | null = null;

async function getEmbeddingModel() {
  if (!embeddingModel) {
    console.log("📥 Laddar embeddings-modell (första gången tar ~15 sek)...");
    embeddingModel = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return embeddingModel;
}

export async function createEmbedding(text: string): Promise<number[]> {
  const model = await getEmbeddingModel();
  const result = await model(text, { pooling: 'mean', normalize: true });
  return Array.from(result.data);
}

async function getIndex() {
  if (!index) {
    const indexPath = path.join(process.cwd(), 'vectra-index');
    index = new LocalIndex(indexPath);
    if (!await index.isIndexCreated()) {
      await index.createIndex();
    }
  }
  return index;
}

async function fetchProducts() {
  const response = await fetch("http://localhost:3000/api/products");
  const data = await response.json();
  return data.data || [];
}

export async function buildIndex() {
  console.log("📦 Hämtar produkter...");
  const products = await fetchProducts();
  
  if (products.length === 0) {
    console.log("⚠️ Inga produkter hittades!");
    return null;
  }
  
  const idx = await getIndex();
  
  console.log("🔍 Skapar embeddings för " + products.length + " produkter...");
  
  const existingItems = await idx.listItems();
  for (const item of existingItems) {
    await idx.deleteItem(item.id);
  }
  
  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const title = product.title?.en || product.title || '';
    const description = product.description?.en || product.description || '';
    const textToEmbed = title + " " + description;
    
    console.log("  " + (i + 1) + "/" + products.length + ": " + title);
    const embedding = await createEmbedding(textToEmbed);
    
    await idx.insertItem({
      id: (product.product_id || product.id).toString(),
      vector: embedding,
      metadata: {
        title: title,
        description: description,
        product_id: product.product_id || product.id
      }
    });
  }
  
  console.log("✅ Index skapat! " + products.length + " produkter sparade.");
  return true;
}

export async function searchProducts(query: string, topK: number = 5) {
  const idx = await getIndex();
  const queryEmbedding = await createEmbedding(query);
  const results = await idx.queryItems(queryEmbedding, topK);
  
  return results.map(r => ({
    title: r.item.metadata?.title,
    description: r.item.metadata?.description,
    score: r.score
  }));
}
