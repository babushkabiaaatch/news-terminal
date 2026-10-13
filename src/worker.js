// News Terminal - thin edge proxy.
// Runs on Cloudflare Workers (free plan). It does NOT parse anything (free plan = 10 ms CPU),
// it only fetches allow-listed feeds, caches them at the edge, and hands the raw XML to the
// browser, which parses it. Your PC does not need to be on.

const gnews = (q) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:1d")}&hl=en-GB&gl=GB&ceid=GB:en`;

// id, display name, url, poll seconds. Edit freely; push to GitHub and it redeploys.
const FEEDS = [
  ["oilprice", "OilPrice", "https://oilprice.com/rss/main", 60],
  ["eia", "EIA", "https://www.eia.gov/rss/todayinenergy.xml", 300],
  ["rigzone", "Rigzone", "https://www.rigzone.com/news/rss/rigzone_latest.aspx", 90],
  ["utilitydive", "Utility Dive", "https://www.utilitydive.com/feeds/news/", 120],
  ["cnbc-energy", "CNBC Energy", "https://www.cnbc.com/id/19836768/device/rss/rss.html", 60],
  ["cnbc-markets", "CNBC Markets", "https://www.cnbc.com/id/10000664/device/rss/rss.html", 45],
  ["marketwatch", "MarketWatch", "https://feeds.marketwatch.com/marketwatch/topstories/", 60],
  ["investing", "Investing.com Commodities", "https://www.investing.com/rss/news_11.rss", 60],
  ["bbc-biz", "BBC Business", "https://feeds.bbci.co.uk/news/business/rss.xml", 90],
  ["yahoo", "Yahoo Finance", "https://finance.yahoo.com/news/rssindex", 60],
  ["gn-eu-gas", "GN: Gas & Power EU", gnews('TTF OR NBP OR "European gas" OR "German power"'), 120],
  ["gn-oil", "GN: Oil", gnews("Brent OR WTI OR OPEC crude oil price"), 120],
  ["gn-carbon", "GN: Carbon", gnews("EU carbon price EUA ETS"), 180],
  ["gn-h2", "GN: Hydrogen/Storage", gnews('hydrogen electrolyser OR "battery storage" OR "gas storage" Germany'), 180],
].map(([id, name, url, every]) => ({ id, name, url, every }));

const QUOTES = [
  ["Brent", "BZ=F"], ["WTI", "CL=F"], ["Henry Hub", "NG=F"], ["TTF", "TTF=F"],
  ["EUR/USD", "EURUSD=X"], ["S&P 500", "^GSPC"], ["DAX", "^GDAXI"],
];

const UA = "Mozilla/5.0 (compatible; NewsTerminal/1.0)";
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
      return json(FEEDS.map(({ id, name, every }) => ({ id, name, every })), 300);
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
