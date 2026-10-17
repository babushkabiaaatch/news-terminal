// Newslight - thin edge proxy.
// Runs on Cloudflare Workers (free plan). It does NOT parse anything (free plan = 10 ms CPU),
// it only fetches allow-listed feeds, caches them at the edge, and hands the raw XML to the
// browser, which parses it. Your PC does not need to be on.

const gnews = (q) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:1d")}&hl=en-GB&gl=GB&ceid=GB:en`;

// id, display name, url, poll seconds. Edit freely; push to GitHub and it redeploys.
const FEEDS = [
  // Oil, gas, power, energy transition
  ["oilprice", "OilPrice", "https://oilprice.com/rss/main", 60],
  ["eia", "EIA", "https://www.eia.gov/rss/todayinenergy.xml", 300],
  ["rigzone", "Rigzone", "https://www.rigzone.com/news/rss/rigzone_latest.aspx", 90],
  ["utilitydive", "Utility Dive", "https://www.utilitydive.com/feeds/news/", 120],
  ["cnbc-energy", "CNBC Energy", "https://www.cnbc.com/id/19836768/device/rss/rss.html", 60],
  ["investing", "Investing.com Commodities", "https://www.investing.com/rss/news_11.rss", 60],
  ["euractiv", "Euractiv Energy", "https://www.euractiv.com/sections/eet/feed/", 120],
  ["eu-energy", "EU DG Energy", "https://energy.ec.europa.eu/node/2/rss_en", 300],
  ["energylive", "Energy Live News", "https://www.energylivenews.com/feed", 120],
  ["storage-news", "Energy Storage News", "https://www.energy-storage.news/feed", 120],
  ["powermag", "POWER Magazine", "https://www.powermag.com/feed", 180],
  // Stocks and markets
  ["cnbc-top", "CNBC Top News", "https://www.cnbc.com/id/100003114/device/rss/rss.html", 45],
  ["cnbc-markets", "CNBC Markets", "https://www.cnbc.com/id/10000664/device/rss/rss.html", 45],
  ["marketwatch", "MarketWatch", "https://feeds.marketwatch.com/marketwatch/topstories/", 60],
  ["marketpulse", "MarketWatch Pulse", "https://feeds.marketwatch.com/marketwatch/marketpulse/", 45],
  ["investing-stocks", "Investing.com Stocks", "https://www.investing.com/rss/news_25.rss", 60],
  ["seekingalpha", "Seeking Alpha", "https://seekingalpha.com/market_currents.xml", 90],
  // Quant finance (these are always tagged QUANT)
  ["arxiv-rm", "arXiv Risk Mgmt", "https://rss.arxiv.org/rss/q-fin.RM", 1800, "QUANT"],
  ["arxiv-pr", "arXiv Pricing", "https://rss.arxiv.org/rss/q-fin.PR", 1800, "QUANT"],
  ["quantocracy", "Quantocracy", "https://quantocracy.com/feed/", 600, "QUANT"],
  ["alphaarchitect", "Alpha Architect", "https://alphaarchitect.com/feed/", 900, "QUANT"],
  ["quantpedia", "Quantpedia", "https://quantpedia.com/feed/", 900, "QUANT"],
].map(([id, name, url, every, tag]) => ({ id, name, url, every, tag }));

const QUOTES = [
  ["Brent", "BZ=F"], ["WTI", "CL=F"], ["Henry Hub", "NG=F"], ["TTF", "TTF=F"],
  ["EUR/USD", "EURUSD=X"], ["S&P 500", "^GSPC"], ["DAX", "^GDAXI"],
];

const UA = "Mozilla/5.0 (compatible; Newslight/1.0)";
const CORS = { "Access-Control-Allow-Origin": "*" };

const json = (obj, maxAge = 0) =>
  new Response(JSON.stringify(obj), {
    headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${maxAge}`, ...CORS },
  });

async function getQuotes() {
  const res = await Promise.all(
    QUOTES.map(async ([label, sym]) => {
      try {
        const r = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`,
          { headers: { "User-Agent": UA }, cf: { cacheTtl: 15, cacheEverything: true } }
        );
        if (!r.ok) return null;
        const m = (await r.json()).chart.result[0].meta;
        const px = m.regularMarketPrice;
        const prev = m.chartPreviousClose ?? m.previousClose ?? px;
        return { label, price: px, chg: px - prev, pct: prev ? ((px - prev) / prev) * 100 : 0 };
      } catch {
        return null;
      }
    })
  );
  return res.filter(Boolean);
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/api/feeds") {
      return json(FEEDS.map(({ id, name, every, tag }) => ({ id, name, every, tag })), 300);
    }

    if (url.pathname === "/api/feed") {
      const f = FEEDS.find((x) => x.id === url.searchParams.get("id"));
      if (!f) return new Response("unknown feed", { status: 404, headers: CORS });
      try {
        const r = await fetch(f.url, {
          headers: { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
          cf: { cacheTtl: Math.min(f.every, 45), cacheEverything: true },
        });
        return new Response(r.body, {
          status: r.status,
          headers: {
            "Content-Type": r.headers.get("content-type") || "text/xml; charset=utf-8",
            "Cache-Control": "public, max-age=20",
            ...CORS,
          },
        });
      } catch {
        return new Response("upstream error", { status: 502, headers: CORS });
      }
    }

    if (url.pathname === "/api/quotes") {
      return json(await getQuotes(), 10);
    }

    return new Response("not found", { status: 404 });
  },
};
