/**
 * Parses EMVCo / BharatQR / Merchant static & dynamic QR code payloads
 * into standard UPI deep-link URLs (upi://pay?pa=...&pn=...)
 */
export function parseEmvcoQr(payload: string): string | null {
  try {
    const clean = payload.trim();
    if (!clean.startsWith("000201") && !clean.startsWith("000202")) {
      return null;
    }

    const tags: Record<string, string> = {};
    let i = 0;
    while (i < clean.length) {
      if (i + 4 > clean.length) break;
      const tag = clean.substring(i, i + 2);
      const lengthStr = clean.substring(i + 2, i + 4);
      const length = parseInt(lengthStr, 10);
      if (isNaN(length) || length < 0 || i + 4 + length > clean.length) break;
      
      const value = clean.substring(i + 4, i + 4 + length);
      tags[tag] = value;
      i += 4 + length;
    }

    // Look for UPI VPA in Merchant Account Information (Tags 26 through 51)
    let upiId = "";
    for (let tagNum = 26; tagNum <= 51; tagNum++) {
      const tagKey = tagNum.toString().padStart(2, "0");
      if (tags[tagKey]) {
        const subPayload = tags[tagKey];
        let j = 0;
        while (j < subPayload.length) {
          if (j + 4 > subPayload.length) break;
          const subTag = subPayload.substring(j, j + 2);
          const subLen = parseInt(subPayload.substring(j + 2, j + 4), 10);
          if (isNaN(subLen) || subLen < 0 || j + 4 + subLen > subPayload.length) break;
          
          const subVal = subPayload.substring(j + 4, j + 4 + subLen);
          // VPA is usually in 01 or 03, but let's just aggressively find any string with '@'
          if (subVal.includes("@")) {
            upiId = subVal;
            break;
          }
          j += 4 + subLen;
        }
        if (upiId) {
          break;
        }
      }
    }

    const merchantName = tags["59"] || "";
    const mcc = tags["52"] || "";
    const amount = tags["54"] || "";
    const currency = tags["53"] || "356";
    const currencyCode = currency === "356" ? "INR" : currency;

    if (!upiId) {
      return null;
    }

    const params = new URLSearchParams();
    params.set("pa", upiId);
    if (merchantName) params.set("pn", merchantName);
    if (mcc) params.set("mc", mcc);
    if (amount) params.set("am", amount);
    params.set("cu", currencyCode);

    return `upi://pay?${params.toString()}`;
  } catch (err) {
    console.error("Failed to parse EMVCo QR code", err);
    return null;
  }
}
