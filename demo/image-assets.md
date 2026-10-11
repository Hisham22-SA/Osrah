# Demo image assets

Current family branding uses readable Arabic name-based wordmarks with varied frames, colors, and light botanical decoration. Active files are `android/app/src/main/res/drawable-nodpi/family_1_wordmark.webp` through `family_10_wordmark.webp`. These are deterministic typography designs rather than AI-generated logos. The earlier vector symbols below are retained as previous assets, and a generic house logo is the fallback for new families. Preview: `releases/family-wordmarks.jpg`.

Ten family logos are native Android vector marks in `android/app/src/main/res/drawable/family_1_logo.xml` through `family_10_logo.xml`: cooking pot, bakery, leaf, dumpling, spice star, wheat, embroidery needle, rose, palm, and gift. Each mark has its own muted brand color.

Thirty original product photographs are illustrative synthetic catalog images, not photographs supplied by the families. Six newly added dishes have distinct generated photos, and the renamed Najdi jareesh has a refreshed photo, in `android/app/src/main/res/drawable-nodpi/food_*.jpg`: Najdi, white, and red jareesh; qursan; chicken kabsa; Taif saleeg; and date kleija. Product images are bundled for offline display. Family cards use a representative product photo and overlay the family's logo.

Prompt template: Generate ONE square realistic premium catalog photograph of the named product. Fictional Saudi productive-family marketplace demo. Centered single product arrangement, generous margins, neutral warm cream background, soft natural window light, realistic artisan details, three-quarter overhead angle. No people, no text, no logos or watermarks.

The original product subjects and prompts are recorded in `demo/image-prompts.json`; the added subjects are described above.
