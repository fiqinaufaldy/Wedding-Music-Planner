const GOOGLE_SHEET_API_URL = "https://script.google.com/macros/s/AKfycbyYydScIHau6murFh_CYSpn3qOqZg-AqiTktmy_wo1Ru9WvvGeW_kUIj6_JC6Mz80mw/exec";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const response = await fetch(GOOGLE_SHEET_API_URL, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Google Apps Script returned HTTP ${response.status}`,
      });
    }

    const data = await response.text();

    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).send(data);
  } catch (error) {
    console.error("Google Sheet proxy error:", error);
    return res.status(502).json({
      error: "Unable to fetch Google Sheet data",
      detail: String(error?.message || error),
    });
  }
}
