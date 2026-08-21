# First Search

Test that Navigator is working by running your first web search.

<div class="chat">
<div class="chat-msg user">Search for the best pizza places in New York</div>
<div class="chat-msg tool">`web_search` { "queries": ["best pizza NYC"], "limit": 3 }
<details><summary>Response</summary>

<pre>
**Query:** best pizza NYC
**Results (3):**
- **25 Best Pizza Places in NYC** [nyctaste.com](1)
  - Expert picks across all five boroughs
- **The Best Pizza in New York City** [eaterpi.com](2)
  - A complete guide to NYC's top pizzerias
- **Best Pizza in NYC, According to Chefs** [foodweekly.com](3)
  - Where professional chefs go for a slice
</pre>

</details>
</div>
<div class="chat-msg agent">Here's what I found:

- **25 Best Pizza Places in NYC** [nyctaste.com](1)
- **The Best Pizza in New York City** [eaterpi.com](2)
- **Best Pizza in NYC, According to Chefs** [foodweekly.com](3)
</div>
<div class="chat-msg user">Read more about the best pizza in NYC</div>
<div class="chat-msg tool">`web_fetch` { "ref_ids": [2] }
<details><summary>Response</summary>

<pre>
### The Best Pizzerias of New York City

The city's wide-ranging pizza landscape includes coal-fired,
Neapolitan, Sicilian, and New York-style slices.

Pizza as we know it showed up in New York City around the early
1900s at Lombardi's in Little Italy, though the city had precursors
served in bakeries the previous century. Lombardi's was followed
by Patsy's, Totonno's, and John's of Bleecker Street, all by
baker disciples of Gennaro Lombardi.

Today, the city's pizzaioli continue to innovate, creating new
varieties suited to the tastes and demands of customers.
</pre>

</details>
</div>
<div class="chat-msg agent">The article says pizza first came to NYC around the early 1900s at Lombardi's in Little Italy, followed by Patsy's, Totonno's, and John's of Bleecker Street — all founded by disciples of Gennaro Lombardi.
</div>
<div class="chat-msg user">Take a screenshot of the page</div>
<div class="chat-msg tool">`web_page_screenshot` { "ref_ids": [2], "quality": "low" }
<details><summary>Response</summary>

<pre>
Screenshot captured as base64 JPEG.
</pre>

</details>
</div>
<div class="chat-msg agent">Here's the screenshot:

*[Screenshot of the Eater NYC pizza guide]*
</div>
<div class="chat-msg user">When did pizza first come to New York?</div>
<div class="chat-msg agent">Pizza showed up in NYC around the early 1900s at Lombardi's in Little Italy. The city's pizzaioli continued from there, with Totonno's, John's of Bleecker Street, and others all founded by disciples of Gennaro Lombardi.</div>
<div class="chat-msg user">Read the article at nyctaste.com/best-pizza</div>
<div class="chat-msg tool">`web_fetch` { "urls": ["https://nyctaste.com/best-pizza"] }
<details><summary>Response</summary>

<pre>
### The Ultimate Guide to NYC Pizza

New York City is home to some of the best pizza in the world.
From the coal-oven classic at Lombardi's to the Neapolitan
perfection at Una Pizza Napoletana, there's something for
every pizza lover.
</pre>

</details>
</div>
<div class="chat-msg agent">The article covers NYC's best pizza spots — from Lombardi's coal-oven classics to Una Pizza Napoletana's Neapolitan pies.
</div>
<div class="chat-msg user">Research the best pizza styles and where to try them in NYC</div>
<div class="chat-msg tool">`web_search` { "queries": ["best pizza styles NYC", "Neapolitan vs NY style pizza", "coal fired pizza NYC"], "limit": 5 }
<details><summary>Response</summary>

<pre>
**Query:** best pizza styles NYC
**Results (5):**
- **NYC Pizza Styles Explained** [pizzaexpert.com](4)
  - From coal-oven to Neapolitan, a complete guide
- **Best Neapolitan Pizza in New York** [italianfood.com](5)
  - Top spots for authentic wood-fired pies
- **Coal-Fired Pizza: A NYC Tradition** [nyceats.com](6)
  - Where to find the city's best coal-oven slices
</pre>

</details>
</div>
<div class="chat-msg agent">Here's what I found about NYC pizza styles:

- **NYC Pizza Styles Explained** [pizzaexpert.com](4) — From coal-oven to Neapolitan, a complete guide
- **Best Neapolitan Pizza in New York** [italianfood.com](5) — Top spots for authentic wood-fired pies
- **Coal-Fired Pizza: A NYC Tradition** [nyceats.com](6) — Where to find the city's best coal-oven slices
</div>
<div class="chat-msg user">Tell me more about Neapolitan pizza</div>
<div class="chat-msg tool">`web_fetch` { "ref_ids": [5] }
<details><summary>Response</summary>

<pre>
### Best Neapolitan Pizza in New York

Neapolitan pizza is characterized by its thin, soft crust with
a puffy cornicione, San Marzano tomatoes, fresh mozzarella di
bufala, and basil. The dough requires 24-72 hour fermentation.

Top picks:
1. Una Pizza Napoletana — Lower East Side
2. Kesté Pizza — West Village
3. Motorino — East Village
</pre>

</details>
</div>
<div class="chat-msg agent">Neapolitan pizza has a thin, soft crust with a puffy edge, San Marzano tomatoes, fresh mozzarella, and basil. The dough ferments for 24-72 hours. Top picks include Una Pizza Napoletana, Kesté, and Motorino.
</div>
<div class="chat-msg user">Which of those has the best margherita?</div>
<div class="chat-msg agent">Una Pizza Napoletana — 50 Top Pizza named them the #1 pizzeria in the US five years running. Their margherita is considered one of the best in the world.
</div>
</div>

> **Note:** The agent's responses will vary depending on the model you use. The conversation above is one example — your agent may format results differently or ask follow-up questions based on its own reasoning.

## Reference IDs

Every search result gets a **reference ID** — the number in parentheses. These let you:

- **Fetch the page** without copying URLs: `web_fetch(ref_ids: [1])`
- **Screenshot it**: `web_page_screenshot(ref_ids: [1])`
- **Follow links** from the page: `web_page_links(ref_ids: [42])`

Reference IDs are session-local — they work until the server restarts.

## Tips

- Use multiple query variations for better coverage
- Reference IDs are faster than URLs — prefer them when possible
- The cache stores results for 5 minutes, so repeated queries are instant
- Use `bypassCache: true` for breaking news or live data

## Next Steps

- [Development Tools](/guides/dev-tools) — Try the browser devtools
- [Search Overview](/guides/search/overview) — Learn more about web_search
- [Extraction Overview](/guides/extraction/overview) — Understand web_fetch
- [Screenshot Overview](/guides/screenshots/overview) — Capture pages visually
