export async function sendWhatsAppMessage(waPhone: string, message: string): Promise<void> {
  const number = waPhone.replace("@s.whatsapp.net", "");
  const res = await fetch(
    `${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`,
    {
      method: "POST",
      headers: {
        apikey: process.env.EVOLUTION_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ number, text: message }),
    }
  );
  if (!res.ok) {
    throw new Error(`Evolution API fout: ${res.status}`);
  }
}
