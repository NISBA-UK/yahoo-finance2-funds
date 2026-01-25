import { config } from "../config.js";

export default async function getFundImage(fundImageId) {
  const url = `${config.dataUrl}/collections/logos/records?filter=(id="${fundImageId}")`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Response status: ${response.status}`);
    }

    const result = await response.json();
    return `${result.items[0].collectionId}/${result.items[0].id}/${result.items[0].image}`;
  } catch (error) {
    console.error(error.message);
  }
}
