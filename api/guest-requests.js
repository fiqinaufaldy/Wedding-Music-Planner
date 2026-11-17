const GOOGLE_SHEET_API_URL = "https://script.google.com/macros/s/AKfycbyYydScIHau6murFh_CYSpn3qOqZg-AqiTktmy_wo1Ru9WvvGeW_kUIj6_JC6Mz80mw/exec";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const url = `${GOOGLE_SHEET_API_URL}?sheet=guest`;
      const response = await fetch(url, {
        method: "GET",
        cache: "no-store",
        redirect: "follow",
      });
      const data = await response.text();

      res.setHeader("Cache-Control", "no-store, max-age=0");
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Access-Control-Allow-Origin", "*");
      return res.status(response.status).send(data);
    }

    if (req.method === "POST") {
      const response = await fetch(GOOGLE_SHEET_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body || {}),
        redirect: "follow",
      });
      const data = await response.text();

      res.setHeader("Cache-Control", "no-store, max-age=0");
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Access-Control-Allow-Origin", "*");
      return res.status(response.status).send(data);
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (error) {
    console.error("Guest Request proxy error:", error);
    return res.status(502).json({
      error: "Unable to reach Google Sheet",
      detail: String(error?.message || error),
    });
  }
}
