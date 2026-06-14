
// ─────────────────────────────────────────────────────────────
// CariSchool — Messenger Webhook
// Vercel Serverless Function: /api/messenger
//
// Two jobs:
//   GET  → Facebook webhook verification (one-time setup)
//   POST → Send claim notification to admin via Messenger
// ─────────────────────────────────────────────────────────────

const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN      = process.env.FB_VERIFY_TOKEN;
const ADMIN_FB_ID       = process.env.FB_ADMIN_ID; // your personal FB ID

// ── Send a Messenger message ──────────────────────────────────
async function sendMessage(recipientId, text) {
  const res = await fetch(
    `https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
    {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message:   { text },
      }),
    }
  );
  return res.json();
}

// ── Main handler ─────────────────────────────────────────────
export default async function handler(req, res) {

  // ── GET: Facebook webhook verification ──
  if (req.method === "GET") {
    const mode      = req.query["hub.mode"];
    const token     = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("✅ Webhook verified");
      return res.status(200).send(challenge);
    }
    return res.status(403).send("Forbidden");
  }

  // ── POST: Send claim notification to admin ──
  if (req.method === "POST") {
    const { schoolName, schoolCode, district, state, contactName, contactPhone, plan } = req.body;

    if (!schoolName) {
      return res.status(400).json({ error: "Missing schoolName" });
    }

    const planLabel = plan === "premium" ? "⭐ PREMIUM" : "🆓 Free";

    const message =
`🏫 TUNTUTAN SEKOLAH BAHARU!
New School Claim Received!

📋 Sekolah / School:
${schoolName} (${schoolCode || "–"})

📍 Lokasi / Location:
${district || "–"}, ${state || "–"}

👤 Pegawai / Contact:
${contactName || "–"} · ${contactPhone || "–"}

${planLabel}

🔗 Semak di Admin Panel:
https://www.carischools.com/admin.html`;

    try {
      await sendMessage(ADMIN_FB_ID, message);
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error("Messenger error:", err);
      return res.status(500).json({ error: "Failed to send message" });
    }
  }

  return res.status(405).send("Method not allowed");
}
